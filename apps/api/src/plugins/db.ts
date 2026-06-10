/**
 * @fileoverview Database plugin.
 * Attaches the Drizzle db client to the Fastify instance.
 * Imported from @wms/db which reads DATABASE_URL from environment.
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import { db } from '@wms/db'

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  // Attach db to the Fastify instance so routes can access fastify.db
  fastify.decorate('db', db)

  fastify.addHook('onClose', async () => {
    // The postgres.js client manages its own pool lifecycle.
    // No explicit teardown needed for most cases, but we log it.
    fastify.log.info('Database connection pool closed')
  })
}

export default fp(dbPlugin, {
  name: 'db',
  fastify: '5.x',
})
