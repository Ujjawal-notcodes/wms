import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, sites, locations, inventoryBalances, skus, batches, transferOrders, transferOrderLines, stockLedger } from '@wms/db'
import { eq, and, desc, isNull, sql, or, ilike, gt, inArray } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  createSiteSchema,
  updateSiteSchema,
  createLocationSchema,
  updateLocationSchema,
  validateHierarchy,
} from '@wms/shared'
import { buildAddressHelpers } from '../inventory/handlers.js'
import { z } from 'zod'

// ─────────────────────────────────────────────────────────────
// Locator Code Utilities
// ─────────────────────────────────────────────────────────────

/**
 * Computes a human-readable storage address from a location path.
 * For a column/shelf at path "SITE/BLD-A/F1/Z01/R02/C04",
 * returns "Z01-R02-C04" (last 3 path segments joined with "-").
 */
function buildLocatorCode(path: string, level: string): string | null {
  if (!['column', 'shelf'].includes(level)) return null
  const segs = path.split('/')
  // path depth: SITE/BLD/FLOOR/ZONE/ROW/COL = 6 segments minimum
  if (segs.length < 4) return null
  return segs.slice(-3).join('-')
}

/**
 * Storage address creation schema for the simplified 3-tier form.
 */
const createStorageAddressSchema = z.object({
  siteId: z.string().uuid().optional(),
  buildingId: z.string().uuid(),
  floorId: z.string().uuid(),
  zone: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Zone must be uppercase alphanumeric')),
  row: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Row must be uppercase alphanumeric')),
  column: z
    .string()
    .min(1)
    .max(20)
    .transform((val) => val.trim().toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9-]+$/, 'Column must be uppercase alphanumeric')),
  notes: z.string().max(1000).optional(),
})

const parentLocations = alias(locations, 'parent_locations')

// ─────────────────────────────────────────────────────────────
// Sites Handlers
// ─────────────────────────────────────────────────────────────

export async function listSites(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const data = await db
    .select()
    .from(sites)
    .where(eq(sites.orgId, orgId))
    .orderBy(desc(sites.createdAt))

  return reply.send(data)
}

export async function createSite(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = createSiteSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { name, code, siteType, isActive } = parsed.data

  const [existing] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.code, code), eq(sites.orgId, orgId)))

  if (existing) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: `Site code '${code}' is already registered`,
    })
  }

  const [newSite] = await db
    .insert(sites)
    .values({
      orgId,
      name,
      code,
      siteType,
      isActive: isActive ?? true,
    })
    .returning()

  return reply.status(201).send(newSite)
}

export async function updateSite(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = updateSiteSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const input = parsed.data

  const [original] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, id), eq(sites.orgId, orgId)))

  if (!original) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Site not found',
    })
  }

  const updateValues: Record<string, any> = {
    updatedAt: new Date(),
  }
  if (input.name !== undefined) updateValues.name = input.name
  if (input.siteType !== undefined) updateValues.siteType = input.siteType
  if (input.isActive !== undefined) updateValues.isActive = input.isActive

  const [updatedSite] = await db
    .update(sites)
    .set(updateValues)
    .where(eq(sites.id, id))
    .returning()

  return reply.send(updatedSite)
}

// ─────────────────────────────────────────────────────────────
// Locations Handlers
// ─────────────────────────────────────────────────────────────

