import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import type { McpCallResult, McpTool, ServerConfig, HealthStatus, RuntimeStatus } from '../types.js';

export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await fn(); } finally { release(); }
  }
}

export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(private readonly limit: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.limit) { this.active += 1; return () => this.release(); }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
    return () => this.release();
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    this.waiters.shift()?.();
  }
}

export interface UpstreamConnector {
  readonly serverId: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown, signal?: AbortSignal, timeoutMs?: number): Promise<McpCallResult>;
  health(): HealthStatus;
}

type AnyClient = {
  connect(transport: unknown): Promise<void>;
  listTools(): Promise<{ tools?: McpTool[] }>;
  callTool(params: { name: string; arguments?: unknown }, resultSchema?: unknown, options?: { signal?: AbortSignal; timeout?: number; maxTotalTimeout?: number }): Promise<McpCallResult>;
  close(): Promise<void>;
};

export class McpClientConnector implements UpstreamConnector {
  private client: AnyClient | null = null;
  private transport: { close?: () => Promise<void> } | null = null;
  private state: RuntimeStatus = 'STOPPED';
  private lastError?: string;
  private lastConnectedAt?: string;
  private readonly lifecycle = new AsyncMutex();
  private readonly semaphore: Semaphore;

  constructor(
    public readonly serverId: string,
    private readonly server: ServerConfig,
    private readonly defaults: { timeoutMs: number; maxConcurrency: number }
  ) {
    this.semaphore = new Semaphore(defaults.maxConcurrency);
  }

  async connect(): Promise<void> {
    await this.lifecycle.runExclusive(async () => {
      if (this.client) return;
      this.state = 'STARTING';
      try {
        await this.transport?.close?.().catch(() => undefined);
        this.transport = null;
        const client = new Client({ name: `endless-mcp-gateway/${this.serverId}`, version: '0.1.0' }, { capabilities: {} }) as unknown as AnyClient;
        const transport = this.createTransport();
        await client.connect(transport);
        this.client = client;
        this.transport = transport as { close?: () => Promise<void> };
        const observedTransport = transport as { onclose?: () => void; onerror?: (error: Error) => void };
        observedTransport.onclose = () => {
          if (this.client === client) {
            this.client = null;
            this.state = 'FAILED';
            this.lastError = 'UPSTREAM_TRANSPORT_CLOSED';
          }
        };
        observedTransport.onerror = (error) => {
          this.state = 'DEGRADED';
          this.lastError = error.message;
        };
        this.state = 'READY';
        this.lastError = undefined;
        this.lastConnectedAt = new Date().toISOString();
      } catch (error) {
        this.state = 'FAILED';
        this.lastError = error instanceof Error ? error.message : String(error);
        this.client = null;
        throw error;
      }
    });
  }

  private createTransport(): unknown {
    const server = this.server;
    if (server.type === 'stdio') {
      if (!server.command) throw new Error(`stdio server ${server.id} has no command`);
      return new StdioClientTransport({
        command: server.command,
        args: server.args ?? [],
        cwd: server.cwd,
        env: Object.fromEntries(Object.entries({ ...process.env, ...(server.env ?? {}) }).filter(([, value]) => value !== undefined)) as Record<string, string>
      });
    }
    if (!server.url) throw new Error(`remote server ${server.id} has no url`);
    const url = new URL(server.url);
    const headers = server.headers ?? {};
    const options = { requestInit: { headers } };
    if (server.type === 'streamable-http') return new StreamableHTTPClientTransport(url, options as never);
    return new SSEClientTransport(url, { requestInit: { headers }, eventSourceInit: { headers } } as never);
  }

  async close(): Promise<void> {
    await this.lifecycle.runExclusive(async () => {
      this.state = 'STOPPING';
      const client = this.client;
      this.client = null;
      this.transport = null;
      await client?.close().catch(() => undefined);
      this.state = 'STOPPED';
    });
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const result = await this.client!.listTools();
    return result.tools ?? [];
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal, timeoutMs = this.defaults.timeoutMs): Promise<McpCallResult> {
    await this.connect();
    const release = await this.semaphore.acquire();
    try {
      if (signal?.aborted) throw new Error('UPSTREAM_CALL_ABORTED');
      return await this.client!.callTool({ name, arguments: args }, undefined, {
        signal,
        timeout: timeoutMs,
        maxTotalTimeout: timeoutMs
      });
    } catch (error) {
      this.state = 'DEGRADED';
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      release();
    }
  }

  health(): HealthStatus {
    return { status: this.state, error: this.lastError, lastConnectedAt: this.lastConnectedAt };
  }
}
