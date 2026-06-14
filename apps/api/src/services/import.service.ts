/**
 * @fileoverview Import service — all business logic for Excel imports.
 *
 * Implements three import types:
 *   1. Location Import  — creates hierarchical location tree
 *   2. SKU Import       — upserts SKU master data
 *   3. Opening Stock    — posts opening_balance events via Movement Engine
 *
 * Design rules:
 *   - validate() NEVER writes to the database
 *   - import() ONLY runs after validate() returns a clean result
 *   - Each import runs inside a single database transaction
 *   - Audit logs are written after a successful commit
 */

import { db, locations, sites, skus, skuCategories, stockLedger, inventoryBalances } from '@wms/db'
import { eq, and, isNull } from 'drizzle-orm'
import {
  locationImportRowSchema,
  skuImportRowSchema,
  openingStockImportRowSchema,
  type LocationImportRow,
  type SkuImportRow,
  type OpeningStockImportRow,
  type LocationImportValidationResult,
  type SkuImportValidationResult,
  type OpeningStockImportValidationResult,
} from '@wms/shared'
import { parseExcelBuffer } from '../utils/excel.js'
import { writeAudit } from '../utils/audit.js'

// ─────────────────────────────────────────────────────────────
// LOCATION IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * Validate a Location Import Excel buffer.
 * Returns valid rows + row-level errors. Does NOT write to DB.
 */
export async function validateLocationImport(
  buffer: Buffer,
  orgId: string,
): Promise<LocationImportValidationResult> {
  const { rows } = await parseExcelBuffer(buffer)

  const validRows: LocationImportRow[] = []
  const errors: LocationImportValidationResult['errors'] = []

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2 // row 1 = headers
    const raw = rows[i]!

    const parsed = locationImportRowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        data: raw,
        errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      })
    } else {
      validRows.push(parsed.data)
    }
  }

  return {
    valid: validRows,
    errors,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: errors.length,
    },
  }
}

/**
 * Execute a Location Import.
 * All rows must be pre-validated (call validateLocationImport first).
 *
 * Algorithm:
 *   For each row, walk the site → building → floor → rack → bin → shelf hierarchy.
 *   At each level, look up or create the location node.
 *   Skip nodes that already exist (idempotent).
 */
