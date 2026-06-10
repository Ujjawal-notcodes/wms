/**
 * @fileoverview Core Inventory schema.
 *
 * Two tables:
 *   1. stock_ledger  — APPEND-ONLY event log (ground truth). Never UPDATE or DELETE.
 *   2. inventory_balances — Derived, maintained by trigger. Used for all balance reads.
 *
 * The Movement Engine is the ONLY path to write to these tables.
 *
 * Also includes:
 *   3. document_sequences — auto-numbering for transactional documents
 */

import {
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { inventoryStateEnum, stockEventTypeEnum } from './enums.js'
import { organizations, sites } from './organizations.js'
import { locations } from './locations.js'
import { skus, batches } from './catalog.js'
import { users } from './auth.js'

// ─────────────────────────────────────────────────────────────
// Stock Ledger — APPEND ONLY. Ground truth.
// ─────────────────────────────────────────────────────────────

export const stockLedger = pgTable(
  'stock_ledger',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    eventType: stockEventTypeEnum('event_type').notNull(),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => skus.id),
    batchId: uuid('batch_id').references(() => batches.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    /**
     * Signed quantity:
     *   positive (+) = stock entering this location
     *   negative (-) = stock leaving this location
     */
    qty: numeric('qty', { precision: 14, scale: 6 }).notNull(),
    uom: text('uom').notNull(),
    inventoryState: inventoryStateEnum('inventory_state').notNull(),
    /**
     * Links back to the source document (transfer_order, adjustment, etc.)
     * Always set — provides full traceability.
     */
    referenceType: text('reference_type'), // 'transfer_order' | 'adjustment' | 'manual'
    referenceId: uuid('reference_id'),
    referenceLineId: uuid('reference_line_id'),
    performedBy: uuid('performed_by')
      .notNull()
      .references(() => users.id),
    performedAt: timestamp('performed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    notes: text('notes'),
    metadata: jsonb('metadata').notNull().default({}),
  },
  (table) => [
    // Primary query pattern: stock history for a SKU at a location
    index('idx_stock_ledger_sku_location_time').on(
      table.skuId,
      table.locationId,
      table.performedAt,
    ),
    // Reference lookups: find all ledger entries for a document
    index('idx_stock_ledger_reference').on(table.referenceType, table.referenceId),
    // Time-range queries for reports
    index('idx_stock_ledger_performed_at').on(table.performedAt),
    // Site-level reporting
    index('idx_stock_ledger_site_time').on(table.siteId, table.performedAt),
    // Idempotency check: prevent double-posting a line
    index('idx_stock_ledger_ref_line').on(table.referenceLineId, table.eventType),
  ],
)

export type StockLedgerEntry = typeof stockLedger.$inferSelect
export type NewStockLedgerEntry = typeof stockLedger.$inferInsert

// ─────────────────────────────────────────────────────────────
// Inventory Balances — Maintained by DB trigger on stock_ledger
// ─────────────────────────────────────────────────────────────

export const inventoryBalances = pgTable(
  'inventory_balances',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => skus.id),
    batchId: uuid('batch_id').references(() => batches.id),
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id),
    inventoryState: inventoryStateEnum('inventory_state').notNull(),
    qtyOnHand: numeric('qty_on_hand', { precision: 14, scale: 6 })
      .notNull()
      .default('0'),
    uom: text('uom').notNull(),
    lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    // Fast lookup by SKU
    index('idx_inventory_balances_sku').on(table.skuId),
    // Location drill-down
    index('idx_inventory_balances_location').on(table.locationId),
    // Site-level stock summary
    index('idx_inventory_balances_site_sku').on(table.siteId, table.skuId),
    // Filter by state (e.g., show only available stock)
    index('idx_inventory_balances_state').on(table.inventoryState),
    // Low-stock alert query: (orgId, skuId) for cross-location totals
    index('idx_inventory_balances_org_sku').on(table.orgId, table.skuId),
  ],
)

export type InventoryBalance = typeof inventoryBalances.$inferSelect
export type NewInventoryBalance = typeof inventoryBalances.$inferInsert

// ─────────────────────────────────────────────────────────────
// Document Sequences — Auto-numbering per document type per year
// ─────────────────────────────────────────────────────────────

export const documentSequences = pgTable(
  'document_sequences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    // e.g. 'TRF', 'ADJ', 'GRN'
    docType: text('doc_type').notNull(),
    year: numeric('year', { precision: 4, scale: 0 }).notNull(),
    lastSeq: numeric('last_seq', { precision: 10, scale: 0 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_doc_sequences_org_type_year').on(table.orgId, table.docType, table.year),
  ],
)

export type DocumentSequence = typeof documentSequences.$inferSelect

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const stockLedgerRelations = relations(stockLedger, ({ one }) => ({
  organization: one(organizations, {
    fields: [stockLedger.orgId],
    references: [organizations.id],
  }),
  sku: one(skus, {
    fields: [stockLedger.skuId],
    references: [skus.id],
  }),
  batch: one(batches, {
    fields: [stockLedger.batchId],
    references: [batches.id],
  }),
  location: one(locations, {
    fields: [stockLedger.locationId],
    references: [locations.id],
  }),
  site: one(sites, {
    fields: [stockLedger.siteId],
    references: [sites.id],
  }),
  performedByUser: one(users, {
    fields: [stockLedger.performedBy],
    references: [users.id],
  }),
}))

export const inventoryBalancesRelations = relations(inventoryBalances, ({ one }) => ({
  organization: one(organizations, {
    fields: [inventoryBalances.orgId],
    references: [organizations.id],
  }),
  sku: one(skus, {
    fields: [inventoryBalances.skuId],
    references: [skus.id],
  }),
  batch: one(batches, {
    fields: [inventoryBalances.batchId],
    references: [batches.id],
  }),
  location: one(locations, {
    fields: [inventoryBalances.locationId],
    references: [locations.id],
  }),
  site: one(sites, {
    fields: [inventoryBalances.siteId],
    references: [sites.id],
  }),
}))
