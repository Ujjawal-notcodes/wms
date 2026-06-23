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
 */
export const locationImportRowSchema = z.object({
  building_code: z
    .string()
    .min(1, 'Building Code is required')
    .max(50)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Building Code must be alphanumeric and hyphen only')),
  building_name: z.string().min(1, 'Building Name is required').max(100),
  floor_code: z
    .string()
    .min(1, 'Floor Code is required')
    .max(50)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Floor Code must be alphanumeric and hyphen only')),
  floor_name: z.string().min(1, 'Floor Name is required').max(100),
  locator_code: z
    .string()
    .min(1, 'Locator Code is required')
    .max(100)
    .transform((val) => val.trim().toUpperCase())
    .refine(
      (val) => {
        const parts = val.split('-')
        if (parts.length !== 3) return false
        return parts.every((part) => /^[A-Z0-9]+$/.test(part))
      },
      {
        message: "Locator Code must be in the format 'ZONE-ROW-COLUMN' (e.g. Z01-R02-C04) with uppercase alphanumeric parts",
      },
    ),
  notes: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().max(500).optional(),
  ),
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
  category_code: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().max(50).optional(),
  ),
  sku_type: z.enum(SKU_TYPES, {
    errorMap: () => ({
      message: `SKU Type must be one of: ${SKU_TYPES.join(', ')}`,
    }),
  }),
  uom: z.string().min(1, 'UOM is required').max(20),
  weight: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().positive().optional(),
  ),
  is_batch_tracked: z.preprocess(
    (v) => {
      if (v === true || v === 'true' || v === 'yes' || v === 'YES' || v === 1 || v === '1') return true
      return false
    },
    z.boolean().default(false),
  ),
  description: z.string().max(500).optional(),
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
  inventory_state: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? 'available' : String(v).trim().toLowerCase()),
    z.enum(['available', 'reserved', 'in_production', 'qc_hold', 'damaged', 'returned', 'in_transit'], {
      errorMap: () => ({
        message: 'inventory_state must be one of: available, reserved, in_production, qc_hold, damaged, returned, in_transit',
      }),
    }).default('available'),
  ),
  batch_no: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().max(100).optional(),
  ),
  expiry_date: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().optional(),
  ),
  manufacture_date: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : String(v).trim()),
    z.string().optional(),
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
