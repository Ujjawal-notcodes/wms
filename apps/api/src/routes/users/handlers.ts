import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, users, roles, userRoles, refreshTokens } from '@wms/db'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { createUserSchema, updateUserSchema } from '@wms/shared'
import bcrypt from 'bcryptjs'
import { invalidatePermissionCache } from '../../middleware/require-permission.js'

// ─────────────────────────────────────────────────────────────
// Users CRUD Handlers
// ─────────────────────────────────────────────────────────────

export async function listUsers(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const allUsers = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(eq(users.orgId, orgId))
    .orderBy(desc(users.createdAt))

  if (allUsers.length === 0) {
    return reply.send([])
  }

  const userIds = allUsers.map((u) => u.id)

  const rolesData = await db
    .select({
      userId: userRoles.userId,
      roleId: userRoles.roleId,
      roleName: roles.name,
      siteId: userRoles.siteId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(inArray(userRoles.userId, userIds))

  const data = allUsers.map((user) => {
    const userAssigned = rolesData
      .filter((r) => r.userId === user.id)
      .map((r) => ({
        id: r.roleId,
        name: r.roleName,
        siteId: r.siteId,
      }))
    return {
      ...user,
      roles: userAssigned,
    }
  })

  return reply.send(data)
}

export async function createUser(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = createUserSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { email, password, fullName, phone, roleIds, siteId } = parsed.data

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))

  if (existing) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: 'User email is already registered',
    })
  }

  // Verify specified roles exist and belong to user's org
  const validRoles = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.orgId, orgId), inArray(roles.id, roleIds)))

  if (validRoles.length !== roleIds.length) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'One or more specified roles do not exist',
    })
  }

  const passwordHash = await bcrypt.hash(password, 10)

  const result = await db.transaction(async (tx) => {
    const [newUser] = await tx
      .insert(users)
      .values({
        orgId,
        email,
        passwordHash,
        fullName,
        phone: phone || null,
        isActive: true,
      })
      .returning()

    const roleMappings = roleIds.map((roleId) => ({
      userId: newUser!.id,
      roleId,
      siteId: siteId || null,
    }))

    await tx.insert(userRoles).values(roleMappings)

    return newUser!
  })

  return reply.status(201).send({
    id: result.id,
    email: result.email,
    fullName: result.fullName,
    phone: result.phone,
    isActive: result.isActive,
  })
}

export async function getUser(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [userObj] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      phone: users.phone,
      isActive: users.isActive,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))

  if (!userObj) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const assignedRoles = await db
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      siteId: userRoles.siteId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, id))

  return reply.send({
    ...userObj,
    roles: assignedRoles,
  })
}

export async function updateUser(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const parsed = updateUserSchema.safeParse(request.body)
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
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))

  if (!original) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const updateValues: Record<string, any> = {
    updatedAt: new Date(),
  }
  if (input.fullName !== undefined) updateValues.fullName = input.fullName
  if (input.phone !== undefined) updateValues.phone = input.phone
  if (input.isActive !== undefined) updateValues.isActive = input.isActive

  const [updatedUser] = await db
    .update(users)
    .set(updateValues)
    .where(eq(users.id, id))
    .returning()

  // If user was deactivated, revoke their refresh tokens
  if (input.isActive === false) {
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, id))
  }

  invalidatePermissionCache(id)

  return reply.send({
    id: updatedUser!.id,
    email: updatedUser!.email,
    fullName: updatedUser!.fullName,
    phone: updatedUser!.phone,
    isActive: updatedUser!.isActive,
  })
}

export async function deactivateUser(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [original] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))

  if (!original) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(users.id, id))

    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.userId, id))
  })

  invalidatePermissionCache(id)

  return reply.status(204).send()
}

// ─────────────────────────────────────────────────────────────
// Roles Mappings Handlers
// ─────────────────────────────────────────────────────────────

export async function listRoles(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const allRoles = await db
    .select()
    .from(roles)
    .where(eq(roles.orgId, orgId))
    .orderBy(roles.name)

  return reply.send(allRoles)
}

export async function assignRole(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id } = request.params as { id: string } // userId
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const { roleId, siteId } = request.body as { roleId: string; siteId?: string }

  if (!roleId) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'roleId is required',
    })
  }

  const [usr] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))

  if (!usr) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const [rl] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(and(eq(roles.id, roleId), eq(roles.orgId, orgId)))

  if (!rl) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Role not found',
    })
  }

  const [existingMap] = await db
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleId)))

  if (existingMap) {
    return reply.status(409).send({
      statusCode: 409,
      error: 'Conflict',
      message: 'Role is already assigned to this user',
    })
  }

  await db.insert(userRoles).values({
    userId: id,
    roleId,
    siteId: siteId || null,
  })

  invalidatePermissionCache(id)

  return reply.status(201).send({ message: 'Role assigned successfully' })
}

export async function removeRole(request: FastifyRequest, reply: FastifyReply) {
  const orgId = request.user?.orgId
  const { id, roleId } = request.params as { id: string; roleId: string }
  if (!orgId) {
    return reply.status(401).send({ error: 'Unauthorized', message: 'Org context missing' })
  }

  const [usr] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.orgId, orgId)))

  if (!usr) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const deleted = await db
    .delete(userRoles)
    .where(and(eq(userRoles.userId, id), eq(userRoles.roleId, roleId)))
    .returning()

  if (deleted.length === 0) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'Specified role is not assigned to this user',
    })
  }

  invalidatePermissionCache(id)

  return reply.status(204).send()
}
