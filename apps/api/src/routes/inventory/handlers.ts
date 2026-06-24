import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, stockLedger, inventoryBalances, skus, locations, sites, users, batches, transferOrders } from '@wms/db'
import { eq, and, or, ilike, count, sum, desc, inArray, gt, sql, isNull } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  createOpeningBalanceSchema,
  createAdjustmentSchema,
  inventoryQuerySchema,
  stockMovementQuerySchema,
} from '@wms/shared'

// Helper to build readable location addresses and resolve building/floor/address details
export async function buildAddressHelpers(orgId: string) {
  const orgSites = await db
    .select({ code: sites.code, name: sites.name })
    .from(sites)
    .where(eq(sites.orgId, orgId))
  
  const orgLocs = await db
    .select({ code: locations.code, name: locations.name, path: locations.path, level: locations.level })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  const siteMap = new Map<string, string>()
  for (const s of orgSites) {
    siteMap.set(s.code, s.name)
  }

  const locMap = new Map<string, { name: string; code: string; level: string }>()
  for (const l of orgLocs) {
    locMap.set(l.path, { name: l.name, code: l.code, level: l.level })
  }

  const getReadableAddress = (path: string) => {
    if (!path) return 'N/A'
    const segments = path.split('/')
    const names: string[] = []
    let currentPath = ''
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      currentPath = currentPath ? `${currentPath}/${seg}` : seg
      
      const loc = locMap.get(currentPath)
      if (loc) {
        names.push(loc.name)
      } else if (i === 0) {
        const siteName = siteMap.get(seg)
        names.push(siteName || seg)
      } else {
        names.push(seg)
      }
    }
    return names.join(' > ')
  }

  /**
   * Returns structured hierarchy info for a given materialized path.
   * locatorCode = Zone-Row-Column (e.g. Z01-R02-C04) for column-level locations.
   * address = same value (kept for backward compat).
   */
  const getHierarchyDetails = (path: string) => {
    if (!path) return { building: 'N/A', floor: 'N/A', address: 'N/A', locatorCode: null as string | null }
    const segments = path.split('/')
    let currentPath = ''
    
    let building = ''
    let floor = ''
    const addressParts: string[] = []
    
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]
      currentPath = currentPath ? `${currentPath}/${seg}` : seg
      
      const loc = locMap.get(currentPath)
      if (loc) {
        if (loc.level === 'building') {
          building = loc.name
        } else if (loc.level === 'floor') {
          floor = loc.name
        } else if (['zone', 'row', 'column', 'shelf'].includes(loc.level)) {
          addressParts.push(loc.code)
        }
      }
    }

    // locatorCode: last 3 address parts joined with '-' (Zone-Row-Column e.g. Z01-R02-C04)
    const locatorCode = addressParts.length >= 3 ? addressParts.slice(-3).join('-') : null
    
    return {
      building: building || 'N/A',
      floor: floor || 'N/A',
      address: addressParts.join('-') || 'N/A',
      locatorCode,
    }
  }

  return { getReadableAddress, getHierarchyDetails }
}

// ─────────────────────────────────────────────────────────────
// Opening Balance
// ─────────────────────────────────────────────────────────────

export async function postOpeningBalance(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub
  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' })
  }

  const parsed = createOpeningBalanceSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { skuId, locationId, quantity, remarks } = parsed.data

  // 1. Verify Location is a valid storage location
  const [loc] = await db
    .select({ siteId: locations.siteId, level: locations.level, isStorage: locations.isStorage })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (!loc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified location does not exist in your organization',
    })
  }

  if (!loc.isStorage) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Opening balance is not allowed for location level '${loc.level}' because it is not configured as a storage location.`,
    })
  }

  // 2. Check if an opening balance already exists for this SKU + Location
  const [existing] = await db
    .select({ id: stockLedger.id })
    .from(stockLedger)
    .where(
      and(
        eq(stockLedger.skuId, skuId),
        eq(stockLedger.locationId, locationId),
        eq(stockLedger.eventType, 'opening_balance'),
      )
    )

  if (existing) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: 'Opening balance already exists for this SKU and location.',
    })
  }

  // 3. Fetch SKU details to get UOM
  const [skuObj] = await db
    .select({ uom: skus.uom })
    .from(skus)
    .where(and(eq(skus.id, skuId), eq(skus.orgId, orgId)))

  if (!skuObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified SKU does not exist in your organization',
    })
  }

  // 4. Insert Movement Entry into stock_ledger (Trigger updates inventory_balances)
  const [newLedgerEntry] = await db
    .insert(stockLedger)
    .values({
      orgId,
      eventType: 'opening_balance',
      skuId,
      locationId,
      siteId: loc.siteId,
      qty: String(quantity),
      uom: skuObj.uom,
      inventoryState: 'available',
      performedBy: userId,
      notes: remarks || null,
      referenceType: 'manual',
    })
    .returning()

  return reply.status(201).send(newLedgerEntry)
}

// ─────────────────────────────────────────────────────────────
// Stock Adjustments
// ─────────────────────────────────────────────────────────────

export async function createAdjustment(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub
  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' })
  }

  const parsed = createAdjustmentSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { skuId, locationId, quantity, reason, notes } = parsed.data

  // 1. Verify Location is a valid storage location
  const [loc] = await db
    .select({ siteId: locations.siteId, level: locations.level, isStorage: locations.isStorage })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (!loc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified location does not exist in your organization',
    })
  }

  if (!loc.isStorage) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Adjustment is not allowed for location level '${loc.level}' because it is not configured as a storage location.`,
    })
  }

  // 2. Fetch SKU details to get UOM
  const [skuObj] = await db
    .select({ uom: skus.uom })
    .from(skus)
    .where(and(eq(skus.id, skuId), eq(skus.orgId, orgId)))

  if (!skuObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified SKU does not exist in your organization',
    })
  }

  // 3. Map eventType to pgEnum value ('adjustment_positive' or 'adjustment_negative')
  const dbEventType = quantity > 0 ? 'adjustment_positive' : 'adjustment_negative'

  // 4. Insert Movement Entry into stock_ledger
  const [newLedgerEntry] = await db
    .insert(stockLedger)
    .values({
      orgId,
      eventType: dbEventType,
      skuId,
      locationId,
      siteId: loc.siteId,
      qty: String(quantity),
      uom: skuObj.uom,
      inventoryState: 'available',
      performedBy: userId,
      notes: notes || reason,
      referenceType: 'manual',
    })
    .returning()

  return reply.status(201).send(newLedgerEntry)
}

