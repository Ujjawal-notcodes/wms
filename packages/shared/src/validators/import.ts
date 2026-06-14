/**
 * @fileoverview Shared validators for the Excel Import System.
 * Used by both API (validation) and frontend (type safety).
 */

import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// Location Import
// ─────────────────────────────────────────────────────────────

/**
 * One row from the Location Import template.
 * All 6 columns are required. Any subset of levels can be present;
 * the service will create only what is specified.
 */
export const locationImportRowSchema = z.object({
  site: z.string().min(1, 'Site is required').max(100),
  building: z.string().min(1, 'Building is required').max(100),
  floor: z.string().max(100).optional(),
  rack: z.string().max(100).optional(),
  bin: z.string().max(100).optional(),
  shelf: z.string().max(100).optional(),
})

export type LocationImportRow = z.infer<typeof locationImportRowSchema>

export interface LocationImportValidationResult {
  valid: LocationImportRow[]
  errors: LocationImportRowError[]
  summary: {
    totalRows: number
    validRows: number
    errorRows: number
  }
}

export interface LocationImportRowError {
  row: number
  data: Record<string, unknown>
  errors: string[]
}

// ─────────────────────────────────────────────────────────────
// SKU Import
// ─────────────────────────────────────────────────────────────

export const SKU_TYPES = [
  'raw_material',
  'component',
  'semi_finished',
  'finished_good',
  'packaging',
  'consumable',
] as const

export const skuImportRowSchema = z.object({
  sku_code: z
    .string()
    .min(1, 'SKU Code is required')
    .max(50)
    .regex(/^[A-Za-z0-9\-_]+$/, 'SKU Code must be alphanumeric (hyphens/underscores allowed)'),
  name: z.string().min(1, 'Name is required').max(200),
  sku_type: z.enum(SKU_TYPES, {
    errorMap: () => ({
      message: `SKU Type must be one of: ${SKU_TYPES.join(', ')}`,
    }),
  }),
  uom: z.string().min(1, 'UOM is required').max(20),
  description: z.string().max(500).optional(),
  category_code: z.string().max(50).optional(),
  hsn_code: z.string().max(20).optional(),
  barcode: z.string().max(50).optional(),
  weight_kg: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive().optional(),
  ),
  reorder_point: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
    z.number().min(0).default(0),
  ),
  reorder_qty: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
    z.number().min(0).default(0),
  ),
  lead_time_days: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 0 : Number(v)),
    z.number().int().min(0).default(0),
  ),
  is_batch_tracked: z.preprocess(
    (v) => {
      if (v === true || v === 'true' || v === 'yes' || v === 'YES' || v === 1 || v === '1') return true
      return false
    },
    z.boolean().default(false),
  ),
})

export type SkuImportRow = z.infer<typeof skuImportRowSchema>

export interface SkuImportValidationResult {
  valid: SkuImportRow[]
  errors: SkuImportRowError[]
  summary: {
    totalRows: number
    validRows: number
    errorRows: number
    skipped: number
  }
}

export interface SkuImportRowError {
  row: number
  skuCode?: string
  data: Record<string, unknown>
  errors: string[]
}

// ─────────────────────────────────────────────────────────────
// Opening Stock Import
// ─────────────────────────────────────────────────────────────

export const openingStockImportRowSchema = z.object({
  sku_code: z.string().min(1, 'SKU Code is required').max(50),
  location_path: z.string().min(1, 'Location Path is required').max(300),
  quantity: z.preprocess(
    (v) => Number(v),
    z.number().positive('Quantity must be greater than 0'),
  ),
  remarks: z.string().max(500).optional(),
})

export type OpeningStockImportRow = z.infer<typeof openingStockImportRowSchema>

export interface OpeningStockImportValidationResult {
  valid: OpeningStockImportRow[]
  errors: OpeningStockImportRowError[]
  summary: {
    totalRows: number
    validRows: number
    errorRows: number
  }
}

export interface OpeningStockImportRowError {
  row: number
  skuCode?: string
  data: Record<string, unknown>
  errors: string[]
}
