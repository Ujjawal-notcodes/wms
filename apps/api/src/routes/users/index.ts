/**
 * User management routes
 * GET  /users         — list users
 * POST /users         — create user
 * GET  /users/:id     — get user
 * PUT  /users/:id     — update user
 * DELETE /users/:id   — deactivate user
 * GET  /users/roles   — list all roles
 * POST /users/:id/roles — assign role to user
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import { requirePermission } from '../../middleware/require-permission.js'
import {
  listUsers, createUser, getUser, updateUser, deactivateUser,
  listRoles, assignRole, removeRole,
} from './handlers.js'

const userRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth)

  fastify.get('/roles', { preHandler: [requirePermission('roles', 'read')] }, listRoles)

  fastify.get('/', { preHandler: [requirePermission('users', 'read')] }, listUsers)
  fastify.post('/', { preHandler: [requirePermission('users', 'create')] }, createUser)
  fastify.get('/:id', { preHandler: [requirePermission('users', 'read')] }, getUser)
  fastify.put('/:id', { preHandler: [requirePermission('users', 'update')] }, updateUser)
  fastify.delete('/:id', { preHandler: [requirePermission('users', 'delete')] }, deactivateUser)
  fastify.post('/:id/roles', { preHandler: [requirePermission('users', 'update')] }, assignRole)
  fastify.delete('/:id/roles/:roleId', { preHandler: [requirePermission('users', 'update')] }, removeRole)
}

export default userRoutes
