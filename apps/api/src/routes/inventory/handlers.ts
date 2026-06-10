import type { FastifyRequest, FastifyReply } from 'fastify'

export async function queryBalances(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function queryMovements(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function getInventorySummary(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function getLowStock(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function postOpeningBalance(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function createAdjustment(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
