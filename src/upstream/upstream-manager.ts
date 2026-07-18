import type { Database } from '../db/database.js';
import { GatewayRepository } from '../db/repository.js';
import { config } from '../config.js';
import type { McpCallResult, McpTool, ServerConfig, ToolMetadata } from '../types.js';
import { McpClientConnector, AsyncMutex } from './connector.js';
import { validateUpstreamPolicy } from '../security/policy.js';

export class UpstreamManager {
  private readonly connectors = new Map<string, McpClientConnector>();
  private readonly locks = new Map<string, AsyncMutex>();
  private refreshTimer?: NodeJS.Timeout;
  private stopListening?: () => Promise<void>;

  constructor(private readonly repo: GatewayRepository, private readonly db: Database, private readonly logger: { debug: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void }) {}

  async start(): Promise<void> {
    const servers = await this.repo.listServers();
    for (const server of servers) {
      if (server.enabled) {
        this.ensureConnected(server).catch((error) => this.logger.warn({ err: error, serverId: server.id }, 'upstream connect failed'));
      }
    }
    this.refreshTimer = setInterval(() => void this.refreshAll(), config.refreshIntervalMs);
    this.refreshTimer.unref();
    this.stopListening = await this.db.listen('gateway_config_changed', (payload) => {
      try { void this.reload(JSON.parse(payload)); } catch (error) { this.logger.warn({ err: error }, 'invalid config notification'); }
    });
  }

  async stop(): Promise<void> {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    await this.stopListening?.();
    await Promise.all([...this.connectors.values()].map((connector) => connector.close()));
    this.connectors.clear();
  }

  private lockFor(serverId: string): AsyncMutex {
    let lock = this.locks.get(serverId);
    if (!lock) { lock = new AsyncMutex(); this.locks.set(serverId, lock); }
    return lock;
  }

  async reload(event: { serverId?: string; action?: string } = {}): Promise<void> {
    if (isCatalogOnlyChange(event.action)) {
      this.logger.debug({ serverId: event.serverId, action: event.action }, 'MCP catalog change applied without reconnecting upstream');
      return;
    }
    if (event.serverId) {
      const server = await this.repo.getServer(event.serverId);
      if (!server || !server.enabled) await this.disable(event.serverId);
      else await this.ensureConnected(server, true);
      return;
    }
    const servers = await this.repo.listServers();
    const configured = new Set(servers.map((server) => server.id));
    for (const id of this.connectors.keys()) if (!configured.has(id)) await this.disable(id);
    for (const server of servers) {
      if (server.enabled) await this.ensureConnected(server, true);
      else await this.disable(server.id);
    }
  }

  private async ensureConnected(server: ServerConfig, recreate = false): Promise<void> {
    await this.lockFor(server.id).runExclusive(async () => {
      if (recreate) await this.disableInternal(server.id);
      if (this.connectors.has(server.id)) return;
      const connector = new McpClientConnector(server.id, server, {
        timeoutMs: config.defaultCallTimeoutMs,
        maxConcurrency: config.maxToolConcurrency
      }, this.logger);
      this.connectors.set(server.id, connector);
      await this.repo.setServerStatus(server.id, 'STARTING');
      await this.repo.appendRuntimeEvent(server.id, 'STARTING', undefined);
      try {
        validateUpstreamPolicy(server);
        await connector.connect();
        await this.refreshServerTools(server.id);
        await this.repo.setServerStatus(server.id, 'READY');
        await this.repo.appendRuntimeEvent(server.id, 'READY', undefined);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.repo.setServerStatus(server.id, 'FAILED', message);
        await this.repo.appendRuntimeEvent(server.id, 'FAILED', message);
        this.logger.error({ err: error, serverId: server.id }, 'upstream failed');
      }
    });
  }

  private async disableInternal(serverId: string): Promise<void> {
    const connector = this.connectors.get(serverId);
    if (!connector) return;
    await this.repo.setServerStatus(serverId, 'STOPPING');
    await connector.close();
    this.connectors.delete(serverId);
    await this.repo.setServerStatus(serverId, 'STOPPED');
  }

  async disable(serverId: string): Promise<void> { await this.lockFor(serverId).runExclusive(() => this.disableInternal(serverId)); }

  async refreshAll(): Promise<void> {
    const servers = await this.repo.listServers();
    await Promise.all(servers
      .filter((server) => server.enabled)
      .map((server) => this.refreshServerTools(server.id, true)
        .catch((error) => this.logger.warn({ err: error, serverId: server.id }, 'tool refresh failed'))));
  }

  async refreshServerTools(serverId: string, skipWhenBusy = false): Promise<McpTool[]> {
    const connector = this.connectors.get(serverId);
    if (!connector) throw new Error('UPSTREAM_NOT_CONNECTED');
    const tools = skipWhenBusy ? await connector.tryListTools() : await connector.listTools();
    if (tools === undefined) {
      this.logger.debug({ serverId }, 'MCP tool refresh deferred while an upstream tool call is running');
      return [];
    }
    await this.repo.syncTools(serverId, tools);
    return tools;
  }

  async listTools(scope: { serverId?: string; tag?: string } = {}): Promise<ToolMetadata[]> {
    return this.repo.listTools(scope);
  }

  async callTool(tool: ToolMetadata, args: unknown, signal?: AbortSignal): Promise<McpCallResult> {
    const connector = this.connectors.get(tool.serverId);
    if (!connector) throw new Error('UPSTREAM_NOT_CONNECTED');
    const timeoutSource = tool.timeoutMs == null ? 'runtime.defaultCallTimeoutMs' : 'tool.timeoutMs';
    const timeoutMs = tool.timeoutMs ?? config.defaultCallTimeoutMs;
    const startedAt = Date.now();
    try {
      const result = await connector.callTool(tool.upstreamName, args, signal, timeoutMs);
      if (isMcpErrorResult(result)) {
        this.logger.warn({
          serverId: tool.serverId,
          toolName: tool.upstreamName,
          timeoutMs,
          timeoutSource,
          durationMs: Date.now() - startedAt,
          downstreamAborted: signal?.aborted === true
        }, 'MCP upstream tool returned an error result');
      }
      return result;
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      this.logger.warn({
        err: error,
        serverId: tool.serverId,
        toolName: tool.upstreamName,
        timeoutMs,
        timeoutSource,
        durationMs,
        downstreamAborted: signal?.aborted === true,
        gatewayTimeoutReached: signal?.aborted !== true && durationMs >= timeoutMs
      }, 'MCP upstream tool call failed');
      throw error;
    }
  }

  health(serverId: string): ReturnType<McpClientConnector['health']> {
    return this.connectors.get(serverId)?.health() ?? { status: 'STOPPED' };
  }

  async getServerHealth(serverId: string): Promise<Record<string, unknown>> {
    const server = await this.repo.getServer(serverId);
    if (!server) throw new Error('SERVER_NOT_FOUND');
    return { ...server, runtime: this.health(serverId) };
  }
}

function isCatalogOnlyChange(action?: string): boolean {
  return action === 'tool.updated'
    || action === 'tool.tags'
    || action === 'tag.updated'
    || action === 'tag.deleted';
}

function isMcpErrorResult(result: McpCallResult): boolean {
  return typeof result === 'object'
    && result !== null
    && !Array.isArray(result)
    && (result as Record<string, unknown>).isError === true;
}