export async function executeLocationImport(
  rows: LocationImportRow[],
  orgId: string,
  userId: string,
  ipAddress: string,
): Promise<{
  created: number
  skipped: number
  importId: string
}> {
  let created = 0
  let skipped = 0

  // All rows in a single transaction for atomicity
  await db.transaction(async (tx) => {
    // Cache of site codes → site records (avoid re-querying)
    const siteCache = new Map<string, { id: string; code: string }>()

    // Cache of location paths → location IDs (avoid re-querying within same tx)
    const locationPathCache = new Map<string, string>()

    for (const row of rows) {
      // 1. Resolve site by name (case-insensitive match on site name or code)
      const siteName = row.site.trim()

      if (!siteCache.has(siteName.toLowerCase())) {
        const [siteRow] = await tx
          .select({ id: sites.id, code: sites.code, name: sites.name })
          .from(sites)
          .where(and(eq(sites.orgId, orgId), eq(sites.isActive, true)))

        // Find matching site (name or code match)
        const allSites = await tx
          .select({ id: sites.id, code: sites.code, name: sites.name })
          .from(sites)
          .where(and(eq(sites.orgId, orgId), eq(sites.isActive, true)))

        for (const s of allSites) {
          siteCache.set(s.name.toLowerCase(), { id: s.id, code: s.code })
          siteCache.set(s.code.toLowerCase(), { id: s.id, code: s.code })
        }
      }

      const siteMatch = siteCache.get(siteName.toLowerCase())
      if (!siteMatch) {
        throw new Error(`Site '${siteName}' not found. Create the site first.`)
      }

      // 2. Build hierarchy from row columns
      const levels: Array<{
        code: string
        name: string
        level: 'building' | 'floor' | 'rack' | 'bin' | 'shelf' | 'store'
        isStorage: boolean
      }> = []

      if (row.building) {
        levels.push({
          code: sanitizeCode(row.building),
          name: row.building.trim(),
          level: 'building',
          isStorage: false,
        })
      }
      if (row.floor) {
        levels.push({
          code: sanitizeCode(row.floor),
          name: row.floor.trim(),
          level: 'floor',
          isStorage: false,
        })
      }
      if (row.rack) {
        levels.push({
          code: sanitizeCode(row.rack),
          name: row.rack.trim(),
          level: 'rack',
          isStorage: false,
        })
      }
      if (row.bin) {
        levels.push({
          code: sanitizeCode(row.bin),
          name: row.bin.trim(),
          level: 'bin',
          isStorage: !row.shelf, // bin is storage if no shelf
        })
      }
      if (row.shelf) {
        levels.push({
          code: sanitizeCode(row.shelf),
          name: row.shelf.trim(),
          level: 'shelf',
          isStorage: true, // shelf is always storage
        })
      }

      // 3. Walk the hierarchy, creating nodes as needed
      let currentPath = ''
      let currentParentId: string | null = null

      for (const levelNode of levels) {
        const nodePath = currentPath
          ? `${currentPath}/${levelNode.code}`
          : `${siteMatch.code}/${levelNode.code}`

        const cacheKey = `${siteMatch.id}:${nodePath}`

        if (locationPathCache.has(cacheKey)) {
          currentParentId = locationPathCache.get(cacheKey)!
          currentPath = nodePath
          continue
        }

        // Check if this node already exists in DB
        const [existing] = await tx
          .select({ id: locations.id })
          .from(locations)
          .where(and(eq(locations.siteId, siteMatch.id), eq(locations.path, nodePath)))

        if (existing) {
          locationPathCache.set(cacheKey, existing.id)
          currentParentId = existing.id
          currentPath = nodePath
          skipped++
          continue
        }

        // Create the node
        const [newNode] = await tx
          .insert(locations)
          .values({
            siteId: siteMatch.id,
            parentId: currentParentId || undefined,
            name: levelNode.name,
            code: levelNode.code,
            level: levelNode.level,
            path: nodePath,
            isStorage: levelNode.isStorage,
            isActive: true,
          })
          .returning({ id: locations.id })

        if (!newNode) throw new Error(`Failed to create location: ${nodePath}`)

        locationPathCache.set(cacheKey, newNode.id)
        currentParentId = newNode.id
        currentPath = nodePath
        created++
      }
    }
  })

  const importId = crypto.randomUUID()

  // Audit log (fire-and-forget)
  writeAudit({
    orgId,
    userId,
    action: 'create',
    entityType: 'location_import',
    entityId: importId,
    changes: { after: { created, skipped, rows: rows.length } },
    ipAddress,
  }).catch(() => {})

  return { created, skipped, importId }
}

// ─────────────────────────────────────────────────────────────
// SKU IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * Validate a SKU Import Excel buffer.
 * Returns valid rows + errors. Does NOT write to DB.
 */
export async function validateSkuImport(
  buffer: Buffer,
  orgId: string,
): Promise<SkuImportValidationResult> {
  const { rows } = await parseExcelBuffer(buffer)

  const validRows: SkuImportRow[] = []
  const errors: SkuImportValidationResult['errors'] = []

  // Track duplicate SKU codes within the file
  const seenCodes = new Set<string>()

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const raw = rows[i]!

    const parsed = skuImportRowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        skuCode: String(raw['sku_code'] ?? ''),
        data: raw,
        errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      })
      continue
    }

    const code = parsed.data.sku_code.toUpperCase()

    // Check for duplicates within the same file
    if (seenCodes.has(code)) {
      errors.push({
        row: rowNum,
        skuCode: code,
        data: raw,
        errors: [`Duplicate SKU Code '${code}' in this file`],
      })
      continue
    }

    seenCodes.add(code)
    validRows.push(parsed.data)
  }

  return {
    valid: validRows,
    errors,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: errors.length,
      skipped: 0,
    },
  }
}

/**
 * Execute a SKU Import.
 * Existing SKUs are updated. New SKUs are created.
 */
