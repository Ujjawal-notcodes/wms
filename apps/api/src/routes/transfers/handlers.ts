import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, stockLedger, inventoryBalances, skus, locations, sites, users } from '@wms/db'
import { eq, and, or, ilike, count, desc, sql } from 'drizzle-orm'
import { createTransferSchema, transferQuerySchema } from '@wms/shared'

// ─────────────────────────────────────────────────────────────
// Helper: resolve a location and verify it belongs to the org
// ─────────────────────────────────────────────────────────────

async function resolveLocation(locationId: string, orgId: string) {
  const [loc] = await db
    .select({
      id: locations.id,
      code: locations.code,
      name: locations.name,
      level: locations.level,
      siteId: locations.siteId,
    })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, locationId), eq(sites.orgId, orgId)))
  return loc ?? null
}

// ─────────────────────────────────────────────────────────────
// POST /transfers — Execute Transfer
// ─────────────────────────────────────────────────────────────

export async function createTransfer(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub
  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' })
  }

  const parsed = createTransferSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { skuId, fromLocationId, toLocationId, quantity, notes } = parsed.data

  // 1. Verify source location belongs to this org
  const fromLoc = await resolveLocation(fromLocationId, orgId)
  if (!fromLoc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Source location does not exist in your organization',
    })
  }

  // 2. Verify destination location belongs to this org
  const toLoc = await resolveLocation(toLocationId, orgId)
  if (!toLoc) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Destination location does not exist in your organization',
    })
  }

  // 3. Verify SKU belongs to this org and fetch UOM
  const [skuObj] = await db
    .select({ uom: skus.uom })
    .from(skus)
    .where(and(eq(skus.id, skuId), eq(skus.orgId, orgId)))

  if (!skuObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'SKU does not exist in your organization',
    })
  }

  // 4. Check available stock at source location
  const [balance] = await db
    .select({ qtyOnHand: inventoryBalances.qtyOnHand })
    .from(inventoryBalances)
    .where(
      and(
        eq(inventoryBalances.skuId, skuId),
        eq(inventoryBalances.locationId, fromLocationId),
        eq(inventoryBalances.orgId, orgId),
      )
    )

  const availableQty = Number(balance?.qtyOnHand ?? 0)
  if (availableQty < quantity) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Insufficient stock at source location. Available: ${availableQty} ${skuObj.uom}, Requested: ${quantity} ${skuObj.uom}`,
    })
  }

  // 5. Execute both ledger inserts in a single DB transaction
  //    transfer_out (negative) from source
  //    transfer_in  (positive) to destination
  //    Triggers atomically update inventory_balances for both rows.
  const [outEntry, inEntry] = await db.transaction(async (tx) => {
    const out = await tx
      .insert(stockLedger)
      .values({
        orgId,
        eventType: 'transfer_out',
        skuId,
        locationId: fromLocationId,
        siteId: fromLoc.siteId,
        qty: String(-quantity),
        uom: skuObj.uom,
        inventoryState: 'available',
        performedBy: userId,
        notes: notes ?? null,
        referenceType: 'transfer',
      })
      .returning()

    const inn = await tx
      .insert(stockLedger)
      .values({
        orgId,
        eventType: 'transfer_in',
        skuId,
        locationId: toLocationId,
        siteId: toLoc.siteId,
        qty: String(quantity),
        uom: skuObj.uom,
        inventoryState: 'available',
        performedBy: userId,
        notes: notes ?? null,
        referenceType: 'transfer',
        // Link both entries together via referenceId
        referenceId: out[0]!.id,
      })
      .returning()

    return [out[0]!, inn[0]!]
  })

  return reply.status(201).send({
    message: 'Transfer completed successfully',
    transferOut: outEntry,
    transferIn: inEntry,
    summary: {
      sku: skuId,
      from: { locationId: fromLocationId, code: fromLoc.code, name: fromLoc.name },
      to: { locationId: toLocationId, code: toLoc.code, name: toLoc.name },
      quantity,
      uom: skuObj.uom,
    },
  })
}

// ─────────────────────────────────────────────────────────────
// GET /transfers — List all transfers
// ─────────────────────────────────────────────────────────────

export async function listTransfers(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = transferQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { q, skuId: filterSkuId, fromLocationId, toLocationId, page, limit } = parsed.data
  const offset = (page - 1) * limit

  // We query transfer_out entries and JOIN with the paired transfer_in via referenceId
  const fromLoc = locations
  const toLoc = { ...locations }

  // Build base query for transfer_out entries only (each represents one full transfer)
  // Use a subquery approach: get transfer_out rows, then join to find the matching transfer_in
  const outLedger = stockLedger

  // Alias tables for from/to locations
  const fromLocations = db.$with('fromLocations').as(
    db.select().from(locations)
  )
  const toLocations = db.$with('toLocations').as(
    db.select().from(locations)
  )

  // Simpler approach: select transfer_out rows with a self-join via referenceId
  const rawData = await db.execute(sql`
    SELECT
      out_row.id           AS id,
      out_row.performed_at AS performed_at,
      out_row.sku_id       AS sku_id,
      s.sku_code           AS sku_code,
      s.name               AS sku_name,
      s.uom                AS uom,
      out_row.location_id  AS from_location_id,
      fl.code              AS from_location_code,
      fl.name              AS from_location_name,
      in_row.location_id   AS to_location_id,
      tl.code              AS to_location_code,
      tl.name              AS to_location_name,
      ABS(out_row.qty)     AS quantity,
      u.full_name          AS performed_by_name,
      out_row.notes        AS notes
    FROM stock_ledger out_row
    INNER JOIN stock_ledger in_row
      ON in_row.reference_id = out_row.id
      AND in_row.event_type = 'transfer_in'
    INNER JOIN skus s          ON s.id = out_row.sku_id
    INNER JOIN locations fl    ON fl.id = out_row.location_id
    INNER JOIN locations tl    ON tl.id = in_row.location_id
    INNER JOIN users u         ON u.id = out_row.performed_by
    WHERE out_row.org_id = ${orgId}
      AND out_row.event_type = 'transfer_out'
      ${filterSkuId ? sql`AND out_row.sku_id = ${filterSkuId}` : sql``}
      ${fromLocationId ? sql`AND out_row.location_id = ${fromLocationId}` : sql``}
      ${toLocationId ? sql`AND in_row.location_id = ${toLocationId}` : sql``}
      ${q ? sql`AND (
        s.sku_code ILIKE ${'%' + q + '%'}
        OR s.name ILIKE ${'%' + q + '%'}
        OR fl.code ILIKE ${'%' + q + '%'}
        OR fl.name ILIKE ${'%' + q + '%'}
        OR tl.code ILIKE ${'%' + q + '%'}
        OR tl.name ILIKE ${'%' + q + '%'}
      )` : sql``}
    ORDER BY out_row.performed_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `)

  const countResult = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM stock_ledger out_row
    INNER JOIN stock_ledger in_row
      ON in_row.reference_id = out_row.id
      AND in_row.event_type = 'transfer_in'
    INNER JOIN skus s          ON s.id = out_row.sku_id
    INNER JOIN locations fl    ON fl.id = out_row.location_id
    INNER JOIN locations tl    ON tl.id = in_row.location_id
    WHERE out_row.org_id = ${orgId}
      AND out_row.event_type = 'transfer_out'
      ${filterSkuId ? sql`AND out_row.sku_id = ${filterSkuId}` : sql``}
      ${fromLocationId ? sql`AND out_row.location_id = ${fromLocationId}` : sql``}
      ${toLocationId ? sql`AND in_row.location_id = ${toLocationId}` : sql``}
      ${q ? sql`AND (
        s.sku_code ILIKE ${'%' + q + '%'}
        OR s.name ILIKE ${'%' + q + '%'}
        OR fl.code ILIKE ${'%' + q + '%'}
        OR fl.name ILIKE ${'%' + q + '%'}
        OR tl.code ILIKE ${'%' + q + '%'}
        OR tl.name ILIKE ${'%' + q + '%'}
      )` : sql``}
  `)

  const total = Number((countResult as any)[0]?.total ?? 0)

  return reply.send({
    data: rawData as any[],
    total,
    page,
    limit,
    hasMore: offset + (rawData as any[]).length < total,
  })
}

