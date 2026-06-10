import fp from 'fastify-plugin'
import type { FastifyPluginAsync } from 'fastify'
import fastifyCors from '@fastify/cors'
import { env } from '../config/env.js'

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCors, {
    origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
}

export default fp(corsPlugin, { name: 'cors', fastify: '5.x' })
