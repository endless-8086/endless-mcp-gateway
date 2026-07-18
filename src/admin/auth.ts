import crypto from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';

function bearer(request: FastifyRequest): string | undefined {
  const value = request.headers.authorization;
  if (!value?.startsWith('Bearer ')) return undefined;
  return value.slice('Bearer '.length).trim();
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void): void {
  if (!config.adminToken) { reply.code(401).send({ error: 'Admin token not configured' }); return; }
  if (timingSafeEqual(bearer(request) ?? '', config.adminToken)) { done(); return; }
  reply.code(401).send({ error: 'Unauthorized' });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return crypto.timingSafeEqual(bufA, bufB);
}

export function requireMcpToken(request: FastifyRequest, reply: FastifyReply, done: (error?: Error) => void): void {
  if (!config.mcpToken || timingSafeEqual(bearer(request) ?? '', config.mcpToken)) { done(); return; }
  reply.code(401).send({ error: 'Unauthorized' });
}
