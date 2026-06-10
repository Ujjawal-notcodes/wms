/**
 * @fileoverview Location hierarchy schema.
 *
 * Hierarchy: Site → Building → Floor → Rack → Bin → Shelf
 * Uses a self-referencing tree with materialized paths for efficient subtree queries.
 *
 * Path format: "FAC/BLD-A/F1/R3/B5/S2"
 * Only leaf nodes with is_storage=true can hold inventory.
 */
export declare const locations: any;
export type Location = typeof locations.$inferSelect;
export type NewLocation = typeof locations.$inferInsert;
export declare const locationsRelations: import("drizzle-orm").Relations<string, {
    site: import("drizzle-orm").One<"sites", false>;
    parent: import("drizzle-orm").One<any, false>;
    children: import("drizzle-orm").Many<any>;
}>;
