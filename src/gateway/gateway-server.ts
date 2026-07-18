import crypto from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from 'pino';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ToolMetadata } from '../types.js';
import type { GatewayRepository } from '../db/repository.js';
import type { UpstreamManager } from '../upstream/upstream-manager.js';
import { config } from '../config.js';

type Scope = { serverId?: string; tag?: string };
type Session = { transport: StreamableHTTPServerTransport; server: Server; scope: Scope };

function asMcpTool(tool: ToolMetadata) {
  return {
    name: tool.exposedName,
    description: tool.descriptionOverride ?? tool.upstreamDescription ?? undefined,
    inputSchema: tool.inputSchema && Object.keys(tool.inputSchema).length ? tool.inputSchema : { type: 'object' }
  };
}

export class GatewayMcpEndpoint {
  private readonly sessions = new Map<string, Session>();

  constructor(private readonly manager: UpstreamManager, private readonly repo: GatewayRepository, private readonly logger: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void }) {}

  async register(app: FastifyInstance): Promise<void> {
    app.all('/mcp', async (request, reply) => this.handle(request, reply, {}));
    app.all('/mcp/servers/:serverId', async (request, reply) => this.handle(request, reply, { serverId: String((request.params as { serverId: string }).serverId) }));
    app.all('/mcp/tags/:tag', async (request, reply) => this.handle(request, reply, { tag: String((request.params as { tag: string }).tag) }));
  }

  private async handle(request: FastifyRequest, reply: FastifyReply, scope: Scope): Promise<void> {
    const sessionId = String(request.headers['mcp-session-id'] ?? '');
    if (sessionId && !this.sessions.has(sessionId)) {
      reply.code(404).send({ error: 'Unknown MCP session' });
      return;
    }
    if (request.method === 'DELETE' && sessionId) {
      const session = this.sessions.get(sessionId)!;
      this.sessions.delete(sessionId);
      await this.handleTransportRequest(session.transport, request, reply, sessionId);
      await session.server.close().catch(() => undefined);
      return;
    }
    if (!sessionId && request.method !== 'POST') {
      reply.code(400).send({ error: 'A POST initialize request is required before opening an MCP session' });
      return;
    }

    let session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      const server = this.createServer(scope);
      let initializedId: string | undefined;
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (id: string) => {
          initializedId = id;
        },
        onsessionclosed: (id: string) => {
          this.sessions.delete(id);
          this.logger.debug({ sessionId: id }, 'MCP downstream session closed');
        }
      });
      await server.connect(transport);
      session = { server, transport, scope };
      try {
        await this.handleTransportRequest(transport, request, reply, sessionId);
        if (initializedId) this.sessions.set(initializedId, session);
      } catch (error) {
        await server.close().catch(() => undefined);
        throw error;
      }
      return;
    }
    await this.handleTransportRequest(session.transport, request, reply, sessionId);
  }

  private async handleTransportRequest(
    transport: StreamableHTTPServerTransport,
    request: FastifyRequest,
    reply: FastifyReply,
    sessionId: string
  ): Promise<void> {
    const reportClosed = () => {
      if (request.method !== 'POST' || reply.raw.writableEnded) return;
      this.logger.warn({
        requestId: request.id,
        sessionId: sessionId || undefined,
        method: request.method
      }, 'MCP downstream HTTP request closed before a response was sent');
    };
    const reportAborted = () => this.logger.warn({
      requestId: request.id,
      sessionId: sessionId || undefined,
      method: request.method
    }, 'MCP downstream HTTP request aborted');
    request.raw.once('aborted', reportAborted);
    reply.raw.once('close', reportClosed);
    reply.hijack();
    try {
      await transport.handleRequest(request.raw as IncomingMessage, reply.raw as ServerResponse, request.body);
    } finally {
      request.raw.off('aborted', reportAborted);
      reply.raw.off('close', reportClosed);
    }
  }

  private createServer(scope: Scope): Server {
    const server = new Server({ name: 'endless-mcp-gateway', version: '0.1.0' }, { capabilities: { tools: {} } });
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: (await this.manager.listTools(scope)).map(asMcpTool)
    }));
    server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
      const name = request.params.name;
      const tools = await this.manager.listTools(scope);
      const tool = tools.find((candidate) => candidate.exposedName === name);
      if (!tool || !tool.enabled) {
        throw new Error(`Tool not found or disabled: ${name}`);
      }
      const callId = crypto.randomUUID();
      const startedAt = Date.now();
      const aborted = () => this.logger.warn({
        callId,
        sessionId: extra.sessionId,
        requestId: extra.requestId,
        serverId: tool.serverId,
        toolName: tool.upstreamName,
        durationMs: Date.now() - startedAt,
        abortReason: String(extra.signal.reason ?? '')
      }, 'MCP downstream tool call aborted');
      extra.signal.addEventListener('abort', aborted, { once: true });
      try {
        const result = await this.manager.callTool(tool, request.params.arguments ?? {}, extra.signal);
        this.logger.debug({
          callId,
          sessionId: extra.sessionId,
          requestId: extra.requestId,
          serverId: tool.serverId,
          toolName: tool.upstreamName,
          durationMs: Date.now() - startedAt
        }, 'MCP downstream tool call completed');
        return result as never;
      } finally {
        extra.signal.removeEventListener('abort', aborted);
      }
    });
    return server;
  }

  async close(): Promise<void> {
    const sessions = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.all(sessions.map(async (session) => {
      await session.transport.close().catch((error) => this.logger.debug({ err: error }, 'MCP transport close failed'));
      await session.server.close().catch(() => undefined);
    }));
  }
}
