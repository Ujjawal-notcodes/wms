/**
 * @fileoverview Organizations and Sites schema.
 * Organization is the top-level tenant.
 * Sites are physical facilities (Factory, Warehouse, etc.)
 */

import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { siteTypeEnum } from './enums.js'

// ─────────────────────────────────────────────────────────────
// Organizations
// ─────────────────────────────────────────────────────────────

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  address: jsonb('address'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Organization = typeof organizations.$inferSelect
export type NewOrganization = typeof organizations.$inferInsert

// ─────────────────────────────────────────────────────────────
// Sites
// ─────────────────────────────────────────────────────────────

export const sites = pgTable('sites', {
  id: uuid('id').primaryKey().defaultRandom(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  code: text('code').notNull(),
  siteType: siteTypeEnum('site_type').notNull(),
  address: jsonb('address'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Site = typeof sites.$inferSelect
export type NewSite = typeof sites.$inferInsert

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const organizationsRelations = relations(organizations, ({ many }) => ({
  sites: many(sites),
}))

export const sitesRelations = relations(sites, ({ one }) => ({
  organization: one(organizations, {
    fields: [sites.orgId],
    references: [organizations.id],
  }),
}))
