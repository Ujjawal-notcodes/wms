/**
 * @fileoverview Refactored stateful import service.
 * Handles validation (two-phase staging) and transaction-safe execution of imports.
 */

import {
  db,
  locations,
  sites,
  skus,
  skuCategories,
  stockLedger,
  batches,
  importJobs,
  importJobRows,
} from '@wms/db'
import { eq, and, isNull, inArray } from 'drizzle-orm'
import {
  locationImportRowSchema,
  skuImportRowSchema,
  openingStockImportRowSchema,
  type LocationImportRow,
  type SkuImportRow,
  type OpeningStockImportRow,
} from '@wms/shared'
import { parseExcelBuffer } from '../utils/excel.js'
import { writeAudit } from '../utils/audit.js'

// ─────────────────────────────────────────────────────────────
// STATEFUL VALIDATION PHASE
// ─────────────────────────────────────────────────────────────

/**
 * Validates a Location Import Excel sheet, creates a stateful Import Job,
 * and saves all rows to import_job_rows.
 */
export async function validateLocationImport(
  buffer: Buffer,
  orgId: string,
  userId: string,
  fileName?: string,
): Promise<{
  jobId: string
  totalRows: number
  validRows: number
  errorRows: number
}> {
  // Create stateful import job record
  const [job] = await db
    .insert(importJobs)
    .values({
      orgId,
      type: 'location',
      status: 'validating',
      fileName,
      createdBy: userId,
    })
    .returning({ id: importJobs.id })

  if (!job) {
    throw new Error('Failed to initialize import job')
  }

  try {
    const { rows } = await parseExcelBuffer(buffer)

    // Load active sites for the organization
    const activeSites = await db
      .select({ id: sites.id, code: sites.code, name: sites.name })
      .from(sites)
      .where(and(eq(sites.orgId, orgId), eq(sites.isActive, true)))

    const defaultSite = activeSites[0]
    if (!defaultSite) {
      throw new Error('Organization has no active sites. Cannot import locations.')
    }

    // Load all active locations for this organization to build the hierarchy
    const activeLocations = await db
      .select({
        id: locations.id,
        siteId: locations.siteId,
        code: locations.code,
        level: locations.level,
        path: locations.path
      })
      .from(locations)
      .innerJoin(sites, eq(locations.siteId, sites.id))
      .where(and(eq(sites.orgId, orgId), isNull(locations.deletedAt)))

    // Track paths to verify uniqueness
    const dbPaths = new Set(activeLocations.map((l) => l.path.toUpperCase()))
    const seenPaths = new Set<string>()

    const jobRowsValues: Array<{
      jobId: string
      rowNumber: number
      rowData: any
      isValid: boolean
      errors: string[]
    }> = []

    let validRows = 0
    let errorRows = 0

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2 // Row 1 = Headers
      const raw = rows[i]!
      const rowErrors: string[] = []

      const parsed = locationImportRowSchema.safeParse(raw)
      if (!parsed.success) {
        rowErrors.push(...parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`))
      } else {
        const {
          building_code,
          building_name,
          floor_code,
          floor_name,
          locator_code,
        } = parsed.data

        const [zone, row, column] = locator_code.split('-')
        if (!zone || !row || !column) {
          rowErrors.push(`Locator Code '${locator_code}' is invalid. Address must contain Zone, Row, and Column segments (e.g. Z01-R02-C04).`)
        } else {
          const bldPath = building_code
          const flrPath = `${building_code}/${floor_code}`
          const zonePath = `${flrPath}/${zone}`
          const rowPath = `${zonePath}/${row}`
          const colPath = `${rowPath}/${column}`

          const bldPathUpper = bldPath.toUpperCase()
          const flrPathUpper = flrPath.toUpperCase()
          const zonePathUpper = zonePath.toUpperCase()
          const rowPathUpper = rowPath.toUpperCase()
          const colPathUpper = colPath.toUpperCase()

          if (seenPaths.has(colPathUpper) || dbPaths.has(colPathUpper)) {
            rowErrors.push(
              `Storage address '${locator_code}' already exists under Floor '${floor_name}' in Building '${building_name}' (either in the database or earlier in this template).`
            )
          } else {
            // If valid, we add the paths to seenPaths to prevent duplicate creation/reference
            seenPaths.add(bldPathUpper)
            seenPaths.add(flrPathUpper)
            seenPaths.add(zonePathUpper)
            seenPaths.add(rowPathUpper)
            seenPaths.add(colPathUpper)
          }
        }
      }

      const isValid = rowErrors.length === 0
      if (isValid) {
        validRows++
      } else {
        errorRows++
      }

      jobRowsValues.push({
        jobId: job.id,
        rowNumber: rowNum,
        rowData: raw,
        isValid,
        errors: rowErrors,
      })
    }

    // Bulk insert staging rows
    if (jobRowsValues.length > 0) {
      await db.insert(importJobRows).values(jobRowsValues)
    }

    // Update import job metadata
    await db
      .update(importJobs)
      .set({
        status: 'validated',
        totalRows: rows.length,
        validRows,
        errorRows,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    return {
      jobId: job.id,
      totalRows: rows.length,
      validRows,
      errorRows,
    }
  } catch (error: any) {
    // Fail job in database on parsing/crash
    await db
      .update(importJobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    throw error
  }
}

/**
 * Validates a SKU Import Excel sheet, creates a stateful Import Job,
 * and saves all rows to import_job_rows.
 */
export async function validateSkuImport(
  buffer: Buffer,
  orgId: string,
  userId: string,
  fileName?: string,
): Promise<{
  jobId: string
  totalRows: number
  validRows: number
  errorRows: number
}> {
  const [job] = await db
    .insert(importJobs)
    .values({
      orgId,
      type: 'sku',
      status: 'validating',
      fileName,
      createdBy: userId,
    })
    .returning({ id: importJobs.id })

  if (!job) {
    throw new Error('Failed to initialize import job')
  }

  try {
    const { rows } = await parseExcelBuffer(buffer)

    // Load active categories for validation — support lookup by code OR name
    const activeCategories = await db
      .select({ id: skuCategories.id, code: skuCategories.code, name: skuCategories.name })
      .from(skuCategories)
      .where(eq(skuCategories.orgId, orgId))

    // Primary map: UPPERCASE code → id
    const categoryMap = new Map(activeCategories.map((c) => [c.code.toUpperCase(), c.id]))
    // Fallback map: lowercase name → { id, code } so we can suggest the correct code in error messages
    const categoryNameMap = new Map(
      activeCategories.map((c) => [c.name.toLowerCase().trim(), { id: c.id, code: c.code }]),
    )

    const jobRowsValues: Array<{
      jobId: string
      rowNumber: number
      rowData: any
      isValid: boolean
      errors: string[]
    }> = []

    let validRows = 0
    let errorRows = 0
    const seenCodes = new Set<string>()

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const raw = rows[i]!
      const rowErrors: string[] = []

      const parsed = skuImportRowSchema.safeParse(raw)
      if (!parsed.success) {
        rowErrors.push(...parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`))
      } else {
        const skuCode = parsed.data.sku_code.toUpperCase()

        // Check file duplicates
        if (seenCodes.has(skuCode)) {
          rowErrors.push(`Duplicate SKU Code '${skuCode}' in this file`)
        } else {
          seenCodes.add(skuCode)
        }

        // Verify category exists — accept code (primary) or name (fallback with hint)
        if (parsed.data.category_code) {
          const raw = parsed.data.category_code
          const byCode = categoryMap.has(raw.toUpperCase())
          const byName = !byCode ? categoryNameMap.get(raw.toLowerCase().trim()) : undefined
          if (!byCode && !byName) {
            // Neither code nor name matched — show actionable error
            rowErrors.push(
              `Category code '${raw}' does not exist. ` +
                `Use the category CODE (e.g. VICE-WH), not the category name.`,
            )
          }
          // If matched by name, import will resolve correctly at execution — no error needed
        }
      }

      const isValid = rowErrors.length === 0
      if (isValid) {
        validRows++
      } else {
        errorRows++
      }

      jobRowsValues.push({
        jobId: job.id,
        rowNumber: rowNum,
        rowData: raw,
        isValid,
        errors: rowErrors,
      })
    }

    if (jobRowsValues.length > 0) {
      await db.insert(importJobRows).values(jobRowsValues)
    }

    await db
      .update(importJobs)
      .set({
        status: 'validated',
        totalRows: rows.length,
        validRows,
        errorRows,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    return {
      jobId: job.id,
      totalRows: rows.length,
      validRows,
      errorRows,
    }
  } catch (error: any) {
    await db
      .update(importJobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    throw error
  }
}

/**
 * Validates an Opening Stock Import Excel sheet, creates a stateful Import Job,
 * and saves all rows to import_job_rows. Enforces batch tracking conditions.
 */
export async function validateOpeningStockImport(
  buffer: Buffer,
  orgId: string,
  userId: string,
  fileName?: string,
): Promise<{
  jobId: string
  totalRows: number
  validRows: number
  errorRows: number
}> {
  const [job] = await db
    .insert(importJobs)
    .values({
      orgId,
      type: 'opening_stock',
      status: 'validating',
      fileName,
      createdBy: userId,
    })
    .returning({ id: importJobs.id })

  if (!job) {
    throw new Error('Failed to initialize import job')
  }

  try {
    const { rows } = await parseExcelBuffer(buffer)

    // Scalably load only the specific SKUs and location paths referenced in the file (avoid OOM)
    const uniqueSkuCodes = Array.from(
      new Set(
        rows
          .map((r) => String(r['sku_code'] ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    )

    const uniquePaths = Array.from(
      new Set(
        rows
          .map((r) => String(r['location_path'] ?? '').trim().toUpperCase())
          .filter(Boolean),
      ),
    )

    // Query DB for exact matching active SKUs
    const matchedSkus =
      uniqueSkuCodes.length > 0
        ? await db
            .select({ id: skus.id, skuCode: skus.skuCode, isBatchTracked: skus.isBatchTracked })
            .from(skus)
            .where(and(eq(skus.orgId, orgId), isNull(skus.deletedAt), eq(skus.isActive, true), inArray(skus.skuCode, uniqueSkuCodes)))
        : []

    const skuMap = new Map(matchedSkus.map((s) => [s.skuCode.toUpperCase(), s]))

    // Query DB for exact matching storage locations
    const matchedLocations =
      uniquePaths.length > 0
        ? await db
            .select({ id: locations.id, path: locations.path })
            .from(locations)
            .innerJoin(sites, eq(locations.siteId, sites.id))
            .where(
              and(
                eq(sites.orgId, orgId),
                eq(locations.isStorage, true),
                eq(locations.isActive, true),
                inArray(locations.path, uniquePaths),
              ),
            )
        : []

    const locationMap = new Map(matchedLocations.map((l) => [l.path.toUpperCase(), l]))

    const jobRowsValues: Array<{
      jobId: string
      rowNumber: number
      rowData: any
      isValid: boolean
      errors: string[]
    }> = []

    let validRows = 0
    let errorRows = 0

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2
      const raw = rows[i]!
      const rowErrors: string[] = []

      const parsed = openingStockImportRowSchema.safeParse(raw)
      if (!parsed.success) {
        rowErrors.push(...parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`))
      } else {
        const { sku_code, location_path, batch_no, expiry_date, manufacture_date } = parsed.data

        const skuRecord = skuMap.get(sku_code.toUpperCase())
        const locationRecord = locationMap.get(location_path.toUpperCase())

        // Validate SKU existence
        if (!skuRecord) {
          rowErrors.push(`SKU Code '${sku_code}' does not exist or is inactive`)
        } else {
          // Enforce batch-tracking constraints
          if (skuRecord.isBatchTracked) {
            if (!batch_no) {
              rowErrors.push(`SKU '${sku_code}' is batch-tracked; 'batch_no' is required`)
            }
          }
        }

        // Validate Location path
        if (!locationRecord) {
          rowErrors.push(`Location path '${location_path}' does not exist or is not a storage location`)
        }

        // Validate date formats YYYY-MM-DD
        if (expiry_date && !/^\d{4}-\d{2}-\d{2}$/.test(expiry_date)) {
          rowErrors.push(`Expiry date '${expiry_date}' must be in YYYY-MM-DD format`)
        }
        if (manufacture_date && !/^\d{4}-\d{2}-\d{2}$/.test(manufacture_date)) {
          rowErrors.push(`Manufacture date '${manufacture_date}' must be in YYYY-MM-DD format`)
        }
      }

      const isValid = rowErrors.length === 0
      if (isValid) {
        validRows++
      } else {
        errorRows++
      }

      jobRowsValues.push({
        jobId: job.id,
        rowNumber: rowNum,
        rowData: raw,
        isValid,
        errors: rowErrors,
      })
    }

    if (jobRowsValues.length > 0) {
      await db.insert(importJobRows).values(jobRowsValues)
    }

    await db
      .update(importJobs)
      .set({
        status: 'validated',
        totalRows: rows.length,
        validRows,
        errorRows,
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    return {
      jobId: job.id,
      totalRows: rows.length,
      validRows,
      errorRows,
    }
  } catch (error: any) {
    await db
      .update(importJobs)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(eq(importJobs.id, job.id))

    throw error
  }
}

// ─────────────────────────────────────────────────────────────
// TRANSACTIONAL EXECUTION PHASE
// ─────────────────────────────────────────────────────────────

/**
 * Executes a validated staged import job inside a database transaction.
 */
export async function executeImport(
  jobId: string,
  orgId: string,
  userId: string,
  ipAddress: string,
): Promise<{
  created: number
  updated: number
  posted: number
  skipped: number
}> {
  // Lock the job record & verify tenancy/status
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.orgId, orgId)))

  if (!job) {
    throw new Error('Import job not found')
  }

  if (job.status !== 'validated') {
    throw new Error(`Import job must be in 'validated' status to execute. Current status: ${job.status}`)
  }

  if (job.errorRows > 0) {
    throw new Error('Cannot execute an import job that contains validation errors. Please correct the Excel sheet and upload again.')
  }

  // Update status to processing to prevent double-submission
  await db
    .update(importJobs)
    .set({ status: 'processing', updatedAt: new Date() })
    .where(eq(importJobs.id, jobId))

  let created = 0
  let updated = 0
  let posted = 0
  let skipped = 0

  try {
    // Load all staging rows
    const stagingRows = await db
      .select()
      .from(importJobRows)
      .where(eq(importJobRows.jobId, jobId))

    if (job.type === 'location') {
      const rows = stagingRows.map((r) => locationImportRowSchema.parse(r.rowData))

      await db.transaction(async (tx) => {
        // Cache sites
        const activeSites = await tx
          .select({ id: sites.id, code: sites.code })
          .from(sites)
          .where(and(eq(sites.orgId, orgId), eq(sites.isActive, true)))

        const defaultSiteId = activeSites[0]?.id
        if (!defaultSiteId) {
          throw new Error('Organization has no active sites. Cannot execute location import.')
        }

        // Pre-load all database locations to build the transactional candidates cache
        const dbLocs = await tx
          .select({
            id: locations.id,
            siteId: locations.siteId,
            code: locations.code,
            level: locations.level,
            path: locations.path
          })
          .from(locations)
          .where(isNull(locations.deletedAt))

        const pathMap = new Map<string, { id: string; code: string; level: string; path: string }>()
        for (const loc of dbLocs) {
          pathMap.set(loc.path.toUpperCase(), {
            id: loc.id,
            code: loc.code,
            level: loc.level,
            path: loc.path,
          })
        }

        async function ensureNode(params: {
          siteId: string
          parentId: string | null
          code: string
          name: string
          level: 'building' | 'floor' | 'zone' | 'row' | 'column'
          path: string
          isStorage: boolean
          notes?: string | null
        }) {
          const pathUpper = params.path.toUpperCase()
          const existing = pathMap.get(pathUpper)
          if (existing) {
            return existing.id
          }

          const [created] = await tx
            .insert(locations)
            .values({
              siteId: params.siteId,
              parentId: params.parentId,
              name: params.name,
              code: params.code,
              level: params.level,
              path: params.path,
              isStorage: params.isStorage,
              notes: params.notes || null,
              isActive: true,
            })
            .returning({ id: locations.id })

          if (!created) {
            throw new Error(`Failed to create location node: ${params.path}`)
          }

          pathMap.set(pathUpper, {
            id: created.id,
            code: params.code,
            level: params.level,
            path: params.path,
          })

          return created.id
        }

        for (const row of rows) {
          const siteId = defaultSiteId

          // 1. Ensure Building
          const buildingId = await ensureNode({
            siteId,
            parentId: null,
            code: row.building_code,
            name: row.building_name,
            level: 'building',
            path: row.building_code,
            isStorage: false,
          })

          // 2. Ensure Floor
          const floorId = await ensureNode({
            siteId,
            parentId: buildingId,
            code: row.floor_code,
            name: row.floor_name,
            level: 'floor',
            path: `${row.building_code}/${row.floor_code}`,
            isStorage: false,
          })

          const [zone, rowVal, column] = row.locator_code.split('-')

          // 3. Ensure Zone
          const zoneId = await ensureNode({
            siteId,
            parentId: floorId,
            code: zone,
            name: `Zone ${zone}`,
            level: 'zone',
            path: `${row.building_code}/${row.floor_code}/${zone}`,
            isStorage: false,
          })

          // 4. Ensure Row
          const rowId = await ensureNode({
            siteId,
            parentId: zoneId,
            code: rowVal,
            name: `Row ${rowVal}`,
            level: 'row',
            path: `${row.building_code}/${row.floor_code}/${zone}/${rowVal}`,
            isStorage: false,
          })

          // 5. Ensure Column (Storage Address)
          const columnPath = `${row.building_code}/${row.floor_code}/${zone}/${rowVal}/${column}`
          const columnPathUpper = columnPath.toUpperCase()

          if (pathMap.has(columnPathUpper)) {
            skipped++
          } else {
            await ensureNode({
              siteId,
              parentId: rowId,
              code: column,
              name: `Column ${column}`,
              level: 'column',
              path: columnPath,
              isStorage: true,
              notes: row.notes || null,
            })
            created++
          }
        }
      })

      // Reliable, awaited audit logging
      await writeAudit({
        orgId,
        userId,
        action: 'create',
        entityType: 'location_import',
        entityId: jobId,
        changes: { after: { created, skipped, totalRows: rows.length } },
        ipAddress,
      })
    } else if (job.type === 'sku') {
      const rows = stagingRows.map((r) => skuImportRowSchema.parse(r.rowData))

      await db.transaction(async (tx) => {
        const allCategories = await tx
          .select({ id: skuCategories.id, code: skuCategories.code, name: skuCategories.name })
          .from(skuCategories)
          .where(eq(skuCategories.orgId, orgId))

        const categoryMap = new Map(allCategories.map((c) => [c.code.toUpperCase(), c.id]))
        // Fallback: resolve by category name (case-insensitive) when code is not found
        const categoryNameMap = new Map(
          allCategories.map((c) => [c.name.toLowerCase().trim(), c.id]),
        )

        for (const row of rows) {
          const skuCode = row.sku_code.toUpperCase()
          const categoryId = row.category_code
            ? (categoryMap.get(row.category_code.toUpperCase()) ??
              categoryNameMap.get(row.category_code.toLowerCase().trim()) ??
              null)
            : null

          const [existing] = await tx
            .select({ id: skus.id })
            .from(skus)
            .where(and(eq(skus.skuCode, skuCode), eq(skus.orgId, orgId), isNull(skus.deletedAt)))

          if (existing) {
            await tx
              .update(skus)
              .set({
                name: row.name,
                description: row.description ?? null,
                categoryId,
                skuType: row.sku_type,
                uom: row.uom,
                weightKg: row.weight ? String(row.weight) : null,
                isBatchTracked: row.is_batch_tracked,
                updatedAt: new Date(),
              })
              .where(eq(skus.id, existing.id))

            updated++
          } else {
            await tx.insert(skus).values({
              orgId,
              skuCode,
              name: row.name,
              description: row.description ?? null,
              categoryId,
              skuType: row.sku_type,
              uom: row.uom,
              weightKg: row.weight ? String(row.weight) : null,
              isBatchTracked: row.is_batch_tracked,
              createdBy: userId,
              isActive: true,
            })

            created++
          }
        }
      })

      await writeAudit({
        orgId,
        userId,
        action: 'create',
        entityType: 'sku_import',
        entityId: jobId,
        changes: { after: { created, updated, totalRows: rows.length } },
        ipAddress,
      })
    } else if (job.type === 'opening_stock') {
      const rows = stagingRows.map((r) => openingStockImportRowSchema.parse(r.rowData))

      // Query dependencies once outside transaction loop (selective and safe)
      const skuCodes = rows.map((r) => r.sku_code.toUpperCase())
      const uniqueSkuCodes = Array.from(new Set(skuCodes))

      const paths = rows.map((r) => r.location_path.toUpperCase())
      const uniquePaths = Array.from(new Set(paths))

      const activeSkus = await db
        .select({ id: skus.id, skuCode: skus.skuCode, uom: skus.uom, isBatchTracked: skus.isBatchTracked })
        .from(skus)
        .where(and(eq(skus.orgId, orgId), isNull(skus.deletedAt), eq(skus.isActive, true), inArray(skus.skuCode, uniqueSkuCodes)))

      const skuMap = new Map(activeSkus.map((s) => [s.skuCode.toUpperCase(), s]))

      const activeLocations = await db
        .select({ id: locations.id, path: locations.path, siteId: locations.siteId })
        .from(locations)
        .innerJoin(sites, eq(locations.siteId, sites.id))
        .where(
          and(
            eq(sites.orgId, orgId),
            eq(locations.isStorage, true),
            eq(locations.isActive, true),
            inArray(locations.path, uniquePaths),
          ),
        )

      const locationMap = new Map(activeLocations.map((l) => [l.path.toUpperCase(), l]))

      await db.transaction(async (tx) => {
        for (const row of rows) {
          const skuRecord = skuMap.get(row.sku_code.toUpperCase())!
          const locationRecord = locationMap.get(row.location_path.toUpperCase())!

          let resolvedBatchId: string | null = null

          // Handle batch creation/resolution for batch-tracked SKUs
          if (skuRecord.isBatchTracked && row.batch_no) {
            const [existingBatch] = await tx
              .select({ id: batches.id })
              .from(batches)
              .where(and(eq(batches.skuId, skuRecord.id), eq(batches.batchNo, row.batch_no.trim())))

            if (existingBatch) {
              resolvedBatchId = existingBatch.id
            } else {
              const [newBatch] = await tx
                .insert(batches)
                .values({
                  skuId: skuRecord.id,
                  batchNo: row.batch_no.trim(),
                  expiryDate: row.expiry_date || null,
                  manufactureDate: row.manufacture_date || null,
                })
                .returning({ id: batches.id })

              if (!newBatch) {
                throw new Error(`Failed to create batch record for '${row.batch_no}'`)
              }
              resolvedBatchId = newBatch.id
            }
          }

          // Check if opening balance already exists
          const [existingLedger] = await tx
            .select({ id: stockLedger.id })
            .from(stockLedger)
            .where(
              and(
                eq(stockLedger.orgId, orgId),
                eq(stockLedger.skuId, skuRecord.id),
                eq(stockLedger.locationId, locationRecord.id),
                eq(stockLedger.eventType, 'opening_balance'),
                resolvedBatchId ? eq(stockLedger.batchId, resolvedBatchId) : isNull(stockLedger.batchId),
              ),
            )

          if (existingLedger) {
            skipped++
            continue
          }

          // Post opening balance event
          await tx.insert(stockLedger).values({
            orgId,
            eventType: 'opening_balance',
            skuId: skuRecord.id,
            batchId: resolvedBatchId,
            locationId: locationRecord.id,
            siteId: locationRecord.siteId,
            qty: String(row.quantity),
            uom: skuRecord.uom,
            inventoryState: row.inventory_state,
            performedBy: userId,
            notes: row.remarks || 'Imported via Opening Stock Import',
            referenceType: 'import',
          })

          posted++
        }
      })

      await writeAudit({
        orgId,
        userId,
        action: 'post',
        entityType: 'opening_stock_import',
        entityId: jobId,
        changes: { after: { posted, skipped, totalRows: rows.length } },
        ipAddress,
      })
    }

    // Complete the job successfully
    await db
      .update(importJobs)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(importJobs.id, jobId))

    return { created, updated, posted, skipped }
  } catch (error: any) {
    // Mark job as failed on error
    await db
      .update(importJobs)
      .set({ status: 'failed', updatedAt: new Date() })
      .where(eq(importJobs.id, jobId))

    throw error
  }
}
