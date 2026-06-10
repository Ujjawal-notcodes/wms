/**
 * @fileoverview Location hierarchy schema.
 *
 * Hierarchy: Site → Building → Floor → Rack → Bin → Shelf
 * Uses a self-referencing tree with materialized paths for efficient subtree queries.
 *
 * Path format: "FAC/BLD-A/F1/R3/B5/S2"
 * Only leaf nodes with is_storage=true can hold inventory.
 */
import { boolean, index, jsonb, numeric, pgTable, text, timestamp, unique, uuid, } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { locationLevelEnum } from './enums.js';
import { sites } from './organizations.js';
// ─────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────
export const locations = pgTable('locations', {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
        .notNull()
        .references(() => sites.id),
    parentId: uuid('parent_id').references(() => locations.id),
    name: text('name').notNull(),
    code: text('code').notNull(),
    level: locationLevelEnum('level').notNull(),
    // Materialized path for efficient subtree queries:
    // WHERE path LIKE 'FAC/BLD-A/%'
    path: text('path').notNull(),
    // Only storage locations (bins/shelves) can hold inventory
    isStorage: boolean('is_storage').notNull().default(false),
    capacity: numeric('capacity', { precision: 12, scale: 4 }),
    capacityUnit: text('capacity_unit'),
    isActive: boolean('is_active').notNull().default(true),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
    unique('locations_site_path_unique').on(table.siteId, table.path),
    index('idx_locations_site_id').on(table.siteId),
    index('idx_locations_path').on(table.path),
    index('idx_locations_parent_id').on(table.parentId),
    index('idx_locations_level').on(table.level),
    index('idx_locations_is_storage').on(table.isStorage),
]);
// ─────────────────────────────────────────────────────────────
// Relations
// ─────────────────────────────────────────────────────────────
export const locationsRelations = relations(locations, ({ one, many }) => ({
    site: one(sites, {
        fields: [locations.siteId],
        references: [sites.id],
    }),
    parent: one(locations, {
        fields: [locations.parentId],
        references: [locations.id],
        relationName: 'locationChildren',
    }),
    children: many(locations, { relationName: 'locationChildren' }),
}));
//# sourceMappingURL=locations.js.map