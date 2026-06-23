/**
 * @fileoverview Route registration — registers all API route groups.
 * Each group is scoped under the API prefix (e.g., /api/v1).
 */

import type { FastifyInstance } from 'fastify'
import authRoutes from './auth/index.js'
import userRoutes from './users/index.js'
import skuRoutes from './skus/index.js'
import locationRoutes from './locations/index.js'
import inventoryRoutes from './inventory/index.js'
import transferRoutes from './transfers/index.js'
import dashboardRoutes from './dashboard/index.js'
import importRoutes from './imports/index.js'

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // Public routes (no auth required)
  await fastify.register(authRoutes, { prefix: '/auth' })

  // Protected routes (all require JWT via preHandler in each route)
  await fastify.register(userRoutes, { prefix: '/users' })
  await fastify.register(skuRoutes, { prefix: '/skus' })
  await fastify.register(locationRoutes, { prefix: '/locations' })
  await fastify.register(inventoryRoutes, { prefix: '/inventory' })
  await fastify.register(transferRoutes, { prefix: '/transfers' })
  await fastify.register(dashboardRoutes, { prefix: '/dashboard' })
  await fastify.register(importRoutes, { prefix: '/imports' })
}
