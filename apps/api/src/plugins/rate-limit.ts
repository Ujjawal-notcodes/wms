import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import fastifyRateLimit from '@fastify/rate-limit'
import { env } from '../config/env.js'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    // Global: 300 requests per minute per IP
    max: env.NODE_ENV === 'test' ? 0 : 300,
    timeWindow: '1 minute',
    // Auth endpoints get stricter limits (set in route options)
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please slow down.',
    }),
  })
}

export default fp(rateLimitPlugin, { name: 'rate-limit', fastify: '5.x' })
