import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, stockLedger, inventoryBalances, skus, locations, sites, users } from '@wms/db'
import { eq, and, or, ilike, count, sum, desc, inArray, gt, sql } from 'drizzle-orm'
import {
  createOpeningBalanceSchema,
  createAdjustmentSchema,
  inventoryQuerySchema,
  stockMovementQuerySchema,
} from '@wms/shared'

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

  // 1. Verify Location is a valid storage level ('store', 'rack', 'bin')
  const [loc] = await db
    .select({ siteId: locations.siteId, level: locations.level })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId)))

  if (!loc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified location does not exist in your organization',
    })
  }

  const allowedLevels = ['store', 'rack', 'bin']
  if (!allowedLevels.includes(loc.level)) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Opening balance is not allowed for location level '${loc.level}'. Allowed levels: ${allowedLevels.join(', ')}`,
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

  // 1. Verify Location is a valid storage level ('store', 'rack', 'bin')
  const [loc] = await db
    .select({ siteId: locations.siteId, level: locations.level })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId)))

  if (!loc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified location does not exist in your organization',
    })
  }

  const allowedLevels = ['store', 'rack', 'bin']
  if (!allowedLevels.includes(loc.level)) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Adjustment is not allowed for location level '${loc.level}'. Allowed levels: ${allowedLevels.join(', ')}`,
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

  const { q, locationId, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const conditions = [
    eq(inventoryBalances.orgId, orgId),
  ]

  if (locationId) {
    conditions.push(eq(inventoryBalances.locationId, locationId))
  }

  if (q) {
    const searchFilter = or(
      ilike(skus.skuCode, `%${q}%`),
      ilike(skus.name, `%${q}%`),
      ilike(locations.code, `%${q}%`),
      ilike(locations.name, `%${q}%`)
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

  const data = await db
    .select({
      id: inventoryBalances.id,
      skuId: inventoryBalances.skuId,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationId: inventoryBalances.locationId,
      locationCode: locations.code,
      locationName: locations.name,
      quantity: inventoryBalances.qtyOnHand,
      uom: inventoryBalances.uom,
    })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(skus.skuCode, locations.code)

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
      ilike(locations.name, `%${q}%`)
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

  const dbData = await db
    .select({
      id: stockLedger.id,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationCode: locations.code,
      locationName: locations.name,
      eventType: stockLedger.eventType,
      quantity: stockLedger.qty,
      uom: stockLedger.uom,
      performedByName: users.fullName,
      performedAt: stockLedger.performedAt,
      notes: stockLedger.notes,
    })
    .from(stockLedger)
    .innerJoin(skus, eq(stockLedger.skuId, skus.id))
    .innerJoin(locations, eq(stockLedger.locationId, locations.id))
    .innerJoin(users, eq(stockLedger.performedBy, users.id))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(stockLedger.performedAt))

  // Map database enum eventType values back to unified app events
  const data = dbData.map((row) => {
    let mappedEventType = row.eventType as string
    if (row.eventType === 'adjustment_positive' || row.eventType === 'adjustment_negative') {
      mappedEventType = 'adjustment'
    }
    return {
      ...row,
      eventType: mappedEventType,
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
