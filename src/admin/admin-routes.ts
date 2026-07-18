import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { GatewayRepository } from '../db/repository.js';
import type { Database } from '../db/database.js';
import type { UpstreamManager } from '../upstream/upstream-manager.js';
import { requireAdmin } from './auth.js';

const serverSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/), name: z.string().min(1), type: z.enum(['stdio', 'streamable-http', 'sse']),
  enabled: z.boolean().default(true), command: z.string().optional(), args: z.array(z.string()).optional(), cwd: z.string().optional(),
  env: z.record(z.string()).optional(), url: z.string().url().optional(), headers: z.record(z.string()).optional(), config: z.record(z.unknown()).optional(), version: z.number().int().optional()
}).superRefine((value, ctx) => {
  if (value.type === 'stdio' && !value.command) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'stdio requires command', path: ['command'] });
  if (value.type !== 'stdio' && !value.url) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'remote server requires url', path: ['url'] });
});

function errorResponse(reply: FastifyReply, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const status = message === 'VERSION_CONFLICT' ? 409 : message.endsWith('_NOT_FOUND') || message.startsWith('TAG_NOT_FOUND') ? 404 : 400;
  reply.code(status).send({ error: message });
}

export async function registerAdminRoutes(app: FastifyInstance, repo: GatewayRepository, manager: UpstreamManager, db: Database, logger: { debug: (...args: unknown[]) => void }): Promise<void> {
  app.addHook('preHandler', requireAdmin);
  app.get('/api/v1/servers', async () => repo.listServers());
  app.post('/api/v1/servers', async (request, reply) => {
    try {
      const input = serverSchema.parse(request.body);
      const saved = await repo.saveServer(input);
      await db.notify('gateway_config_changed', { serverId: saved.id, action: 'upsert' });
      await repo.appendAudit(String(request.headers['x-actor'] ?? 'api'), 'server.create', 'server', saved.id);
      reply.code(201).send(saved);
    } catch (error) { errorResponse(reply, error); }
  });
  app.get('/api/v1/servers/:id', async (request, reply) => {
    const result = await repo.getServer(String((request.params as { id: string }).id));
    if (!result) { reply.code(404).send({ error: 'SERVER_NOT_FOUND' }); return; }
    reply.send(result);
  });
  app.put('/api/v1/servers/:id', async (request, reply) => {
    try {
      const id = String((request.params as { id: string }).id);
      const existing = await repo.getServer(id);
      if (!existing) { reply.code(404).send({ error: 'SERVER_NOT_FOUND' }); return; }
      const input = serverSchema.parse({ ...existing, ...(request.body as object), id });
      const saved = await repo.saveServer(input, input.version);
      await db.notify('gateway_config_changed', { serverId: id, action: 'upsert' });
      await repo.appendAudit(String(request.headers['x-actor'] ?? 'api'), 'server.update', 'server', id);
      reply.send(saved);
    } catch (error) { errorResponse(reply, error); }
  });
  app.delete('/api/v1/servers/:id', async (request, reply) => {
    const id = String((request.params as { id: string }).id);
    await manager.disable(id).catch(() => undefined);
    await repo.deleteServer(id);
    await db.notify('gateway_config_changed', { serverId: id, action: 'delete' });
    await repo.appendAudit(String(request.headers['x-actor'] ?? 'api'), 'server.delete', 'server', id);
    reply.code(204).send();
  });
  app.post('/api/v1/servers/:id/enable', async (request, reply) => updateEnabled(request, reply, true));
  app.post('/api/v1/servers/:id/disable', async (request, reply) => updateEnabled(request, reply, false));
  app.post('/api/v1/servers/:id/refresh', async (request, reply) => {
    try { const id = String((request.params as { id: string }).id); const tools = await manager.refreshServerTools(id); reply.send({ count: tools.length }); }
    catch (error) { errorResponse(reply, error); }
  });
  app.get('/api/v1/servers/:id/health', async (request, reply) => {
    try { reply.send(await manager.getServerHealth(String((request.params as { id: string }).id))); }
    catch (error) { errorResponse(reply, error); }
  });
  app.get('/api/v1/tools', async (request) => {
    const query = request.query as { serverId?: string; tag?: string; search?: string; includeDisabled?: string; paginate?: string; page?: string; pageSize?: string };
    const options = {
      serverId: query.serverId,
      tag: query.tag,
      search: query.search,
      includeDisabled: query.includeDisabled === 'true'
    };
    if (query.paginate === 'true') {
      const page = Number.isFinite(Number(query.page)) ? Number(query.page) : 1;
      const pageSize = Number.isFinite(Number(query.pageSize)) ? Number(query.pageSize) : 20;
      return repo.listToolsPage({ ...options, page, pageSize });
    }
    return repo.listTools(options);
  });
  app.get('/api/v1/servers/:id/tools', async (request) => repo.listTools({ serverId: String((request.params as { id: string }).id), includeDisabled: true }));
  app.put('/api/v1/servers/:id/tools/:toolName', async (request, reply) => {
    try {
      const params = request.params as { id: string; toolName: string };
      const patch = z.object({ enabled: z.boolean().optional(), displayName: z.string().nullable().optional(), descriptionOverride: z.string().nullable().optional(), timeoutMs: z.number().int().min(100).max(3600000).nullable().optional(), concurrencyLimit: z.number().int().min(1).max(1000).nullable().optional(), version: z.number().int().optional() }).parse(request.body);
      const result = await repo.patchTool(params.id, params.toolName, patch);
      if (!result) { reply.code(404).send({ error: 'TOOL_NOT_FOUND' }); return; }
      await db.notify('gateway_config_changed', { serverId: params.id, action: 'tool.updated' });
      reply.send(result);
    } catch (error) { errorResponse(reply, error); }
  });
  app.get('/api/v1/tags', async () => repo.listTags());
  app.post('/api/v1/tags', async (request, reply) => {
    try { const input = z.object({ name: z.string().regex(/^[a-zA-Z0-9:_-]+$/), displayName: z.string().optional(), description: z.string().optional() }).parse(request.body); await repo.createTag(input); await db.notify('gateway_config_changed', { action: 'tag.updated' }); reply.code(201).send(input); }
    catch (error) { errorResponse(reply, error); }
  });
  app.put('/api/v1/tags/:name', async (request, reply) => {
    try { const name = String((request.params as { name: string }).name); const input = z.object({ displayName: z.string().nullable().optional(), description: z.string().nullable().optional(), enabled: z.boolean().optional() }).parse(request.body); await repo.updateTag(name, input); await db.notify('gateway_config_changed', { action: 'tag.updated' }); reply.send({ name, ...input }); }
    catch (error) { errorResponse(reply, error); }
  });
  app.delete('/api/v1/tags/:name', async (request, reply) => { await repo.deleteTag(String((request.params as { name: string }).name)); await db.notify('gateway_config_changed', { action: 'tag.deleted' }); reply.code(204).send(); });
  app.put('/api/v1/servers/:id/tools/:toolName/tags', async (request, reply) => {
    try { const params = request.params as { id: string; toolName: string }; const input = z.object({ tags: z.array(z.string()) }).parse(request.body); await repo.setToolTags(params.id, params.toolName, input.tags); await db.notify('gateway_config_changed', { serverId: params.id, action: 'tool.tags' }); reply.send({ serverId: params.id, toolName: params.toolName, tags: input.tags }); }
    catch (error) { errorResponse(reply, error); }
  });
  app.get('/api/v1/runtime', async () => Promise.all((await repo.listServers()).map(async (server) => ({ server, runtime: manager.health(server.id) }))));
  logger.debug('admin routes registered');

  async function updateEnabled(request: FastifyRequest, reply: FastifyReply, enabled: boolean): Promise<void> {
    try { const id = String((request.params as { id: string }).id); const saved = await repo.setServerEnabled(id, enabled); if (!saved) { reply.code(404).send({ error: 'SERVER_NOT_FOUND' }); return; } await db.notify('gateway_config_changed', { serverId: id, action: enabled ? 'enable' : 'disable' }); reply.send(saved); }
    catch (error) { errorResponse(reply, error); }
  }
}
