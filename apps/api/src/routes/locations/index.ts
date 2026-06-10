/**
 * Location routes
 * GET  /locations/sites        — list all sites
 * POST /locations/sites        — create site
 * GET  /locations              — list locations (filter: siteId, level, isStorage, pathPrefix)
 * POST /locations              — create location
 * GET  /locations/:id          — get location + children
 * PUT  /locations/:id          — update location
 * GET  /locations/:id/stock    — current inventory in this location + children
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  listSites,
  createSite,
  listLocations,
  createLocation,
  getLocation,
  updateLocation,
  getLocationStock,
} from './handlers.js'

const locationRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  // Sites
  fastify.get('/sites', { preHandler: [requirePermission('sites', 'read')] }, listSites)
  fastify.post('/sites', { preHandler: [requirePermission('sites', 'create')] }, createSite)

  // Locations
  fastify.get('/', { preHandler: [requirePermission('locations', 'read')] }, listLocations)
  fastify.post('/', { preHandler: [requirePermission('locations', 'create')] }, createLocation)
  fastify.get('/:id', { preHandler: [requirePermission('locations', 'read')] }, getLocation)
  fastify.put('/:id', { preHandler: [requirePermission('locations', 'update')] }, updateLocation)
  fastify.get('/:id/stock', { preHandler: [requirePermission('inventory', 'read')] }, getLocationStock)
}

export default locationRoutes
