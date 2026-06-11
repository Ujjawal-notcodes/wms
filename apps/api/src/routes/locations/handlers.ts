import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, sites, locations } from '@wms/db'
import { eq, and, desc } from 'drizzle-orm'
import {
  createSiteSchema,
  updateSiteSchema,
  createLocationSchema,
  updateLocationSchema,
} from '@wms/shared'

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
    .where(eq(sites.orgId, orgId))
    .orderBy(desc(locations.createdAt))

  return reply.send(data)
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

  // 1. Verify Site belongs to user's Organization
  const [siteObj] = await db
    .select({ id: sites.id, code: sites.code })
    .from(sites)
    .where(and(eq(sites.id, input.siteId), eq(sites.orgId, orgId)))

  if (!siteObj) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Specified site does not exist in your organization',
    })
  }

  // 2. Resolve parent details and path
  let parentPath = ''
  if (input.parentId) {
    const [parentObj] = await db
      .select({ id: locations.id, path: locations.path, siteId: locations.siteId })
      .from(locations)
      .where(eq(locations.id, input.parentId))

    if (!parentObj) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Parent location does not exist',
      })
    }

    if (parentObj.siteId !== input.siteId) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Parent location must belong to the same site',
      })
    }

    parentPath = parentObj.path
  }

  const computedPath = parentPath ? `${parentPath}/${input.code}` : `${siteObj.code}/${input.code}`

  // 3. Check duplicate path on site
  const [existingPath] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.siteId, input.siteId), eq(locations.path, computedPath)))

  if (existingPath) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: `Location with path '${computedPath}' already exists under this site`,
    })
  }

  // 4. Insert location
  const [newLocation] = await db
    .insert(locations)
    .values({
      siteId: input.siteId,
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
    .where(and(eq(locations.id, id), eq(sites.orgId, orgId)))

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
  const { id } = request.params as { id: string }
  return reply.send({
    locationId: id,
    items: [],
  })
}
