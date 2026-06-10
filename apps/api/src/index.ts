/**
 * @fileoverview Server entry point.
 * Loads env, builds app, starts listening.
 *
 * NOTE: dotenv is loaded by apps/api/src/config/load-env.ts which is
 * imported as a side-effect dependency of env.ts. In ESM the module graph
 * is evaluated depth-first, so load-env.ts (a leaf) runs before this file's
 * body executes. Do NOT add dotenv.config() here — it would run too late.
 */

import { buildApp } from './app.js'
import { env } from './config/env.js'

async function start() {
  const app = await buildApp()

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    app.log.info(`🚀  WMS API running on http://0.0.0.0:${env.PORT}`)
    app.log.info(`📍  API prefix: ${env.API_PREFIX}`)
    app.log.info(`🔍  Health: http://0.0.0.0:${env.PORT}/health`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...')
  process.exit(0)
})

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...')
  process.exit(0)
})

start()