export async function listLocations(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const data = await db
    .select({
      id: locations.id,
      siteId: locations.siteId,
      siteName: sites.name,
      siteCode: sites.code,
      parentId: locations.parentId,
      parentCode: parentLocations.code,
      parentName: parentLocations.name,
      name: locations.name,
      code: locations.code,
      level: locations.level,
      path: locations.path,
      isStorage: locations.isStorage,
      capacity: locations.capacity,
      capacityUnit: locations.capacityUnit,
      maxWeight: locations.maxWeight,
      maxVolume: locations.maxVolume,
      notes: locations.notes,
      isActive: locations.isActive,
      metadata: locations.metadata,
      createdAt: locations.createdAt,
      updatedAt: locations.updatedAt,
    })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .leftJoin(parentLocations, eq(locations.parentId, parentLocations.id))
    .where(and(eq(sites.orgId, orgId), isNull(locations.deletedAt)))
    .orderBy(desc(locations.createdAt))

  // Fetch all active inventory balances to extract stored SKU details
  const balances = await db
    .select({
      locationId: inventoryBalances.locationId,
      skuCode: skus.skuCode,
      skuName: skus.name,
    })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .where(and(eq(inventoryBalances.orgId, orgId), gt(inventoryBalances.qtyOnHand, '0')))

  const locationSkusMap = new Map<string, Set<string>>()
  for (const b of balances) {
    if (!locationSkusMap.has(b.locationId)) {
      locationSkusMap.set(b.locationId, new Set())
    }
    locationSkusMap.get(b.locationId)!.add(b.skuCode.toLowerCase())
    locationSkusMap.get(b.locationId)!.add(b.skuName.toLowerCase())
  }

  const enrichedData = data.map((loc) => {
    const skusSet = locationSkusMap.get(loc.id) || new Set<string>()
    const locatorCode = buildLocatorCode(loc.path, loc.level)
    return {
      ...loc,
      storedSkus: Array.from(skusSet),
      locatorCode,
    }
  })

  return reply.send(enrichedData)
}

export async function createLocation(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = createLocationSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const input = parsed.data

  // 1. Verify Site belongs to user's Organization (or auto-resolve if not specified)
  let siteId = input.siteId
  let siteObj: { id: string; code: string } | undefined

  if (siteId) {
    const [found] = await db
      .select({ id: sites.id, code: sites.code })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    siteObj = found
  } else {
    const [found] = await db
      .select({ id: sites.id, code: sites.code })
      .from(sites)
      .where(eq(sites.orgId, orgId))
      .limit(1)
    siteObj = found
    siteId = found?.id
  }

  if (!siteObj || !siteId) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified site does not exist or organization has no sites configured',
    })
  }

  // 2. Resolve parent details and path
  let parentLevel: string | null = null
  let parentPath = ''
  if (input.parentId) {
    const [parentObj] = await db
      .select({
        id: locations.id,
        path: locations.path,
        siteId: locations.siteId,
        level: locations.level,
      })
      .from(locations)
      .where(and(eq(locations.id, input.parentId), isNull(locations.deletedAt)))

    if (!parentObj) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Parent location does not exist or has been deleted',
      })
    }

    if (parentObj.siteId !== siteId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Parent location must belong to the same site',
      })
    }

    parentLevel = parentObj.level
    parentPath = parentObj.path
  }

  // 3. Enforce hierarchy validation
  if (!validateHierarchy(input.level, parentLevel)) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: `Invalid level sequence: location level '${input.level}' is not allowed under parent level '${parentLevel || 'site'}'`,
    })
  }

  // Code is already normalized to uppercase by createLocationSchema transform
  const computedPath = parentPath ? `${parentPath}/${input.code}` : `${siteObj.code}/${input.code}`

  // 4. Check duplicate path on site
  const [existingPath] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.siteId, siteId), eq(locations.path, computedPath), isNull(locations.deletedAt)))

  if (existingPath) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: `Location with path '${computedPath}' already exists under this site`,
    })
  }

  // 5. Insert location
  const [newLocation] = await db
    .insert(locations)
    .values({
      siteId: siteId,
      parentId: input.parentId || null,
      name: input.name,
      code: input.code,
      level: input.level,
      path: computedPath,
      isStorage: input.isStorage,
      capacity: input.capacity ? String(input.capacity) : null,
      capacityUnit: input.capacityUnit || null,
      maxWeight: input.maxWeight ? String(input.maxWeight) : null,
      maxVolume: input.maxVolume ? String(input.maxVolume) : null,
      notes: input.notes || null,
      metadata: input.metadata,
    })
    .returning()

  return reply.status(201).send(newLocation)
}

