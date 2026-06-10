/**
 * @fileoverview Fastify type augmentation.
 * Adds typed `user` and `db` to FastifyRequest / FastifyInstance.
 */

import '@fastify/jwt'
import type { DbClient } from '@wms/db'

// Payload stored in the JWT access token
export interface JwtPayload {
  sub: string       // user ID
  email: string
  orgId: string
  iat?: number
  exp?: number
}

// Augment @fastify/jwt's FastifyJWT interface so that jwt.verify()
// and request.user are typed as JwtPayload instead of the default object.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload
    user: JwtPayload
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    // Attached by the db plugin
    db: DbClient
  }
}
