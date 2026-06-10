import { z } from 'zod'

const TRANSFER_TYPES = ['factory_to_warehouse', 'warehouse_to_factory', 'internal_move', 'inter_warehouse'] as const

export const createTransferSchema = z.object({
  transferType: z.enum(TRANSFER_TYPES),
  fromSiteId: z.string().uuid(),
  toSiteId: z.string().uuid(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  vehicleNo: z.string().max(50).optional(),
  notes: z.string().max(500).optional(),
  lines: z.array(z.object({
    skuId: z.string().uuid(),
    batchId: z.string().uuid().optional(),
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    qtyPlanned: z.number().positive(),
    uom: z.string().min(1),
    notes: z.string().optional(),
  })).min(1, 'At least one transfer line is required'),
})

export const receiveTransferSchema = z.object({
  lines: z.array(z.object({
    lineId: z.string().uuid(),
    qtyReceived: z.number().min(0),
    notes: z.string().optional(),
  })).min(1),
  notes: z.string().optional(),
})

export const transferQuerySchema = z.object({
  status: z.enum(['draft', 'approved', 'in_transit', 'received', 'partial', 'cancelled']).optional(),
  fromSiteId: z.string().uuid().optional(),
  toSiteId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>
export type ReceiveTransferInput = z.infer<typeof receiveTransferSchema>
export type TransferQueryInput = z.infer<typeof transferQuerySchema>
