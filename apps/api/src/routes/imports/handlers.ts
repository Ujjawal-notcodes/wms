import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, importJobs, importJobRows, users } from '@wms/db'
import { eq, and, desc } from 'drizzle-orm'
import { getUserPermissions } from '../../middleware/require-permission.js'
import {
  validateLocationImport,
  validateSkuImport,
  validateOpeningStockImport,
  executeImport,
} from '../../services/import.service.js'

export async function validateImportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub

  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Auth context missing' })
  }

  const { file, type, fileName } = request.body as {
    file?: string
    type?: string
    fileName?: string
  }

  if (!file || !type) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: "Parameters 'file' (base64 string) and 'type' are required.",
    })
  }

  // Enforce 10MB limit on parsed binary size
  if (Buffer.byteLength(file, 'base64') > 10 * 1024 * 1024) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'File size exceeds the 10MB limit.',
    })
  }

  if (!['location', 'sku', 'opening_stock'].includes(type)) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: "Parameter 'type' must be one of: location, sku, opening_stock",
    })
  }

  // Dynamic RBAC validation based on type
  const userPerms = await getUserPermissions(userId)
  let requiredPerm = ''
  if (type === 'location') requiredPerm = 'locations:create'
  else if (type === 'sku') requiredPerm = 'skus:create'
  else if (type === 'opening_stock') requiredPerm = 'inventory:post'

  if (!userPerms.has(requiredPerm)) {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: `You do not have permission to import ${type} data`,
    })
  }

  let buffer: Buffer
  try {
    buffer = Buffer.from(file, 'base64')
  } catch (err) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid base64 encoded file content',
    })
  }

  try {
    let result
    if (type === 'location') {
      result = await validateLocationImport(buffer, orgId, userId, fileName)
    } else if (type === 'sku') {
      result = await validateSkuImport(buffer, orgId, userId, fileName)
    } else {
      result = await validateOpeningStockImport(buffer, orgId, userId, fileName)
    }

    return reply.send(result)
  } catch (error: any) {
    request.log.error(error, 'Import validation failed')
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error.message || 'An error occurred during import validation',
    })
  }
}

export async function executeImportHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub

  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Auth context missing' })
  }

  const { jobId } = request.body as { jobId?: string }

  if (!jobId) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: "Parameter 'jobId' is required.",
    })
  }

  // Pre-load job type to check permissions
  const [job] = await db
    .select({ type: importJobs.type })
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.orgId, orgId)))

  if (!job) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Import job '${jobId}' not found`,
    })
  }

  // Dynamic RBAC execution based on type
  const userPerms = await getUserPermissions(userId)
  let requiredPerm = ''
  if (job.type === 'location') requiredPerm = 'locations:create'
  else if (job.type === 'sku') requiredPerm = 'skus:create'
  else if (job.type === 'opening_stock') requiredPerm = 'inventory:post'

  if (!userPerms.has(requiredPerm)) {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: `You do not have permission to execute ${job.type} import`,
    })
  }

  const ipAddress = request.ip

  try {
    const result = await executeImport(jobId, orgId, userId, ipAddress)
    return reply.send({ success: true, ...result })
  } catch (error: any) {
    request.log.error(error, 'Import execution failed')
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: error.message || 'Failed to execute import job',
    })
  }
}

export async function getImportJobHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Auth context missing' })
  }

  const { jobId } = request.params as { jobId: string }

  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.orgId, orgId)))

  if (!job) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Import job '${jobId}' not found`,
    })
  }

  const rows = await db
    .select()
    .from(importJobRows)
    .where(eq(importJobRows.jobId, jobId))
    .orderBy(importJobRows.rowNumber)

  return reply.send({ job, rows })
}

export async function getImportJobsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const orgId = request.user?.orgId
  const userId = request.user?.sub

  if (!orgId || !userId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Auth context missing' })
  }

  const userPerms = await getUserPermissions(userId)
  const hasAnyPerm =
    userPerms.has('locations:create') ||
    userPerms.has('skus:create') ||
    userPerms.has('inventory:post')

  if (!hasAnyPerm) {
    return reply.status(403).send({
      statusCode: 403,
      error: 'Forbidden',
      message: 'You do not have permission to view import history',
    })
  }

  const jobs = await db
    .select({
      id: importJobs.id,
      orgId: importJobs.orgId,
      type: importJobs.type,
      status: importJobs.status,
      fileName: importJobs.fileName,
      totalRows: importJobs.totalRows,
      validRows: importJobs.validRows,
      errorRows: importJobs.errorRows,
      createdBy: importJobs.createdBy,
      createdByName: users.fullName,
      createdAt: importJobs.createdAt,
      updatedAt: importJobs.updatedAt,
    })
    .from(importJobs)
    .innerJoin(users, eq(importJobs.createdBy, users.id))
    .where(eq(importJobs.orgId, orgId))
    .orderBy(desc(importJobs.createdAt))

  return reply.send(jobs)
}
