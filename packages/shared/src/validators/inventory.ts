import { z } from 'zod'

const INVENTORY_STATES = ['available', 'reserved', 'in_production', 'qc_hold', 'damaged', 'returned', 'in_transit'] as const
const STOCK_EVENT_TYPES = ['opening_balance', 'inbound_receipt', 'adjustment_positive', 'adjustment_negative', 'transfer_out', 'transfer_in', 'location_transfer'] as const

export const inventoryQuerySchema = z.object({
  skuId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  state: z.enum(INVENTORY_STATES).optional(),
  minQty: z.coerce.number().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const stockMovementQuerySchema = z.object({
  skuId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  eventType: z.enum(STOCK_EVENT_TYPES).optional(),
  referenceType: z.string().optional(),
  referenceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const openingBalanceSchema = z.object({
  lines: z.array(z.object({
    skuId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    locationId: z.string().uuid(),
    qty: z.number().positive(),
    uom: z.string().min(1),
    inventoryState: z.enum(INVENTORY_STATES).default('available'),
    notes: z.string().optional(),
  })).min(1),
})

export const stockAdjustmentSchema = z.object({
  locationId: z.string().uuid(),
  notes: z.string().optional(),
  lines: z.array(z.object({
    skuId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    qtySystem: z.number(),
    qtyCounted: z.number().min(0),
    uom: z.string().min(1),
    reason: z.string().optional(),
  })).min(1),
})

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>
export type StockMovementQueryInput = z.infer<typeof stockMovementQuerySchema>
export type OpeningBalanceInput = z.infer<typeof openingBalanceSchema>
export type StockAdjustmentInput = z.infer<typeof stockAdjustmentSchema>
