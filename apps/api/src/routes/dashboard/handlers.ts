import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, inventoryBalances, skus, locations, sites, stockLedger, transferOrders, users } from '@wms/db'
import { eq, and, gt, desc, count, inArray, sql } from 'drizzle-orm'
import { buildAddressHelpers } from '../inventory/handlers.js'

export async function getDashboardKpis(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  // 1. Active SKUs count (SKUs with positive stock)
  const [activeSkusRow] = await db
    .select({ count: sql<number>`count(distinct ${inventoryBalances.skuId})` })
    .from(inventoryBalances)
    .where(and(eq(inventoryBalances.orgId, orgId), gt(inventoryBalances.qtyOnHand, '0')))

  // 2. Factory Stock Items (distinct SKUs with positive stock at factory locations)
  const [factoryStockRow] = await db
    .select({ count: sql<number>`count(distinct ${inventoryBalances.skuId})` })
    .from(inventoryBalances)
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(
      and(
        eq(inventoryBalances.orgId, orgId),
        eq(sites.siteType, 'factory'),
        gt(inventoryBalances.qtyOnHand, '0')
      )
    )

  // 3. Warehouse Stock Items (distinct SKUs with positive stock at warehouse locations)
  const [warehouseStockRow] = await db
    .select({ count: sql<number>`count(distinct ${inventoryBalances.skuId})` })
    .from(inventoryBalances)
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(
      and(
        eq(inventoryBalances.orgId, orgId),
        eq(sites.siteType, 'warehouse'),
        gt(inventoryBalances.qtyOnHand, '0')
      )
    )

  // 4. Pending Transfers count (draft, approved, in_transit transfer orders)
  const [pendingTransfersRow] = await db
    .select({ count: count(transferOrders.id) })
    .from(transferOrders)
    .where(
      and(
        eq(transferOrders.orgId, orgId),
        inArray(transferOrders.status, ['draft', 'approved', 'in_transit'])
      )
    )

  return reply.send({
    activeSkus: Number(activeSkusRow?.count ?? 0),
    factoryStockItems: Number(factoryStockRow?.count ?? 0),
    warehouseStockItems: Number(warehouseStockRow?.count ?? 0),
    pendingTransfers: Number(pendingTransfersRow?.count ?? 0),
  })
}

export async function getDashboardAlerts(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  // 1. Low stock alerts (total quantity across storage locations is <= SKU's reorder point)
  const lowStock = await db
    .select({
      id: skus.id,
      skuCode: skus.skuCode,
      name: skus.name,
      uom: skus.uom,
      reorderPoint: skus.reorderPoint,
      totalQty: sql<number>`COALESCE(sum(${inventoryBalances.qtyOnHand}), 0)`,
    })
    .from(skus)
    .leftJoin(inventoryBalances, eq(skus.id, inventoryBalances.skuId))
    .where(and(eq(skus.orgId, orgId), eq(skus.isActive, true)))
    .groupBy(skus.id)
    .having(sql`COALESCE(sum(${inventoryBalances.qtyOnHand}), 0) <= ${skus.reorderPoint}`)
    .orderBy(skus.skuCode)
    .limit(10)

  // 2. Recent movements (latest 10 ledger rows)
  const recentMovements = await db
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
    })
    .from(stockLedger)
    .innerJoin(skus, eq(stockLedger.skuId, skus.id))
    .innerJoin(locations, eq(stockLedger.locationId, locations.id))
    .innerJoin(users, eq(stockLedger.performedBy, users.id))
    .where(eq(stockLedger.orgId, orgId))
    .orderBy(desc(stockLedger.performedAt))
    .limit(10)

  const { getHierarchyDetails } = await buildAddressHelpers(orgId)

  // Map database enum values back to standard app event types
  const mappedMovements = recentMovements.map((row) => {
    let mappedEventType = row.eventType as string
    if (row.eventType === 'adjustment_positive' || row.eventType === 'adjustment_negative') {
      mappedEventType = 'adjustment'
    }
    const details = getHierarchyDetails(row.locationPath || '')
    return {
      ...row,
      eventType: mappedEventType,
      building: details.building,
      floor: details.floor,
      locatorCode: details.locatorCode,
    }
  })

  return reply.send({
    lowStockAlerts: lowStock,
    recentMovements: mappedMovements,
  })
}
