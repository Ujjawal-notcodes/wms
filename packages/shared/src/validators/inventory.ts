import { z } from 'zod'

export const INVENTORY_STATES = [
  'available',
  'reserved',
  'in_production',
  'qc_hold',
  'damaged',
  'returned',
  'in_transit',
] as const

export const STOCK_EVENT_TYPES = [
  'opening_balance',
  'inbound_receipt',
  'adjustment_positive',
  'adjustment_negative',
  'transfer_out',
  'transfer_in',
  'location_transfer',
] as const

// Centralized constants for application stock events
export const StockEventTypes = {
  OPENING_BALANCE: 'opening_balance',
  TRANSFER_IN: 'transfer_in',
  TRANSFER_OUT: 'transfer_out',
  ADJUSTMENT: 'adjustment',
  CYCLE_COUNT: 'cycle_count',
} as const

export type StockEventType = typeof StockEventTypes[keyof typeof StockEventTypes]

// Query schemas
export const inventoryQuerySchema = z.object({
  skuId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional(),
  state: z.enum(INVENTORY_STATES).optional(),
  minQty: z.coerce.number().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

export const stockMovementQuerySchema = z.object({
  skuId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
  siteId: z.string().uuid().optional(),
  eventType: z.string().optional(),
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
})

// Mutation schemas
export const createOpeningBalanceSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().positive(),
  remarks: z.string().max(500).optional(),
})

export const createAdjustmentSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  quantity: z.number().refine((q) => q !== 0, {
    message: 'Adjustment quantity cannot be zero',
  }),
  reason: z.string().min(1).max(100),
  notes: z.string().max(500).optional(),
})

export type InventoryQueryInput = z.infer<typeof inventoryQuerySchema>
export type StockMovementQueryInput = z.infer<typeof stockMovementQuerySchema>
export type CreateOpeningBalanceInput = z.infer<typeof createOpeningBalanceSchema>
export type CreateAdjustmentInput = z.infer<typeof createAdjustmentSchema>