export async function getLocation(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [location] = await db
    .select({
      id: locations.id,
      siteId: locations.siteId,
      parentId: locations.parentId,
      parentCode: parentLocations.code,
      parentName: parentLocations.name,
      name: locations.name,
      code: locations.code,
      level: locations.level,
      path: locations.path,
      isStorage: locations.isStorage,
      capacity: locations.capacity,
      capacityUnit: locations.capacityUnit,
      maxWeight: locations.maxWeight,
      maxVolume: locations.maxVolume,
      notes: locations.notes,
      isActive: locations.isActive,
      metadata: locations.metadata,
      createdAt: locations.createdAt,
      updatedAt: locations.updatedAt,
    })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .leftJoin(parentLocations, eq(locations.parentId, parentLocations.id))
    .where(and(eq(locations.id, id), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (!location) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Location not found',
    })
  }

  return reply.send(location)
}

export async function updateLocation(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = updateLocationSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const input = parsed.data

  const [original] = await db
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, id), eq(sites.orgId, orgId)))

  if (!original) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Location not found',
    })
  }

  const updateValues: Record<string, any> = {
    updatedAt: new Date(),
  }
  if (input.name !== undefined) updateValues.name = input.name
  if (input.isStorage !== undefined) updateValues.isStorage = input.isStorage
  if (input.capacity !== undefined) updateValues.capacity = input.capacity !== null ? String(input.capacity) : null
  if (input.capacityUnit !== undefined) updateValues.capacityUnit = input.capacityUnit || null
  if (input.maxWeight !== undefined) updateValues.maxWeight = input.maxWeight !== null ? String(input.maxWeight) : null
  if (input.maxVolume !== undefined) updateValues.maxVolume = input.maxVolume !== null ? String(input.maxVolume) : null
  if (input.notes !== undefined) updateValues.notes = input.notes || null
  if (input.isActive !== undefined) updateValues.isActive = input.isActive
  if (input.metadata !== undefined) updateValues.metadata = input.metadata

  const [updatedLocation] = await db
    .update(locations)
    .set(updateValues)
    .where(eq(locations.id, id))
    .returning()

  return reply.send(updatedLocation)
}

export async function getLocationStock(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  // 1. Fetch location to verify it belongs to user's organization and exists
  const [targetLoc] = await db
    .select({ path: locations.path, siteId: locations.siteId })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, id), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (!targetLoc) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Location not found',
    })
  }

  // 2. Query all inventory balances at this location and its children
  const rawData = await db
    .select({
      id: inventoryBalances.id,
      skuId: inventoryBalances.skuId,
      skuCode: skus.skuCode,
      skuName: skus.name,
      locationId: inventoryBalances.locationId,
      locationCode: locations.code,
      locationName: locations.name,
      locationPath: locations.path,
      quantity: inventoryBalances.qtyOnHand,
      uom: inventoryBalances.uom,
      inventoryState: inventoryBalances.inventoryState,
      batchNo: batches.batchNo,
    })
    .from(inventoryBalances)
    .innerJoin(skus, eq(inventoryBalances.skuId, skus.id))
    .innerJoin(locations, eq(inventoryBalances.locationId, locations.id))
    .leftJoin(batches, eq(inventoryBalances.batchId, batches.id))
    .where(
      and(
        eq(inventoryBalances.siteId, targetLoc.siteId),
        or(
          eq(locations.path, targetLoc.path),
          ilike(locations.path, `${targetLoc.path}/%`)
        ),
        gt(inventoryBalances.qtyOnHand, '0')
      )
    )

  const { getReadableAddress, getHierarchyDetails } = await buildAddressHelpers(orgId)

  const items = rawData.map((row) => {
    const details = getHierarchyDetails(row.locationPath || '')
    const displayAddress = getReadableAddress(row.locationPath || '')
    return {
      ...row,
      displayAddress,
      building: details.building,
      floor: details.floor,
      address: details.address,
    }
  })

  return reply.send({
    locationId: id,
    locationPath: targetLoc.path,
    items,
  })
}

