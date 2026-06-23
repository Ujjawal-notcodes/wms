/**
 * @fileoverview Fastify application factory.
 * Creates and configures the Fastify instance with all plugins and routes.
 * Separated from index.ts to enable testing without starting the server.
 */

import Fastify from 'fastify'
import { env } from './config/env.js'

// Plugins
import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'
import corsPlugin from './plugins/cors.js'
import rateLimitPlugin from './plugins/rate-limit.js'
import errorHandler from './plugins/error-handler.js'

// Routes
import { registerRoutes } from './routes/index.js'

export async function buildApp() {
  const fastify = Fastify({
    bodyLimit: 15 * 1024 * 1024,
    logger: {
      level: env.LOG_LEVEL,
      ...(env.NODE_ENV === 'development'
        ? {
            transport: {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
            },
          }
        : {}),
    },
    // Attach request ID to every log line
    genReqId: () => crypto.randomUUID(),
  })

  // ── Plugins (order matters) ──────────────────────────────────────────────

  // 1. Error handler first so it catches errors from all subsequent plugins
  await fastify.register(errorHandler)

  // 2. Security & CORS
  await fastify.register(corsPlugin)

  // 3. Rate limiting
  await fastify.register(rateLimitPlugin)

  // 4. Auth (JWT + Cookie)
  await fastify.register(authPlugin)

  // 5. Database
  await fastify.register(dbPlugin)

  // ── Routes ───────────────────────────────────────────────────────────────

  await fastify.register(registerRoutes, { prefix: env.API_PREFIX })

  // ── Health check (no auth) ───────────────────────────────────────────────

  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
  }))

  return fastify
}
