import type { FastifyRequest, FastifyReply } from 'fastify'

export async function getDashboardKpis(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function getDashboardAlerts(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