export async function deleteLocation(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  // 1. Fetch location to verify it belongs to user's organization and exists
  const [locationObj] = await db
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(eq(locations.id, id), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (!locationObj) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Location not found or already deleted',
    })
  }

  // 2. Reject if there are active child locations
  const [childCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(locations)
    .where(and(eq(locations.parentId, id), isNull(locations.deletedAt)))

  if (childCount && childCount.count > 0) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Cannot delete location: it has active child locations',
    })
  }

  // 3. Reject if there are active inventory balances
  const [inventorySum] = await db
    .select({ totalQty: sql<number>`COALESCE(sum(qty_on_hand), 0)::float` })
    .from(inventoryBalances)
    .where(eq(inventoryBalances.locationId, id))

  if (inventorySum && inventorySum.totalQty > 0) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Cannot delete location: it contains active inventory balances',
    })
  }

  // 4. Perform soft deletion (set deletedAt and isActive = false)
  await db
    .update(locations)
    .set({
      deletedAt: new Date(),
      isActive: false,
      updatedAt: new Date(),
    })
    .where(eq(locations.id, id))

  return reply.status(200).send({ message: 'Location deleted successfully' })
}

// ─────────────────────────────────────────────────────────────
// Storage Address — Simplified 3-tier creation
// ─────────────────────────────────────────────────────────────

/**
 * Creates or reuses zone → row → column nodes from a single storage address input.
 * This implements the simplified Building → Floor → Z01-R02-C04 workflow.
 *
 * POST /locations/storage-address
 * Body: { siteId, buildingId, floorId, zone, row, column, notes? }
 */
export async function createStorageAddress(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = createStorageAddressSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { siteId: inputSiteId, buildingId, floorId, zone, row, column, notes } = parsed.data

  // 1. Verify site belongs to org (or auto-resolve if not specified)
  let siteId = inputSiteId
  let siteObj: { id: string; code: string } | undefined

  if (siteId) {
    const [found] = await db
      .select({ id: sites.id, code: sites.code })
      .from(sites)
      .where(and(eq(sites.id, siteId), eq(sites.orgId, orgId)))
    siteObj = found
  } else {
    const [found] = await db
      .select({ id: sites.id, code: sites.code })
      .from(sites)
      .where(eq(sites.orgId, orgId))
      .limit(1)
    siteObj = found
    siteId = found?.id
  }

  if (!siteObj || !siteId) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified site does not exist or organization has no sites configured',
    })
  }

  const finalSiteId: string = siteId

  // 2. Verify building exists and belongs to site
  const [buildingObj] = await db
    .select({ id: locations.id, code: locations.code, path: locations.path, level: locations.level })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(
      eq(locations.id, buildingId),
      eq(locations.siteId, finalSiteId),
      eq(locations.level, 'building'),
      eq(sites.orgId, orgId),
      isNull(locations.deletedAt)
    ))

  if (!buildingObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified building does not exist under this site',
    })
  }

  // 3. Verify floor exists and belongs to building
  const [floorObj] = await db
    .select({ id: locations.id, code: locations.code, path: locations.path, level: locations.level })
    .from(locations)
    .where(and(
      eq(locations.id, floorId),
      eq(locations.siteId, finalSiteId),
      eq(locations.level, 'floor'),
      isNull(locations.deletedAt)
    ))

  if (!floorObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified floor does not exist',
    })
  }

  // Helper: look up or create a child node
  async function ensureChildNode(params: {
    parentId: string
    parentPath: string
    code: string
    name: string
    level: 'zone' | 'row' | 'column'
    isStorage: boolean
    notes?: string
  }) {
    const childPath = `${params.parentPath}/${params.code}`

    const [existing] = await db
      .select({ id: locations.id, path: locations.path, level: locations.level })
      .from(locations)
      .where(and(
        eq(locations.siteId, finalSiteId),
        eq(locations.path, childPath),
        isNull(locations.deletedAt)
      ))

    if (existing) return existing

    const [created] = await db
      .insert(locations)
      .values({
        siteId: finalSiteId,
        parentId: params.parentId,
        name: params.name,
        code: params.code,
        level: params.level,
        path: childPath,
        isStorage: params.isStorage,
        notes: params.notes || null,
        isActive: true,
        metadata: {},
      })
      .returning({ id: locations.id, path: locations.path, level: locations.level })

    return created
  }

  // 4. Ensure zone node under floor
  const zoneNode = await ensureChildNode({
    parentId: floorId,
    parentPath: floorObj.path,
    code: zone,
    name: `Zone ${zone}`,
    level: 'zone',
    isStorage: false,
  })

  // 5. Ensure row node under zone
  const rowNode = await ensureChildNode({
    parentId: zoneNode.id,
    parentPath: zoneNode.path,
    code: row,
    name: `Row ${row}`,
    level: 'row',
    isStorage: false,
  })

  // 6. Ensure column node under row (this is the storage location)
  const columnNode = await ensureChildNode({
    parentId: rowNode.id,
    parentPath: rowNode.path,
    code: column,
    name: `Column ${column}`,
    level: 'column',
    isStorage: true,
    notes,
  })

  const locatorCode = buildLocatorCode(columnNode.path, 'column')

  return reply.status(201).send({
    locationId: columnNode.id,
    locatorCode,
    path: columnNode.path,
    siteId,
    buildingId,
    floorId,
    zone,
    row,
    column,
    message: `Storage address ${locatorCode} is ready`,
  })
}

