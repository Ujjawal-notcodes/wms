import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// MVP Transfer Schema — single-line, direct stock movement
// ─────────────────────────────────────────────────────────────

export const createTransferSchema = z.object({
  skuId: z.string().uuid({ message: 'Invalid SKU' }),
  fromLocationId: z.string().uuid({ message: 'Invalid source location' }),
  toLocationId: z.string().uuid({ message: 'Invalid destination location' }),
  quantity: z.number().positive({ message: 'Quantity must be greater than zero' }),
  notes: z.string().max(500).optional(),
}).refine(
  (data) => data.fromLocationId !== data.toLocationId,
  {
    message: 'Source and destination locations must be different',
    path: ['toLocationId'],
  },
)

// ─────────────────────────────────────────────────────────────
// Transfer List Query Schema
// ─────────────────────────────────────────────────────────────

export const transferQuerySchema = z.object({
  q: z.string().optional(),
  skuId: z.string().uuid().optional(),
  fromLocationId: z.string().uuid().optional(),
  toLocationId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(20),
})

export type CreateTransferInput = z.infer<typeof createTransferSchema>
export type TransferQueryInput = z.infer<typeof transferQuerySchema>
