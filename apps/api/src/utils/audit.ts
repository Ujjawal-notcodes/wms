/**
 * @fileoverview Audit log utility.
 * Call writeAudit() from any service after a data mutation.
 */

import { db, auditLog } from '@wms/db'
import type { NewAuditLogEntry } from '@wms/db'

interface AuditParams {
  orgId: string
  userId: string
  action: 'create' | 'update' | 'delete' | 'approve' | 'post' | 'login' | 'logout'
  entityType: string
  entityId: string
  changes?: { before?: unknown; after?: unknown }
  ipAddress?: string
  userAgent?: string
}

export async function writeAudit(params: AuditParams): Promise<void> {
  const entry: NewAuditLogEntry = {
    orgId: params.orgId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: params.changes ? JSON.parse(JSON.stringify(params.changes)) : undefined,
    ipAddress: params.ipAddress,
    userAgent: params.userAgent,
  }

  // Fire-and-forget — audit failure should not block the main operation
  db.insert(auditLog).values(entry).catch((err) => {
    console.error('Failed to write audit log:', err)
  })
}

/**
 * Extract IP address from a Fastify request (handles X-Forwarded-For).
 */
export function getClientIp(headers: Record<string, string | string[] | undefined>, remoteAddress?: string): string {
  const forwarded = headers['x-forwarded-for']
  if (forwarded) {
    const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0]
    return ip?.trim() ?? remoteAddress ?? 'unknown'
  }
  return remoteAddress ?? 'unknown'
}
