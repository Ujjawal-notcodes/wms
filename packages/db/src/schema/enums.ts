/**
 * @fileoverview All PostgreSQL enum definitions for the WMS.
 * Enums are shared across multiple schema files.
 * Matches exactly the CREATE TYPE statements in 0001_initial.sql
 */

import { pgEnum } from 'drizzle-orm/pg-core'

// ─────────────────────────────────────────────────────────────
// Site & Location
// ─────────────────────────────────────────────────────────────

export const siteTypeEnum = pgEnum('site_type', [
  'factory',
  'warehouse',
  '3pl',
  'transit',
])

export const locationLevelEnum = pgEnum('location_level', [
  'building',
  'floor',
  'rack',
  'bin',
  'shelf',
  'store',
])

// ─────────────────────────────────────────────────────────────
// SKU Catalog
// ─────────────────────────────────────────────────────────────

export const skuTypeEnum = pgEnum('sku_type', [
  'raw_material',
  'component',
  'semi_finished',
  'finished_good',
  'packaging',
  'consumable',
])

export const qcStatusEnum = pgEnum('qc_status', [
  'pending',
  'passed',
  'failed',
  'conditionally_passed',
])

// ─────────────────────────────────────────────────────────────
// Inventory
// ─────────────────────────────────────────────────────────────

export const inventoryStateEnum = pgEnum('inventory_state', [
  'available',
  'reserved',
  'in_production',
  'qc_hold',
  'damaged',
  'returned',
  'in_transit',
])

export const stockEventTypeEnum = pgEnum('stock_event_type', [
  'opening_balance',      // initial stock entry
  'inbound_receipt',      // goods received (GRN)
  'adjustment_positive',  // stock count variance — up
  'adjustment_negative',  // stock count variance — down
  'transfer_out',         // leaves source location (in_transit)
  'transfer_in',          // arrives at destination
  'location_transfer',    // bin-to-bin within same site
])

// ─────────────────────────────────────────────────────────────
// Transfers
// ─────────────────────────────────────────────────────────────

export const transferTypeEnum = pgEnum('transfer_type', [
  'factory_to_warehouse',
  'warehouse_to_factory',
  'internal_move',
  'inter_warehouse',
])

export const transferStatusEnum = pgEnum('transfer_status', [
  'draft',
  'approved',
  'in_transit',
  'received',
  'partial',
  'cancelled',
])
