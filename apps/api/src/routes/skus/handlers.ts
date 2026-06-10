import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, skus, skuCategories } from '@wms/db'
import { eq, and, or, ilike, count, desc, isNull, inArray } from 'drizzle-orm'
import { createSkuSchema, updateSkuSchema, skuQuerySchema, createSkuCategorySchema } from '@wms/shared'

// SKU handlers
export async function listSkus(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = skuQuerySchema.safeParse(request.query)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid query parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { q, skuType, categoryId, isActive, page, limit } = parsed.data
  const offset = (page - 1) * limit

  const conditions = [
    eq(skus.orgId, orgId),
    isNull(skus.deletedAt),
  ]

  if (skuType) {
    conditions.push(eq(skus.skuType, skuType))
  }
  if (categoryId) {
    conditions.push(eq(skus.categoryId, categoryId))
  }
  if (isActive !== undefined) {
    conditions.push(eq(skus.isActive, isActive))
  }

  if (q) {
    const searchFilter = or(
      ilike(skus.skuCode, `%${q}%`),
      ilike(skus.name, `%${q}%`),
      ilike(skus.description, `%${q}%`)
    )
    if (searchFilter) {
      conditions.push(searchFilter)
    }
  }

  const [totalCountRow] = await db
    .select({ total: count(skus.id) })
    .from(skus)
    .where(and(...conditions))

  const total = totalCountRow?.total ?? 0

  const data = await db
    .select({
      id: skus.id,
      orgId: skus.orgId,
      skuCode: skus.skuCode,
      name: skus.name,
      description: skus.description,
      categoryId: skus.categoryId,
      categoryName: skuCategories.name,
      skuType: skus.skuType,
      uom: skus.uom,
      weightKg: skus.weightKg,
      dimensions: skus.dimensions,
      hsnCode: skus.hsnCode,
      barcode: skus.barcode,
      imageUrl: skus.imageUrl,
      reorderPoint: skus.reorderPoint,
      reorderQty: skus.reorderQty,
      leadTimeDays: skus.leadTimeDays,
      isBatchTracked: skus.isBatchTracked,
      isActive: skus.isActive,
      tags: skus.tags,
      metadata: skus.metadata,
      createdAt: skus.createdAt,
      updatedAt: skus.updatedAt,
    })
    .from(skus)
    .leftJoin(skuCategories, eq(skus.categoryId, skuCategories.id))
    .where(and(...conditions))
    .limit(limit)
    .offset(offset)
    .orderBy(desc(skus.createdAt))

  return {
    data,
    total,
    page,
    limit,
    hasMore: offset + data.length < total,
  }
}

export async function createSku(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub

  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'User context missing' })
  }

  const parsed = createSkuSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const input = parsed.data

  const [existing] = await db
    .select({ id: skus.id })
    .from(skus)
    .where(and(eq(skus.skuCode, input.skuCode), eq(skus.orgId, orgId)))

  if (existing) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: `SKU code '${input.skuCode}' is already registered`,
    })
  }

  const [newSku] = await db
    .insert(skus)
    .values({
      orgId,
      skuCode: input.skuCode,
      name: input.name,
      description: input.description,
      categoryId: input.categoryId || null,
      skuType: input.skuType,
      uom: input.uom,
      weightKg: input.weightKg ? String(input.weightKg) : null,
      dimensions: input.dimensions || null,
      hsnCode: input.hsnCode || null,
      barcode: input.barcode || null,
      imageUrl: input.imageUrl || null,
      reorderPoint: String(input.reorderPoint),
      reorderQty: String(input.reorderQty),
      leadTimeDays: input.leadTimeDays,
      isBatchTracked: input.isBatchTracked,
      tags: input.tags,
      metadata: input.metadata,
      createdBy: userId,
    })
    .returning()

  return reply.status(201).send(newSku)
}