export async function executeSkuImport(
  rows: SkuImportRow[],
  orgId: string,
  userId: string,
  ipAddress: string,
): Promise<{
  created: number
  updated: number
  importId: string
}> {
  let created = 0
  let updated = 0

  await db.transaction(async (tx) => {
    // Build category code → ID map
    const allCategories = await tx
      .select({ id: skuCategories.id, code: skuCategories.code })
      .from(skuCategories)
      .where(eq(skuCategories.orgId, orgId))

    const categoryMap = new Map(allCategories.map((c) => [c.code.toUpperCase(), c.id]))

    for (const row of rows) {
      const skuCode = row.sku_code.toUpperCase()
      const categoryId = row.category_code
        ? (categoryMap.get(row.category_code.toUpperCase()) ?? null)
        : null

      // Check if SKU already exists
      const [existing] = await tx
        .select({ id: skus.id, skuCode: skus.skuCode })
        .from(skus)
        .where(and(eq(skus.skuCode, skuCode), eq(skus.orgId, orgId), isNull(skus.deletedAt)))

      if (existing) {
        // Update existing SKU
        await tx
          .update(skus)
          .set({
            name: row.name,
            description: row.description ?? null,
            categoryId,
            skuType: row.sku_type,
            uom: row.uom,
            weightKg: row.weight_kg ? String(row.weight_kg) : null,
            hsnCode: row.hsn_code ?? null,
            barcode: row.barcode ?? null,
            reorderPoint: String(row.reorder_point),
            reorderQty: String(row.reorder_qty),
            leadTimeDays: row.lead_time_days,
            isBatchTracked: row.is_batch_tracked,
            updatedAt: new Date(),
          })
          .where(eq(skus.id, existing.id))

        updated++
      } else {
        // Create new SKU
        await tx
          .insert(skus)
          .values({
            orgId,
            skuCode,
            name: row.name,
            description: row.description ?? null,
            categoryId,
            skuType: row.sku_type,
            uom: row.uom,
            weightKg: row.weight_kg ? String(row.weight_kg) : null,
            hsnCode: row.hsn_code ?? null,
            barcode: row.barcode ?? null,
            reorderPoint: String(row.reorder_point),
            reorderQty: String(row.reorder_qty),
            leadTimeDays: row.lead_time_days,
            isBatchTracked: row.is_batch_tracked,
            createdBy: userId,
            isActive: true,
          })

        created++
      }
    }
  })

  const importId = crypto.randomUUID()

  writeAudit({
    orgId,
    userId,
    action: 'create',
    entityType: 'sku_import',
    entityId: importId,
    changes: { after: { created, updated, rows: rows.length } },
    ipAddress,
  }).catch(() => {})

  return { created, updated, importId }
}

// ─────────────────────────────────────────────────────────────
// OPENING STOCK IMPORT
// ─────────────────────────────────────────────────────────────

/**
 * Validate an Opening Stock Import Excel buffer.
 * Cross-validates that SKU codes and location paths exist in DB.
 */
