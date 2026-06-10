/**
 * @fileoverview SKU Catalog schema.
 * Covers: sku_categories, skus, batches.
 *
 * SKU types (Phase 1):
 *   raw_material, component, semi_finished, finished_good, packaging, consumable
 *
 * Full-text search on sku_code + name via GIN index.
 */

import {
  AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'
import { skuTypeEnum, qcStatusEnum } from './enums.js'
import { organizations } from './organizations.js'
import { users } from './auth.js'

// ─────────────────────────────────────────────────────────────
// SKU Categories (tree structure)
// ─────────────────────────────────────────────────────────────

export const skuCategories = pgTable(
  'sku_categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => skuCategories.id,
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_sku_categories_org_id').on(table.orgId),
    index('idx_sku_categories_parent_id').on(table.parentId),
  ],
)

export type SkuCategory = typeof skuCategories.$inferSelect
export type NewSkuCategory = typeof skuCategories.$inferInsert

// ─────────────────────────────────────────────────────────────
// SKUs (master catalog)
// ─────────────────────────────────────────────────────────────

export const skus = pgTable(
  'skus',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id),
    skuCode: text('sku_code').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    categoryId: uuid('category_id').references(() => skuCategories.id),
    skuType: skuTypeEnum('sku_type').notNull(),
    uom: text('uom').notNull().default('pcs'),
    weightKg: numeric('weight_kg', { precision: 10, scale: 4 }),
    dimensions: jsonb('dimensions'),   // { length, width, height, unit }
    hsnCode: text('hsn_code'),
    barcode: text('barcode'),
    imageUrl: text('image_url'),
    reorderPoint: numeric('reorder_point', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    reorderQty: numeric('reorder_qty', { precision: 12, scale: 4 })
      .notNull()
      .default('0'),
    leadTimeDays: integer('lead_time_days').notNull().default(0),
    isBatchTracked: boolean('is_batch_tracked').notNull().default(true),
    isActive: boolean('is_active').notNull().default(true),
    tags: text('tags').array().notNull().default(sql`ARRAY[]::text[]`),
    metadata: jsonb('metadata').notNull().default({}),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }), // soft delete
  },
  (table) => [
    index('idx_skus_sku_type').on(table.skuType),
    index('idx_skus_category_id').on(table.categoryId),
    index('idx_skus_is_active').on(table.isActive),
    index('idx_skus_org_id').on(table.orgId),
    // Full-text search index — used for instant SKU search
    index('idx_skus_fts').using(
      'gin',
      sql`to_tsvector('english', ${table.skuCode} || ' ' || ${table.name} || ' ' || COALESCE(${table.description}, ''))`,
    ),
    // GIN index for tag array search
    index('idx_skus_tags').using('gin', table.tags),
  ],
)

export type Sku = typeof skus.$inferSelect
export type NewSku = typeof skus.$inferInsert

// ─────────────────────────────────────────────────────────────
// Batches / Lot Numbers
// ─────────────────────────────────────────────────────────────

export const batches = pgTable(
  'batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    skuId: uuid('sku_id')
      .notNull()
      .references(() => skus.id),
    batchNo: text('batch_no').notNull(),
    lotNo: text('lot_no'),
    expiryDate: date('expiry_date'),
    manufactureDate: date('manufacture_date'),
    supplierRef: text('supplier_ref'),
    qcStatus: qcStatusEnum('qc_status').notNull().default('pending'),
    qcNotes: text('qc_notes'),
    qcBy: uuid('qc_by').references(() => users.id),
    qcAt: timestamp('qc_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_batches_sku_id').on(table.skuId),
    index('idx_batches_expiry_date').on(table.expiryDate),
    index('idx_batches_qc_status').on(table.qcStatus),
  ],
)

export type Batch = typeof batches.$inferSelect
export type NewBatch = typeof batches.$inferInsert

// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────

export const skuCategoriesRelations = relations(skuCategories, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [skuCategories.orgId],
    references: [organizations.id],
  }),
  parent: one(skuCategories, {
    fields: [skuCategories.parentId],
    references: [skuCategories.id],
    relationName: 'categoryChildren',
  }),
  children: many(skuCategories, { relationName: 'categoryChildren' }),
  skus: many(skus),
}))

export const skusRelations = relations(skus, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [skus.orgId],
    references: [organizations.id],
  }),
  category: one(skuCategories, {
    fields: [skus.categoryId],
    references: [skuCategories.id],
  }),
  createdByUser: one(users, {
    fields: [skus.createdBy],
    references: [users.id],
  }),
  batches: many(batches),
}))

export const batchesRelations = relations(batches, ({ one }) => ({
  sku: one(skus, {
    fields: [batches.skuId],
    references: [skus.id],
  }),
  qcByUser: one(users, {
    fields: [batches.qcBy],
    references: [users.id],
  }),
}))
