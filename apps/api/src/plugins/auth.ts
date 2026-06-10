/**
 * @fileoverview JWT plugin.
 * Registers @fastify/jwt with access token configuration.
 * Also registers @fastify/cookie for refresh token cookie handling.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import { env } from '../config/env.js'

const authPlugin: FastifyPluginAsync = async (fastify) => {
  // Register cookie plugin first (refresh token lives in httpOnly cookie)
  await fastify.register(fastifyCookie, {
    secret: env.JWT_REFRESH_SECRET,
    hook: 'onRequest',
  })

  // Register JWT for access token signing/verification
  await fastify.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_ACCESS_EXPIRES_IN,
    },
  })
}

export default fp(authPlugin, {
  name: 'auth',
  fastify: '5.x',
})