export async function getSku(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }

  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [sku] = await db
    .select({
      id: skus.id,
      orgId: skus.orgId,
      skuCode: skus.skuCode,
      name: skus.name,
      description: skus.description,
      categoryId: skus.categoryId,
      categoryName: skuCategories.name,
      skuType: skus.skuType,
      uom: skus.uom,
      weightKg: skus.weightKg,
      dimensions: skus.dimensions,
      hsnCode: skus.hsnCode,
      barcode: skus.barcode,
      imageUrl: skus.imageUrl,
      reorderPoint: skus.reorderPoint,
      reorderQty: skus.reorderQty,
      leadTimeDays: skus.leadTimeDays,
      isBatchTracked: skus.isBatchTracked,
      isActive: skus.isActive,
      tags: skus.tags,
      metadata: skus.metadata,
      createdAt: skus.createdAt,
      updatedAt: skus.updatedAt,
    })
    .from(skus)
    .leftJoin(skuCategories, eq(skus.categoryId, skuCategories.id))
    .where(and(eq(skus.id, id), eq(skus.orgId, orgId), isNull(skus.deletedAt)))

  if (!sku) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'SKU not found',
    })
  }

  return sku
}

export async function updateSku(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }

  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = updateSkuSchema.safeParse(request.body)
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
    .select({ id: skus.id })
    .from(skus)
    .where(and(eq(skus.id, id), eq(skus.orgId, orgId), isNull(skus.deletedAt)))

  if (!original) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'SKU not found',
    })
  }

  const updateValues: Record<string, any> = {
    updatedAt: new Date(),
  }

  if (input.name !== undefined) updateValues.name = input.name
  if (input.description !== undefined) updateValues.description = input.description
  if (input.categoryId !== undefined) updateValues.categoryId = input.categoryId || null
  if (input.skuType !== undefined) updateValues.skuType = input.skuType
  if (input.uom !== undefined) updateValues.uom = input.uom
  if (input.weightKg !== undefined) updateValues.weightKg = input.weightKg ? String(input.weightKg) : null
  if (input.dimensions !== undefined) updateValues.dimensions = input.dimensions || null
  if (input.hsnCode !== undefined) updateValues.hsnCode = input.hsnCode || null
  if (input.barcode !== undefined) updateValues.barcode = input.barcode || null
  if (input.imageUrl !== undefined) updateValues.imageUrl = input.imageUrl || null
  if (input.reorderPoint !== undefined) updateValues.reorderPoint = String(input.reorderPoint)
  if (input.reorderQty !== undefined) updateValues.reorderQty = String(input.reorderQty)
  if (input.leadTimeDays !== undefined) updateValues.leadTimeDays = input.leadTimeDays
  if (input.isBatchTracked !== undefined) updateValues.isBatchTracked = input.isBatchTracked
  if (input.isActive !== undefined) updateValues.isActive = input.isActive
  if (input.tags !== undefined) updateValues.tags = input.tags
  if (input.metadata !== undefined) updateValues.metadata = input.metadata

  const [updatedSku] = await db
    .update(skus)
    .set(updateValues)
    .where(eq(skus.id, id))
    .returning()

  return updatedSku
}

export async function deleteSku(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized' })
  }

  await db
    .update(skus)
    .set({ deletedAt: new Date(), isActive: false })
    .where(and(eq(skus.id, id), eq(skus.orgId, orgId)))

  return reply.status(204).send()
}

export async function getSkuStock(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send([])
}

export async function getSkuMovements(_request: FastifyRequest, reply: FastifyReply) {
  return reply.send([])
}

// Category handlers
export async function listCategories(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) return reply.status(401).send({ error: 'Unauthorized' })

  const data = await db
    .select()
    .from(skuCategories)
    .where(eq(skuCategories.orgId, orgId))
    .orderBy(skuCategories.name)

  return reply.send(data)
}

export async function createCategory(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) return reply.status(401).send({ error: 'Unauthorized' })

  const parsed = createSkuCategorySchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { name, code, parentId } = parsed.data

  const [existing] = await db
    .select({ id: skuCategories.id })
    .from(skuCategories)
    .where(and(eq(skuCategories.code, code), eq(skuCategories.orgId, orgId)))

  if (existing) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: `Category code '${code}' is already registered`,
    })
  }

  const [newCat] = await db
    .insert(skuCategories)
    .values({
      orgId,
      name,
      code,
      parentId: parentId || null,
    })
    .returning()

  return reply.status(201).send(newCat)
}

export async function getCategory(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Not implemented' })
}

export async function updateCategory(_request: FastifyRequest, reply: FastifyReply) {
  return reply.status(501).send({ message: 'Not implemented' })
}
