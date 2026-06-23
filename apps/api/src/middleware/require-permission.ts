/**
 * @fileoverview Permission middleware factory.
 *
 * Usage in route options:
 *   { preHandler: [requireAuth, requirePermission('inventory', 'approve')] }
 *
 * Checks that request.user has the specified (module, action) permission
 * by querying their role_permissions via the DB.
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import { and, eq, inArray } from 'drizzle-orm'
import { db, rolePermissions, permissions, userRoles } from '@wms/db'

// Cache permission checks for the request lifetime to avoid repeated DB queries.
// In a future iteration, this can be moved to a Redis cache.
const permissionCache = new Map<string, Set<string>>()

export async function getUserPermissions(userId: string): Promise<Set<string>> {
  const cacheKey = userId
  const cached = permissionCache.get(cacheKey)
  if (cached) return cached

  // Load user's roles and their permissions in one query
  const userRoleRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId))

  if (userRoleRows.length === 0) {
    const empty = new Set<string>()
    permissionCache.set(cacheKey, empty)
    return empty
  }

  const roleIds = userRoleRows.map((r) => r.roleId)

  const permRows = await db
    .select({
      module: permissions.module,
      action: permissions.action,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds))

  const permSet = new Set(permRows.map((p) => `${p.module}:${p.action}`))
  permissionCache.set(cacheKey, permSet)

  return permSet
}

export function requirePermission(module: string, action: string) {
  return async function (
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const userId = request.user?.sub
    if (!userId) {
      return reply.status(401).send({ statusCode: 401, error: 'Unauthorized' })
    }

    const userPerms = await getUserPermissions(userId)
    const required = `${module}:${action}`

    if (!userPerms.has(required)) {
      return reply.status(403).send({
        statusCode: 403,
        error: 'Forbidden',
        message: `You do not have permission to ${action} ${module}`,
      })
    }
  }
}

// Clear permission cache for a user (call on role change or logout)
export function invalidatePermissionCache(userId: string): void {
  permissionCache.delete(userId)
}
