/**
 * @fileoverview Transfer Orders schema.
 * Manages inventory movement between Factory ↔ Warehouse.
 *
 * Flow:
 *   draft → approved → in_transit → received | partial | cancelled
 *
 * On dispatch: Movement Engine posts transfer_out events (qty becomes in_transit)
 * On receipt:  Movement Engine posts transfer_in events (qty becomes available)
 */

import {
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { transferTypeEnum, transferStatusEnum } from './enums.js'
import { organizations, sites } from './organizations.js'
import { locations } from './locations.js'
import { skus, batches } from './catalog.js'
import { users } from './auth.js'

// ─────────────────────────────────────────────────────────────
// Transfer Orders (header)
// ─────────────────────────────────────────────────────────────

export const transferOrders = pgTable(
  'transfer_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    // Auto-generated: TRF-2025-0001
    transferNumber: text('transfer_number').notNull().unique(),
    transferType: transferTypeEnum('transfer_type').notNull(),
    fromSiteId: uuid('from_site_id')
      .notNull()
      .references(() => sites.id),
    toSiteId: uuid('to_site_id')
      .notNull()
      .references(() => sites.id),
    // Optional specific source location; if null, driver selects per line
    fromLocationId: uuid('from_location_id').references(() => locations.id),
    // Optional default destination location; can be overridden per line
    toLocationId: uuid('to_location_id').references(() => locations.id),
    vehicleNo: text('vehicle_no'),
    status: transferStatusEnum('status').notNull().default('draft'),
    requestedBy: uuid('requested_by')
      .notNull()
      .references(() => users.id),
    approvedBy: uuid('approved_by').references(() => users.id),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    receivedAt: timestamp('received_at', { withTimezone: true }),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_transfer_orders_org_id').on(table.orgId),
    index('idx_transfer_orders_status').on(table.status),
    index('idx_transfer_orders_from_site').on(table.fromSiteId),
    index('idx_transfer_orders_to_site').on(table.toSiteId),
    index('idx_transfer_orders_created_at').on(table.createdAt),
  ],
)

export type TransferOrder = typeof transferOrders.$inferSelect
export type NewTransferOrder = typeof transferOrders.$inferInsert

// ─────────────────────────────────────────────────────────────
// Transfer Order Lines (items)
// ─────────────────────────────────────────────────────────────

export const transferOrderLines = pgTable(
  'transfer_order_lines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transferOrderId: uuid('transfer_order_id')
      .notNull()
      .references(() => transferOrders.id, { onDelete: 'cascade' }),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => skus.id),
    batchId: uuid('batch_id').references(() => batches.id),
    fromLocationId: uuid('from_location_id')
      .notNull()
      .references(() => locations.id),
    toLocationId: uuid('to_location_id')
      .notNull()
      .references(() => locations.id),
    // Quantities track the three states of a transfer
    qtyPlanned: numeric('qty_planned', { precision: 12, scale: 4 }).notNull(),
    qtyDispatched: numeric('qty_dispatched', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    qtyReceived: numeric('qty_received', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    uom: text('uom').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_transfer_lines_order_id').on(table.transferOrderId),
    index('idx_transfer_lines_sku_id').on(table.skuId),
  ],
)

export type TransferOrderLine = typeof transferOrderLines.$inferSelect
export type NewTransferOrderLine = typeof transferOrderLines.$inferInsert

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const transferOrdersRelations = relations(transferOrders, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [transferOrders.orgId],
    references: [organizations.id],
  }),
  fromSite: one(sites, {
    fields: [transferOrders.fromSiteId],
    references: [sites.id],
    relationName: 'transferFromSite',
  }),
  toSite: one(sites, {
    fields: [transferOrders.toSiteId],
    references: [sites.id],
    relationName: 'transferToSite',
  }),
  fromLocation: one(locations, {
    fields: [transferOrders.fromLocationId],
    references: [locations.id],
    relationName: 'transferFromLocation',
  }),
  toLocation: one(locations, {
    fields: [transferOrders.toLocationId],
    references: [locations.id],
    relationName: 'transferToLocation',
  }),
  requestedByUser: one(users, {
    fields: [transferOrders.requestedBy],
    references: [users.id],
    relationName: 'transferRequestedBy',
  }),
  approvedByUser: one(users, {
    fields: [transferOrders.approvedBy],
    references: [users.id],
    relationName: 'transferApprovedBy',
  }),
  lines: many(transferOrderLines),
}))

export const transferOrderLinesRelations = relations(transferOrderLines, ({ one }) => ({
  transferOrder: one(transferOrders, {
    fields: [transferOrderLines.transferOrderId],
    references: [transferOrders.id],
  }),
  sku: one(skus, {
    fields: [transferOrderLines.skuId],
    references: [skus.id],
  }),
  batch: one(batches, {
    fields: [transferOrderLines.batchId],
    references: [batches.id],
  }),
  fromLocation: one(locations, {
    fields: [transferOrderLines.fromLocationId],
    references: [locations.id],
    relationName: 'lineFromLocation',
  }),
  toLocation: one(locations, {
    fields: [transferOrderLines.toLocationId],
    references: [locations.id],
    relationName: 'lineToLocation',
  }),
}))
