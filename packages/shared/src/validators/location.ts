import { z } from 'zod'

export const LOCATION_LEVELS = [
  'site',
  'building',
  'floor',
  'zone',
  'row',
  'column',
  'shelf'
] as const

// Helper to handle optional fields that can be empty strings
const preprocessOptionalNumber = (val: unknown) => {
  if (val === '' || val === null || val === undefined) {
    return undefined
  }
  if (typeof val === 'string' && val.trim() === '') {
    return undefined
  }
  return val
}

const preprocessOptionalString = (val: unknown) => {
  if (val === '' || val === null || val === undefined) {
    return undefined
  }
  if (typeof val === 'string' && val.trim() === '') {
    return undefined
  }
  return String(val).trim()
}

/**
 * Validates level sequence and hierarchy rules in the location tree.
 * Depth Index: site (0) → building (1) → floor (2) → zone (3) → row (4) → column (5) → shelf (6).
 */
export function validateHierarchy(level: string, parentLevel: string | null): boolean {
  if (parentLevel === null) {
    // Top-level root locations under a site
    return ['site', 'building', 'floor', 'zone'].includes(level)
  }

  if (level === 'building') {
    return parentLevel === 'site'
  }
  if (level === 'floor') {
    return ['site', 'building'].includes(parentLevel)
  }
  if (level === 'zone') {
    return ['site', 'building', 'floor'].includes(parentLevel)
  }
  if (level === 'row') {
    return parentLevel === 'zone'
  }
  if (level === 'column') {
    return parentLevel === 'row'
  }
  if (level === 'shelf') {
    return ['column', 'row'].includes(parentLevel)
  }

  return false
}

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
  siteId: z.string().uuid().optional(),
  parentId: z.string().uuid().optional().nullable(),
  name: z.string().min(1).max(100),
  code: z
    .string()
    .min(1)
    .max(50)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/)),
  level: z.enum(LOCATION_LEVELS),
  isStorage: z.boolean().default(false),
  capacity: z.preprocess(preprocessOptionalNumber, z.coerce.number().positive().optional()),
  capacityUnit: z.preprocess(preprocessOptionalString, z.string().max(20).optional()),
  maxWeight: z.preprocess(preprocessOptionalNumber, z.coerce.number().positive().optional()),
  maxVolume: z.preprocess(preprocessOptionalNumber, z.coerce.number().positive().optional()),
  notes: z.preprocess(preprocessOptionalString, z.string().max(1000).optional()),
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
