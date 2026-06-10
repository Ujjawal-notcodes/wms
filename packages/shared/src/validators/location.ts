import { z } from 'zod'

const LOCATION_LEVELS = ['building', 'floor', 'rack', 'bin', 'shelf'] as const

export const createLocationSchema = z.object({
  siteId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9\-_]+$/),
  level: z.enum(LOCATION_LEVELS),
  isStorage: z.boolean().default(false),
  capacity: z.number().positive().optional(),
  capacityUnit: z.string().max(20).optional(),
  metadata: z.record(z.unknown()).default({}),
})

export const updateLocationSchema = createLocationSchema
  .omit({ siteId: true, parentId: true, code: true, level: true })
  .partial()

export const locationQuerySchema = z.object({
  siteId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional().nullable(),
  level: z.enum(LOCATION_LEVELS).optional(),
  isStorage: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  pathPrefix: z.string().optional(), // e.g. "FAC/RAW-STORE"
})

export type CreateLocationInput = z.infer<typeof createLocationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type LocationQueryInput = z.infer<typeof locationQuerySchema>
