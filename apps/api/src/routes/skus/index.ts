/**
 * SKU routes
 * GET    /skus            — list + search (q, skuType, categoryId, isActive, tags, page, limit)
 * POST   /skus            — create SKU
 * GET    /skus/:id        — get SKU detail
 * PUT    /skus/:id        — update SKU
 * DELETE /skus/:id        — soft-delete SKU
 * GET    /skus/:id/stock  — current stock across all locations
 * GET    /skus/:id/movements — movement history
 *
 * GET    /skus/categories         — list categories (tree)
 * POST   /skus/categories         — create category
 * GET    /skus/categories/:id     — get category
 * PUT    /skus/categories/:id     — update category
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  listSkus,
  createSku,
  getSku,
  updateSku,
  deleteSku,
  getSkuStock,
  getSkuMovements,
  listCategories,
  createCategory,
  getCategory,
  updateCategory,
} from './handlers.js'

const skuRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all SKU routes
  fastify.addHook('preHandler', requireAuth)

  // Categories (register before /:id to avoid route conflicts)
  fastify.get('/categories', { preHandler: [requirePermission('categories', 'read')] }, listCategories)
  fastify.post('/categories', { preHandler: [requirePermission('categories', 'create')] }, createCategory)
  fastify.get('/categories/:id', { preHandler: [requirePermission('categories', 'read')] }, getCategory)
  fastify.put('/categories/:id', { preHandler: [requirePermission('categories', 'update')] }, updateCategory)

  // SKUs
  fastify.get('/', { preHandler: [requirePermission('skus', 'read')] }, listSkus)
  fastify.post('/', { preHandler: [requirePermission('skus', 'create')] }, createSku)
  fastify.get('/:id', { preHandler: [requirePermission('skus', 'read')] }, getSku)
  fastify.put('/:id', { preHandler: [requirePermission('skus', 'update')] }, updateSku)
  fastify.delete('/:id', { preHandler: [requirePermission('skus', 'delete')] }, deleteSku)

  // SKU sub-resources
  fastify.get('/:id/stock', { preHandler: [requirePermission('inventory', 'read')] }, getSkuStock)
  fastify.get('/:id/movements', { preHandler: [requirePermission('inventory', 'read')] }, getSkuMovements)
}

export default skuRoutes
