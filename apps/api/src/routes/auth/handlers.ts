import type { FastifyRequest, FastifyReply } from 'fastify'
import { db, users, refreshTokens, userRoles, rolePermissions, permissions } from '@wms/db'
import { eq, and, gt, isNull, inArray } from 'drizzle-orm'
import { loginSchema, changePasswordSchema } from '@wms/shared'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { env } from '../../config/env.js'
import { invalidatePermissionCache } from '../../middleware/require-permission.js'

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const parsed = loginSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { email, password } = parsed.data

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.email, email), eq(users.isActive, true)))

  if (!user) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid email or password',
    })
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash)
  if (!isMatch) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid email or password',
    })
  }

  await db
    .update(users)
    .set({ lastLoginAt: new Date() })
    .where(eq(users.id, user.id))

  const accessToken = await reply.jwtSign({
    sub: user.id,
    email: user.email,
    orgId: user.orgId,
  })

  const rawRefreshToken = crypto.randomBytes(40).toString('hex')
  const tokenHash = hashToken(rawRefreshToken)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash,
    expiresAt,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  })
  reply.setCookie('refresh_token', rawRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', // '/' so the browser sends it on ALL requests (incl. to Next.js,
               // which the edge middleware reads to detect session presence)
    maxAge: 7 * 24 * 60 * 60,
  })

  reply.setCookie('access_token', accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })

  return { accessToken }
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const rawToken = request.cookies.refresh_token
  if (!rawToken) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Refresh token required',
    })
  }

  const tokenHash = hashToken(rawToken)

  const [tokenRecord] = await db
    .select()
    .from(refreshTokens)
    .where(
      and(
        eq(refreshTokens.tokenHash, tokenHash),
        gt(refreshTokens.expiresAt, new Date()),
        isNull(refreshTokens.revokedAt)
      )
    )

  if (!tokenRecord) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Invalid or expired refresh token',
    })
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, tokenRecord.userId), eq(users.isActive, true)))

  if (!user) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'User is inactive or deleted',
    })
  }

  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(eq(refreshTokens.id, tokenRecord.id))

  const newRawRefreshToken = crypto.randomBytes(40).toString('hex')
  const newTokenHash = hashToken(newRawRefreshToken)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  await db.insert(refreshTokens).values({
    userId: user.id,
    tokenHash: newTokenHash,
    expiresAt,
    ipAddress: request.ip,
    userAgent: request.headers['user-agent'],
  })

  reply.setCookie('refresh_token', newRawRefreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/', // must match login path
    maxAge: 7 * 24 * 60 * 60,
  })

  const accessToken = await reply.jwtSign({
    sub: user.id,
    email: user.email,
    orgId: user.orgId,
  })

  reply.setCookie('access_token', accessToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60,
  })

  return { accessToken }
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const rawToken = request.cookies.refresh_token

  if (rawToken) {
    const tokenHash = hashToken(rawToken)
    await db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(eq(refreshTokens.tokenHash, tokenHash))
  }

  reply.clearCookie('refresh_token', {
    path: '/', // must match set path
  })

  reply.clearCookie('access_token', {
    path: '/',
  })

  return reply.status(204).send()
}

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user?.sub
  if (!userId) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Access token required',
    })
  }

  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      orgId: users.orgId,
    })
    .from(users)
    .where(eq(users.id, userId))

  if (!user) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const userRoleRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, user.id))

  if (userRoleRows.length === 0) {
    return {
      ...user,
      permissions: [],
    }
  }

  const roleIds = userRoleRows.map((r) => r.roleId)

  const permRows = await db
    .select({
      module: permissions.module,
      action: permissions.action,
    })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(inArray(rolePermissions.roleId, roleIds))

  const permissionStrings = Array.from(
    new Set(permRows.map((p) => `${p.module}:${p.action}`))
  )

  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    orgId: user.orgId,
    permissions: permissionStrings,
  }
}

export async function changePassword(request: FastifyRequest, reply: FastifyReply) {
  const userId = request.user?.sub
  if (!userId) {
    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Access token required',
    })
  }

  const parsed = changePasswordSchema.safeParse(request.body)
  if (!parsed.success) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Invalid input parameters',
      details: parsed.error.flatten().fieldErrors,
    })
  }

  const { currentPassword, newPassword } = parsed.data

  const [user] = await db
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, userId))

  if (!user) {
    return reply.status(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: 'User not found',
    })
  }

  const isMatch = await bcrypt.compare(currentPassword, user.passwordHash)
  if (!isMatch) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'Bad Request',
      message: 'Incorrect current password',
    })
  }

  const newPasswordHash = await bcrypt.hash(newPassword, 10)

  await db
    .update(users)
    .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
    .where(eq(users.id, userId))

  invalidatePermissionCache(userId)

  return reply.status(204).send()
}
