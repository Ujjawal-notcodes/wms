/**
 * @fileoverview Audit log schema.
 * Immutable record of all entity mutations.
 * Written on every API operation that modifies data.
 */

import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { organizations } from './organizations.js'
import { users } from './auth.js'

// ─────────────────────────────────────────────────────────────
// Audit Log — APPEND ONLY. Never modify or delete.
// ─────────────────────────────────────────────────────────────

export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),     // 'create' | 'update' | 'delete' | 'approve' | 'post'
    entityType: text('entity_type').notNull(), // 'sku' | 'transfer_order' | 'user' | ...
    entityId: uuid('entity_id').notNull(),
    // Snapshot of changes: { before: {...}, after: {...} }
    changes: jsonb('changes'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_audit_log_entity').on(table.entityType, table.entityId),
    index('idx_audit_log_user').on(table.userId, table.performedAt),
    index('idx_audit_log_performed_at').on(table.performedAt),
    index('idx_audit_log_org').on(table.orgId, table.performedAt),
  ],
)

export type AuditLogEntry = typeof auditLog.$inferSelect
export type NewAuditLogEntry = typeof auditLog.$inferInsert

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const auditLogRelations = relations(auditLog, ({ one }) => ({
  organization: one(organizations, {
    fields: [auditLog.orgId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [auditLog.userId],
    references: [users.id],
  }),
}))
