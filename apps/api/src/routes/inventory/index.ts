/**
 * Inventory routes
 * GET  /inventory              — query balances (skuId, locationId, siteId, state)
 * GET  /inventory/movements    — stock ledger history
 * GET  /inventory/summary      — aggregated by site/category
 * GET  /inventory/low-stock    — SKUs below reorder point
 * POST /inventory/opening-balance — post opening balances
 * POST /inventory/adjustments  — create adjustment (manual positive/negative)
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  queryBalances,
  queryMovements,
  getInventorySummary,
  getLowStock,
  postOpeningBalance,
  createAdjustment,
} from './handlers.js'

const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/', { preHandler: [requirePermission('inventory', 'read')] }, queryBalances)
  fastify.get('/movements', { preHandler: [requirePermission('inventory', 'read')] }, queryMovements)
  fastify.get('/summary', { preHandler: [requirePermission('inventory', 'read')] }, getInventorySummary)
  fastify.get('/low-stock', { preHandler: [requirePermission('inventory', 'read')] }, getLowStock)
  fastify.post('/opening-balance', { preHandler: [requirePermission('inventory', 'post')] }, postOpeningBalance)
  fastify.post('/adjustments', { preHandler: [requirePermission('inventory', 'approve')] }, createAdjustment)
}

export default inventoryRoutes