// ─────────────────────────────────────────────────────────────
// GET /transfers/:id — Transfer detail
// ─────────────────────────────────────────────────────────────

export async function getTransfer(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const { id } = request.params as { id: string }

  const result = await db.execute(sql`
    SELECT
      out_row.id           AS id,
      out_row.performed_at AS performed_at,
      out_row.sku_id       AS sku_id,
      s.sku_code           AS sku_code,
      s.name               AS sku_name,
      s.uom                AS uom,
      out_row.location_id  AS from_location_id,
      fl.code              AS from_location_code,
      fl.name              AS from_location_name,
      in_row.location_id   AS to_location_id,
      tl.code              AS to_location_code,
      tl.name              AS to_location_name,
      ABS(out_row.qty)     AS quantity,
      u.full_name          AS performed_by_name,
      out_row.notes        AS notes,
      in_row.id            AS transfer_in_id
    FROM stock_ledger out_row
    INNER JOIN stock_ledger in_row
      ON in_row.reference_id = out_row.id
      AND in_row.event_type = 'transfer_in'
    INNER JOIN skus s          ON s.id = out_row.sku_id
    INNER JOIN locations fl    ON fl.id = out_row.location_id
    INNER JOIN locations tl    ON tl.id = in_row.location_id
    INNER JOIN users u         ON u.id = out_row.performed_by
    WHERE out_row.id = ${id}
      AND out_row.org_id = ${orgId}
      AND out_row.event_type = 'transfer_out'
  `)

  if (!(result as any[]).length) {
    return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Transfer not found' })
  }

  return reply.send((result as any[])[0])
}

// ─────────────────────────────────────────────────────────────
// Stub handlers (not in MVP scope — kept for route compatibility)
// ─────────────────────────────────────────────────────────────

export async function approveTransfer(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Approval workflow not implemented in MVP' })
}

export async function dispatchTransfer(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Dispatch workflow not implemented in MVP' })
}

export async function receiveTransfer(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Receive workflow not implemented in MVP' })
}

export async function cancelTransfer(_req: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Cancel workflow not implemented in MVP' })
}