export async function validateOpeningStockImport(
  buffer: Buffer,
  orgId: string,
): Promise<OpeningStockImportValidationResult> {
  const { rows } = await parseExcelBuffer(buffer)

  const validRows: OpeningStockImportRow[] = []
  const errors: OpeningStockImportValidationResult['errors'] = []

  // Pre-fetch SKU codes for this org
  const existingSkus = await db
    .select({ id: skus.id, skuCode: skus.skuCode })
    .from(skus)
    .where(and(eq(skus.orgId, orgId), isNull(skus.deletedAt), eq(skus.isActive, true)))

  const skuCodeSet = new Set(existingSkus.map((s) => s.skuCode.toUpperCase()))

  // Pre-fetch storage location paths for this org
  const existingLocations = await db
    .select({ id: locations.id, path: locations.path, siteCode: sites.code })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(sites.orgId, orgId), eq(locations.isStorage, true), eq(locations.isActive, true)))

  const locationPathSet = new Set(existingLocations.map((l) => l.path.toLowerCase()))

  for (let i = 0; i < rows.length; i++) {
    const rowNum = i + 2
    const raw = rows[i]!
    const rowErrors: string[] = []

    const parsed = openingStockImportRowSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push({
        row: rowNum,
        skuCode: String(raw['sku_code'] ?? ''),
        data: raw,
        errors: parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`),
      })
      continue
    }

    const { sku_code, location_path } = parsed.data

    // Cross-validate SKU code
    if (!skuCodeSet.has(sku_code.toUpperCase())) {
      rowErrors.push(`SKU Code '${sku_code}' does not exist in the system`)
    }

    // Cross-validate location path (must be a storage location)
    if (!locationPathSet.has(location_path.toLowerCase())) {
      rowErrors.push(
        `Location path '${location_path}' does not exist or is not a storage location`,
      )
    }

    if (rowErrors.length > 0) {
      errors.push({
        row: rowNum,
        skuCode: sku_code,
        data: raw,
        errors: rowErrors,
      })
    } else {
      validRows.push(parsed.data)
    }
  }

  return {
    valid: validRows,
    errors,
    summary: {
      totalRows: rows.length,
      validRows: validRows.length,
      errorRows: errors.length,
    },
  }
}

/**
 * Execute Opening Stock Import.
 * Posts opening_balance events via the stock_ledger (trigger maintains balances).
 *
 * Skips rows where an opening_balance already exists for (skuId, locationId).
 */
export async function executeOpeningStockImport(
  rows: OpeningStockImportRow[],
  orgId: string,
  userId: string,
  ipAddress: string,
): Promise<{
  posted: number
  skipped: number
  importId: string
}> {
  let posted = 0
  let skipped = 0

  // Pre-load all needed references outside the transaction loop
  const existingSkus = await db
    .select({ id: skus.id, skuCode: skus.skuCode, uom: skus.uom })
    .from(skus)
    .where(and(eq(skus.orgId, orgId), isNull(skus.deletedAt)))

  const skuByCode = new Map(existingSkus.map((s) => [s.skuCode.toUpperCase(), s]))

  const existingLocations = await db
    .select({ id: locations.id, path: locations.path, siteId: locations.siteId })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(sites.orgId, orgId), eq(locations.isStorage, true)))

  const locationByPath = new Map(existingLocations.map((l) => [l.path.toLowerCase(), l]))

  await db.transaction(async (tx) => {
    for (const row of rows) {
      const skuRecord = skuByCode.get(row.sku_code.toUpperCase())
      const locationRecord = locationByPath.get(row.location_path.toLowerCase())

      if (!skuRecord || !locationRecord) {
        // Should not happen — validated before this call, but guard anyway
        skipped++
        continue
      }

      // Check if opening balance already exists
      const [existing] = await tx
        .select({ id: stockLedger.id })
        .from(stockLedger)
        .where(
          and(
            eq(stockLedger.orgId, orgId),
            eq(stockLedger.skuId, skuRecord.id),
            eq(stockLedger.locationId, locationRecord.id),
            eq(stockLedger.eventType, 'opening_balance'),
          ),
        )

      if (existing) {
        skipped++
        continue
      }

      // Post the opening balance
      await tx.insert(stockLedger).values({
        orgId,
        eventType: 'opening_balance',
        skuId: skuRecord.id,
        locationId: locationRecord.id,
        siteId: locationRecord.siteId,
        qty: String(row.quantity),
        uom: skuRecord.uom,
        inventoryState: 'available',
        performedBy: userId,
        notes: row.remarks ?? 'Imported via Opening Stock Import',
        referenceType: 'import',
      })

      posted++
    }
  })

  const importId = crypto.randomUUID()

  writeAudit({
    orgId,
    userId,
    action: 'post',
    entityType: 'opening_stock_import',
    entityId: importId,
    changes: { after: { posted, skipped, rows: rows.length } },
    ipAddress,
  }).catch(() => {})

  return { posted, skipped, importId }
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Convert a human-readable name to a safe location code.
 * Example: "Zone A - Level 2" → "ZONE-A-LEVEL-2"
 */
function sanitizeCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