/**
 * Bulk deletes multiple location nodes, verifying that they do not contain inventory or child nodes.
 * POST /locations/bulk-delete
 */
export async function bulkDeleteLocations(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = z.object({ ids: z.array(z.string().uuid()) }).safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
    })
  }

  const { ids } = parsed.data
  if (ids.length === 0) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'No location IDs selected',
    })
  }

  // 1. Fetch all selected locations that belong to org
  const dbLocations = await db
    .select({ id: locations.id, code: locations.code, level: locations.level, path: locations.path })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(inArray(locations.id, ids), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  // 2. Query child counts for selected locations
  const childCounts = await db
    .select({ parentId: locations.parentId, count: sql<number>`count(*)::int` })
    .from(locations)
    .where(and(inArray(locations.parentId, ids), isNull(locations.deletedAt)))
    .groupBy(locations.parentId)

  const childMap = new Map(childCounts.map((r) => [r.parentId, r.count]))

  // 3. Query inventory balances for selected locations
  const inventoryCounts = await db
    .select({ locationId: inventoryBalances.locationId, totalQty: sql<number>`sum(qty_on_hand)::float` })
    .from(inventoryBalances)
    .where(and(inArray(inventoryBalances.locationId, ids), gt(inventoryBalances.qtyOnHand, '0')))
    .groupBy(inventoryBalances.locationId)

  const inventoryMap = new Map(inventoryCounts.map((r) => [r.locationId, r.totalQty]))

  const successIds: string[] = []
  const results: Array<{ id: string; code: string; status: 'success' | 'failed'; message?: string }> = []

  for (const id of ids) {
    const loc = dbLocations.find((l) => l.id === id)
    if (!loc) {
      results.push({
        id,
        code: 'Unknown',
        status: 'failed',
        message: 'Location not found or already deleted',
      })
      continue
    }

    const childCount = childMap.get(id) || 0
    const invQty = inventoryMap.get(id) || 0

    // Use business terminology: Building -> Floor -> Address (do not mention zone/row/column)
    const locatorCode = buildLocatorCode(loc.path, loc.level)
    const displayName = locatorCode ? locatorCode : loc.code

    if (childCount > 0) {
      results.push({
        id,
        code: displayName,
        status: 'failed',
        message: `Cannot delete: this location has ${childCount} active child locations.`,
      })
    } else if (invQty > 0) {
      results.push({
        id,
        code: displayName,
        status: 'failed',
        message: `Cannot delete: this location contains active inventory (${invQty} pcs).`,
      })
    } else {
      successIds.push(id)
      results.push({
        id,
        code: displayName,
        status: 'success',
      })
    }
  }

  // 4. Perform soft deletion for eligible locations
  if (successIds.length > 0) {
    await db.transaction(async (tx) => {
      await tx
        .update(locations)
        .set({
          deletedAt: new Date(),
          isActive: false,
          updatedAt: new Date(),
        })
        .where(inArray(locations.id, successIds))
    })
  }

  const summary = {
    total: ids.length,
    success: successIds.length,
    failed: ids.length - successIds.length,
  }

  return reply.send({ summary, results })
}

