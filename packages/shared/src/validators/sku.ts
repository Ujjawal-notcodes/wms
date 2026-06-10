import { z } from 'zod'

const SKU_TYPES = ['raw_material', 'component', 'semi_finished', 'finished_good', 'packaging', 'consumable'] as const

export const createSkuSchema = z.object({
  skuCode: z.string().min(2).max(50).regex(/^[A-Z0-9\-_]+$/, 'SKU code must be uppercase alphanumeric with hyphens/underscores'),
  name: z.string().min(2).max(200),
  description: z.string().max(1000).optional(),
  categoryId: z.string().uuid().optional(),
  skuType: z.enum(SKU_TYPES),
  uom: z.string().min(1).max(20).default('pcs'),
  weightKg: z.number().positive().optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
    unit: z.enum(['mm', 'cm', 'm', 'in']),
  }).optional(),
  hsnCode: z.string().max(20).optional(),
  barcode: z.string().max(50).optional(),
  imageUrl: z.string().url().optional(),
  reorderPoint: z.number().min(0).default(0),
  reorderQty: z.number().min(0).default(0),
  leadTimeDays: z.number().int().min(0).default(0),
  isBatchTracked: z.boolean().default(true),
  isActive: z.boolean().default(true),
  tags: z.array(z.string().max(50)).max(20).default([]),
  metadata: z.record(z.unknown()).default({}),
})

export const updateSkuSchema = createSkuSchema.partial().omit({ skuCode: true })

export const skuQuerySchema = z.object({
  q: z.string().optional(),
  skuType: z.enum(SKU_TYPES).optional(),
  categoryId: z.string().uuid().optional(),
  isActive: z.coerce.boolean().optional(),
  tags: z.string().optional(), // comma-separated
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export const createSkuCategorySchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9\-_]+$/),
  parentId: z.string().uuid().optional(),
})

export type CreateSkuInput = z.infer<typeof createSkuSchema>
export type UpdateSkuInput = z.infer<typeof updateSkuSchema>
export type SkuQueryInput = z.infer<typeof skuQuerySchema>
export type CreateSkuCategoryInput = z.infer<typeof createSkuCategorySchema>
