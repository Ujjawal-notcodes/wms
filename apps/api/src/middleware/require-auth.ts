/**
 * @fileoverview requireAuth middleware (preHandler hook).
 *
 * Verifies the Bearer JWT access token in the Authorization header.
 * Sets request.user on success.
 * Throws 401 on missing / expired / invalid token.
 *
 * Usage in route options:
 *   { preHandler: [requireAuth] }
 */

import type { FastifyRequest, FastifyReply } from 'fastify'
import type { JwtPayload } from '../types/fastify.js'

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    // fastify.jwt.verify reads Authorization: Bearer <token>
    const payload = await request.jwtVerify<JwtPayload>()
    request.user = payload
  } catch (err) {
    console.error('JWT VERIFY FAILED:', err)

    return reply.status(401).send({
      statusCode: 401,
      error: 'Unauthorized',
      message: 'Valid authentication token required',
    })
  }
}
