import type { FastifyPluginAsync } from 'fastify'
import { requireAuth } from '../../middleware/require-auth.js'
import {
  validateImportHandler,
  executeImportHandler,
  getImportJobHandler,
  getImportJobsHandler,
} from './handlers.js'

const importRoutes: FastifyPluginAsync = async (fastify) => {
  // All import endpoints require auth
  fastify.addHook('preHandler', requireAuth)

  fastify.post('/validate', validateImportHandler)
  fastify.post('/execute', executeImportHandler)
  fastify.get('/jobs', getImportJobsHandler)
  fastify.get('/jobs/:jobId', getImportJobHandler)
}

export default importRoutes