// ─────────────────────────────────────────────────────────────
// Query Stock Balances
// ─────────────────────────────────────────────────────────────

export async function queryBalances(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = inventoryQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { q, locationId, skuId, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const conditions = [
    eq(inventoryBalances.orgId, orgId),
  ]

  if (locationId) {
    conditions.push(eq(inventoryBalances.locationId, locationId))
  }

  if (skuId) {
    conditions.push(eq(inventoryBalances.skuId, skuId))
  }

  if (q) {
    const searchFilter = or(
      ilike(skus.skuCode, `%${q}%`),
      ilike(skus.name, `%${q}%`),
      ilike(skus.barcode, `%${q}%`),
      ilike(locations.code, `%${q}%`),
      ilike(locations.name, `%${q}%`),
      ilike(locations.path, `%${q}%`)
    )
    if (searchFilter) {
      conditions.push(searchFilter)
    }
  }

  const [totalCountRow] = await db
    .select({ total: count(inventoryBalances.id) })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .where(and(...conditions))

  const total = totalCountRow?.total ?? 0

  const rawData = await db
    .select({
      id: inventoryBalances.id,
      skuId: inventoryBalances.skuId,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationId: inventoryBalances.locationId,
      locationCode: locations.code,
      locationName: locations.name,
      locationPath: locations.path,
      locationLevel: locations.level,
      quantity: inventoryBalances.qtyOnHand,
      uom: inventoryBalances.uom,
      inventoryState: inventoryBalances.inventoryState,
      batchNo: batches.batchNo,
    })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .leftJoin(batches, eq(inventoryBalances.batchId, batches.id))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(skus.skuCode, locations.code)

  const { getReadableAddress, getHierarchyDetails } = await buildAddressHelpers(orgId)

  const data = rawData.map((row) => {
    const details = getHierarchyDetails(row.locationPath || '')
    const displayAddress = getReadableAddress(row.locationPath || '')
    return {
      ...row,
      displayAddress,
      building: details.building,
      floor: details.floor,
      address: details.address,
      locatorCode: details.locatorCode,
    }
  })

  return reply.send({
    data,
    total,
    page,
    limit,
    hasMore: offset + data.length < total,
  })
}

// ─────────────────────────────────────────────────────────────
// Stock Ledger Transactions History
// ─────────────────────────────────────────────────────────────

export async function queryMovements(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = stockMovementQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { q, eventType, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const conditions = [
    eq(stockLedger.orgId, orgId),
  ]

  if (eventType) {
    if (eventType === 'adjustment') {
      conditions.push(inArray(stockLedger.eventType, ['adjustment_positive', 'adjustment_negative']))
    } else {
      conditions.push(eq(stockLedger.eventType, eventType as any))
    }
  }

  if (q) {
    const searchFilter = or(
      ilike(skus.skuCode, `%${q}%`),
      ilike(skus.name, `%${q}%`),
      ilike(locations.code, `%${q}%`),
      ilike(locations.name, `%${q}%`),
      ilike(locations.path, `%${q}%`)
    )
    if (searchFilter) {
      conditions.push(searchFilter)
    }
  }

  const [totalCountRow] = await db
    .select({ total: count(stockLedger.id) })
    .from(stockLedger)
    .innerJoin(skus, eq(stockLedger.skuId, skus.id))
    .innerJoin(locations, eq(stockLedger.locationId, locations.id))
    .where(and(...conditions))

  const total = totalCountRow?.total ?? 0

  const pairedIn = alias(stockLedger, 'paired_in')
  const pairedOut = alias(stockLedger, 'paired_out')
  const pairedInLoc = alias(locations, 'paired_in_loc')
  const pairedOutLoc = alias(locations, 'paired_out_loc')

  const dbData = await db
    .select({
      id: stockLedger.id,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationCode: locations.code,
      locationName: locations.name,
      locationPath: locations.path,
      locationLevel: locations.level,
      eventType: stockLedger.eventType,
      quantity: stockLedger.qty,
      uom: stockLedger.uom,
      performedByName: users.fullName,
      performedAt: stockLedger.performedAt,
      notes: stockLedger.notes,
      referenceType: stockLedger.referenceType,
      referenceId: stockLedger.referenceId,
      pairedInCode: pairedInLoc.code,
      pairedInPath: pairedInLoc.path,
      pairedOutCode: pairedOutLoc.code,
      pairedOutPath: pairedOutLoc.path,
      transferNumber: transferOrders.transferNumber,
    })
    .from(stockLedger)
    .innerJoin(skus, eq(stockLedger.skuId, skus.id))
    .innerJoin(locations, eq(stockLedger.locationId, locations.id))
    .innerJoin(users, eq(stockLedger.performedBy, users.id))
    .leftJoin(pairedIn, eq(stockLedger.id, pairedIn.referenceId))
    .leftJoin(pairedInLoc, eq(pairedIn.locationId, pairedInLoc.id))
    .leftJoin(pairedOut, eq(stockLedger.referenceId, pairedOut.id))
    .leftJoin(pairedOutLoc, eq(pairedOut.locationId, pairedOutLoc.id))
    .leftJoin(transferOrders, eq(stockLedger.referenceId, transferOrders.id))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(stockLedger.performedAt))

  const { getHierarchyDetails } = await buildAddressHelpers(orgId)

  // Map database enum eventType values back to unified app events
  const data = dbData.map((row) => {
    let mappedEventType = row.eventType as string
    if (row.eventType === 'adjustment_positive' || row.eventType === 'adjustment_negative') {
      mappedEventType = 'adjustment'
    }
    const details = getHierarchyDetails(row.locationPath || '')

    let fromLocation = 'N/A'
    let toLocation = 'N/A'

    const selfLocator = details.locatorCode || row.locationCode

    if (row.eventType === 'transfer_out') {
      fromLocation = selfLocator
      const destDetails = getHierarchyDetails(row.pairedInPath || '')
      toLocation = destDetails.locatorCode || row.pairedInCode || 'N/A'
    } else if (row.eventType === 'transfer_in') {
      const srcDetails = getHierarchyDetails(row.pairedOutPath || '')
      fromLocation = srcDetails.locatorCode || row.pairedOutCode || 'N/A'
      toLocation = selfLocator
    } else {
      if (Number(row.quantity) > 0) {
        toLocation = selfLocator
      } else {
        fromLocation = selfLocator
      }
    }

    const reference = row.referenceType === 'transfer' || row.referenceType === 'transfer_order'
      ? (row.transferNumber || `TRF-${(row.referenceId || row.id).substring(0, 8).toUpperCase()}`)
      : `ADJ-${row.id.substring(0, 8).toUpperCase()}`

    return {
      id: row.id,
      skuCode: row.skuCode,
      skuName: row.skuName,
      locationCode: row.locationCode,
      locationName: row.locationName,
      locationPath: row.locationPath,
      locationLevel: row.locationLevel,
      eventType: mappedEventType,
      quantity: row.quantity,
      uom: row.uom,
      performedByName: row.performedByName,
      performedAt: row.performedAt,
      notes: row.notes,
      building: details.building,
      floor: details.floor,
      locatorCode: details.locatorCode,
      fromLocation,
      toLocation,
      reference,
    }
  })

  return reply.send({
    data,
    total,
    page,
    limit,
    hasMore: offset + data.length < total,
  })
}

// ─────────────────────────────────────────────────────────────
// Aggregated KPIs Summary
// ─────────────────────────────────────────────────────────────

export async function getInventorySummary(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [stats] = await db
    .select({
      totalSkus: sql<number>`count(distinct ${inventoryBalances.skuId})`,
      totalQuantity: sum(inventoryBalances.qtyOnHand),
      activeLocations: sql<number>`count(distinct ${inventoryBalances.locationId})`,
    })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.orgId, orgId),
        gt(inventoryBalances.qtyOnHand, '0')
      )
    )

  return reply.send({
    totalSkus: Number(stats?.totalSkus ?? 0),
    totalQuantity: Number(stats?.totalQuantity ?? 0),
    activeLocations: Number(stats?.activeLocations ?? 0),
  })
}

export async function getLowStock(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Not implemented yet' })
}
