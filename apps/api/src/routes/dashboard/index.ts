/**
 * Dashboard routes
 * GET /dashboard/kpis    — aggregate KPIs: total SKUs, balances, transfers
 * GET /dashboard/alerts  — low-stock alerts, pending transfers
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import { getDashboardKpis, getDashboardAlerts } from './handlers.js'

const dashboardRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/kpis', { preHandler: [requirePermission('dashboard', 'read')] }, getDashboardKpis)
  fastify.get('/alerts', { preHandler: [requirePermission('dashboard', 'read')] }, getDashboardAlerts)
}

export default dashboardRoutes
