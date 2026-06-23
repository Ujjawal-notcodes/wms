/**
 * Location routes
 * GET  /locations/sites            — list all sites
 * POST /locations/sites            — create site
 * GET  /locations                  — list locations (filter: siteId, level, isStorage, pathPrefix)
 * POST /locations                  — create location (low-level node)
 * POST /locations/storage-address  — create storage address Z01-R02-C04 from 3-tier form
 * GET  /locations/:id              — get location + children
 * PUT  /locations/:id              — update location
 * GET  /locations/:id/stock        — current inventory in this location + children
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  listSites,
  createSite,
  updateSite,
  listLocations,
  createLocation,
  createStorageAddress,
  getLocation,
  updateLocation,
  getLocationStock,
  deleteLocation,
  bulkDeleteLocations,
  bulkDeactivateLocations,
  resetDemoLocations,
} from './handlers.js'

const locationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  // Sites
  fastify.get('/sites', { preHandler: [requirePermission('sites', 'read')] }, listSites)
  fastify.post('/sites', { preHandler: [requirePermission('sites', 'create')] }, createSite)
  fastify.put('/sites/:id', { preHandler: [requirePermission('sites', 'update')] }, updateSite)

  // Locations
  fastify.get('/', { preHandler: [requirePermission('locations', 'read')] }, listLocations)
  fastify.post('/', { preHandler: [requirePermission('locations', 'create')] }, createLocation)
  // Simplified 3-tier storage address creation (Building → Floor → Z01-R02-C04)
  fastify.post('/storage-address', { preHandler: [requirePermission('locations', 'create')] }, createStorageAddress)
  fastify.post('/bulk-delete', { preHandler: [requirePermission('locations', 'delete')] }, bulkDeleteLocations)
  fastify.post('/bulk-deactivate', { preHandler: [requirePermission('locations', 'update')] }, bulkDeactivateLocations)
  fastify.post('/reset-demo', { preHandler: [requirePermission('locations', 'delete')] }, resetDemoLocations)
  fastify.get('/:id', { preHandler: [requirePermission('locations', 'read')] }, getLocation)
  fastify.put('/:id', { preHandler: [requirePermission('locations', 'update')] }, updateLocation)
  fastify.delete('/:id', { preHandler: [requirePermission('locations', 'delete')] }, deleteLocation)
  fastify.get('/:id/stock', { preHandler: [requirePermission('inventory', 'read')] }, getLocationStock)
}

export default locationRoutes
