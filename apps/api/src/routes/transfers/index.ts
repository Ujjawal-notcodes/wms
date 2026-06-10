/**
 * Transfer routes
 * GET  /transfers          — list transfers (status, fromSiteId, toSiteId, dates)
 * POST /transfers          — create transfer order
 * GET  /transfers/:id      — transfer detail + lines
 * POST /transfers/:id/approve   — approve (Manager+)
 * POST /transfers/:id/dispatch  — mark dispatched (posts transfer_out events)
 * POST /transfers/:id/receive   — record receipt (posts transfer_in events)
 * POST /transfers/:id/cancel    — cancel transfer
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  listTransfers,
  createTransfer,
  getTransfer,
  approveTransfer,
  dispatchTransfer,
  receiveTransfer,
  cancelTransfer,
} from './handlers.js'

const transferRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/', { preHandler: [requirePermission('transfers', 'read')] }, listTransfers)
  fastify.post('/', { preHandler: [requirePermission('transfers', 'create')] }, createTransfer)
  fastify.get('/:id', { preHandler: [requirePermission('transfers', 'read')] }, getTransfer)
  fastify.post('/:id/approve', { preHandler: [requirePermission('transfers', 'approve')] }, approveTransfer)
  fastify.post('/:id/dispatch', { preHandler: [requirePermission('transfers', 'update')] }, dispatchTransfer)
  fastify.post('/:id/receive', { preHandler: [requirePermission('transfers', 'update')] }, receiveTransfer)
  fastify.post('/:id/cancel', { preHandler: [requirePermission('transfers', 'update')] }, cancelTransfer)
}

export default transferRoutes