/**
 * Bulk deactivates multiple locations.
 * POST /locations/bulk-deactivate
 */
export async function bulkDeactivateLocations(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = z.object({ ids: z.array(z.string().uuid()) }).safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
    })
  }

  const { ids } = parsed.data
  if (ids.length === 0) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'No location IDs selected',
    })
  }

  // 1. Fetch all selected locations that belong to org
  const dbLocations = await db
    .select({ id: locations.id })
    .from(locations)
    .innerJoin(sites, eq(locations.siteId, sites.id))
    .where(and(inArray(locations.id, ids), eq(sites.orgId, orgId), isNull(locations.deletedAt)))

  if (dbLocations.length === 0) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'None of the selected locations exist or they are already deleted',
    })
  }

  const dbIds = dbLocations.map((l) => l.id)

  // 2. Perform bulk deactivation
  await db
    .update(locations)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(inArray(locations.id, dbIds))

  return reply.status(200).send({ message: `${dbIds.length} locations deactivated successfully` })
}

/**
 * Removes all seeded/demo location records, inventory records, and transfers.
 * Re-creates one single default site for compatibility.
 * POST /locations/reset-demo
 */
export async function resetDemoLocations(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  try {
    await db.transaction(async (tx) => {
      // 1. Delete all transfer lines of orders in org
      const orgOrders = await tx
        .select({ id: transferOrders.id })
        .from(transferOrders)
        .where(eq(transferOrders.orgId, orgId))
      
      const orderIds = orgOrders.map((o) => o.id)
      if (orderIds.length > 0) {
        await tx.delete(transferOrderLines).where(inArray(transferOrderLines.transferOrderId, orderIds))
      }

      // 2. Delete all transfers
      await tx.delete(transferOrders).where(eq(transferOrders.orgId, orgId))

      // 3. Delete all inventory balances
      await tx.delete(inventoryBalances).where(eq(inventoryBalances.orgId, orgId))

      // 4. Delete all stock ledger entries
      await tx.delete(stockLedger).where(eq(stockLedger.orgId, orgId))

      // 5. Update parentId to null for all locations in org to prevent self-reference checks
      const orgSites = await tx
        .select({ id: sites.id })
        .from(sites)
        .where(eq(sites.orgId, orgId))

      const siteIds = orgSites.map((s) => s.id)
      if (siteIds.length > 0) {
        await tx.update(locations).set({ parentId: null }).where(inArray(locations.siteId, siteIds))
        await tx.delete(locations).where(inArray(locations.siteId, siteIds))
      }

      // 6. Delete all sites
      await tx.delete(sites).where(eq(sites.orgId, orgId))

      // 7. Create a single default Site for auto-resolution
      await tx.insert(sites).values({
        orgId,
        name: 'Default Site',
        code: 'DEFAULT',
        siteType: 'warehouse',
        isActive: true,
      })
    })

    return reply.status(200).send({
      message: 'Demo data cleared. System has been reset to a clean default state.',
    })
  } catch (error: any) {
    request.log.error(error)
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error.message || 'Failed to reset demo data',
    })
  }
}
