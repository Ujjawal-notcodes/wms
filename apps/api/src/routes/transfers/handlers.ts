import type { FastifyRequest, FastifyReply } from 'fastify'

export async function listTransfers(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function createTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function getTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function approveTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function dispatchTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function receiveTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
export async function cancelTransfer(_req: FastifyRequest, reply: FastifyReply) { return reply.status(501).send({ message: 'Not implemented yet' }) }
