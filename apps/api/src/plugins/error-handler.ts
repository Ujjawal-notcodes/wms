/**
 * @fileoverview Global error handler.
 * Normalises all errors into a consistent JSON shape:
 * { statusCode, error, message, details? }
 */

import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyError } from 'fastify'
import { ZodError } from 'zod'

const errorHandler: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: unknown, request, reply) => {
    const log = fastify.log

    // Zod validation errors → 400
    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Request validation failed',
        details: error.flatten().fieldErrors,
      })
    }

    // Cast to FastifyError for access to statusCode, validation, etc.
    const fastifyError = error as FastifyError

    // Fastify validation errors (JSON schema) → 400
    if (fastifyError.validation) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: fastifyError.message,
        details: fastifyError.validation,
      })
    }

    // JWT errors → 401
    if (fastifyError.message === 'Unauthorized' || fastifyError.statusCode === 401) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'Authentication required',
      })
    }

    // Known HTTP errors (e.g., 403, 404)
    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.status(fastifyError.statusCode).send({
        statusCode: fastifyError.statusCode,
        error: fastifyError.name,
        message: fastifyError.message,
      })
    }

    // Inventory balance guard (from PostgreSQL trigger)
    if (fastifyError.message?.includes('Insufficient stock')) {
      return reply.status(422).send({
        statusCode: 422,
        error: 'Insufficient Stock',
        message: fastifyError.message,
      })
    }

    // Unexpected server errors → 500 (never leak internals)
    log.error({ err: error, req: request.id }, 'Unhandled error')
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    })
  })
}

export default fp(errorHandler, { name: 'error-handler', fastify: '5.x' })
