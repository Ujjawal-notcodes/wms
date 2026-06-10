/**
 * @fileoverview All PostgreSQL enum definitions for the WMS.
 * Enums are shared across multiple schema files.
 * Matches exactly the CREATE TYPE statements in 0001_initial.sql
 */
export declare const siteTypeEnum: import("drizzle-orm/pg-core").PgEnum<["factory", "warehouse", "3pl", "transit"]>;
export declare const locationLevelEnum: import("drizzle-orm/pg-core").PgEnum<["building", "floor", "rack", "bin", "shelf"]>;
export declare const skuTypeEnum: import("drizzle-orm/pg-core").PgEnum<["raw_material", "component", "semi_finished", "finished_good", "packaging", "consumable"]>;
export declare const qcStatusEnum: import("drizzle-orm/pg-core").PgEnum<["pending", "passed", "failed", "conditionally_passed"]>;
export declare const inventoryStateEnum: import("drizzle-orm/pg-core").PgEnum<["available", "reserved", "in_production", "qc_hold", "damaged", "returned", "in_transit"]>;
export declare const stockEventTypeEnum: import("drizzle-orm/pg-core").PgEnum<["opening_balance", "inbound_receipt", "adjustment_positive", "adjustment_negative", "transfer_out", "transfer_in", "location_transfer"]>;
export declare const transferTypeEnum: import("drizzle-orm/pg-core").PgEnum<["factory_to_warehouse", "warehouse_to_factory", "internal_move", "inter_warehouse"]>;
export declare const transferStatusEnum: import("drizzle-orm/pg-core").PgEnum<["draft", "approved", "in_transit", "received", "partial", "cancelled"]>;
