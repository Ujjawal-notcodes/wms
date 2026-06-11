/**
 * Auth routes
 * POST /auth/login      — email + password → access token + refresh token cookie
 * POST /auth/refresh    — refresh token cookie → new access token
 * POST /auth/logout     — revoke refresh token
 * GET  /auth/me         — current user profile + permissions
 * PUT  /auth/me/password — change own password
 */

import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import {
  login,
  refresh,
  logout,
  getMe,
  changePassword,
} from './handlers.js'

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /auth/login
  fastify.post('/login', {
    config: {
      // Stricter rate limit for login endpoint: 10 req/min per IP
      rateLimit: { max: 10, timeWindow: '1 minute' },
    },
  }, login)

  // POST /auth/refresh
  fastify.post('/refresh', {
    config: {
      // Rate limit for refresh endpoint: 20 req/min per IP
      rateLimit: { max: 20, timeWindow: '1 minute' },
    },
  }, refresh)

  // POST /auth/logout
  fastify.post('/logout', { preHandler: [requireAuth] }, logout)

  // GET /auth/me
  fastify.get('/me', { preHandler: [requireAuth] }, getMe)

  // PUT /auth/me/password
  fastify.put('/me/password', {
    preHandler: [requireAuth],
    config: {
      // Very strict limit on password changes: 5 req/min per IP
      rateLimit: { max: 5, timeWindow: '1 minute' },
    },
  }, changePassword)
}

export default authRoutes
