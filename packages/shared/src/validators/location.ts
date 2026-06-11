import { z } from 'zod'

const LOCATION_LEVELS = ['building', 'floor', 'rack', 'bin', 'shelf', 'store'] as const

// ─────────────────────────────────────────────────────────────
// Sites
// ─────────────────────────────────────────────────────────────

export const createSiteSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9\-_]+$/),
  siteType: z.enum(['factory', 'warehouse', '3pl', 'transit']),
  isActive: z.boolean().default(true),
})

export const updateSiteSchema = createSiteSchema.omit({ code: true }).partial()

export type CreateSiteInput = z.infer<typeof createSiteSchema>
export type UpdateSiteInput = z.infer<typeof updateSiteSchema>

// ─────────────────────────────────────────────────────────────
// Locations
// ─────────────────────────────────────────────────────────────

export const createLocationSchema = z.object({
  siteId: z.string().uuid(),
  parentId: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50).regex(/^[A-Z0-9\-_]+$/),
  level: z.enum(LOCATION_LEVELS),
  isStorage: z.boolean().default(false),
  capacity: z.coerce.number().positive().optional(),
  capacityUnit: z.string().max(20).optional(),
  maxWeight: z.coerce.number().positive().optional(),
  maxVolume: z.coerce.number().positive().optional(),
  notes: z.string().max(1000).optional(),
  isActive: z.boolean().default(true),
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
