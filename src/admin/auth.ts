import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

function bearer(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim();
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void): void {
  if (!config.adminToken || bearer(request) === config.adminToken) { done(); return; }
  reply.code(401).send({ error: 'Unauthorized' });
}

export function requireMcpToken(request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void): void {
  if (!config.mcpToken || bearer(request) === config.mcpToken) { done(); return; }
  reply.code(401).send({ error: 'Unauthorized' });
}
