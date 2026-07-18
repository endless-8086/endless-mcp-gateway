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

/**
 * Keeps catalog refreshes out of an active MCP tool call while preserving
 * configured tool-call concurrency. Some stdio servers do not safely process
 * tools/list concurrently with a long-running tools/call.
 */
class AsyncReadWriteLock {
  private readers = 0;
  private writer = false;
  private readonly readerWaiters: Array<() => void> = [];
  private readonly writerWaiters: Array<() => void> = [];

  async acquireRead(): Promise<() => void> {
    if (!this.writer && this.writerWaiters.length === 0) {
      this.readers += 1;
      return () => this.releaseRead();
    }
    await new Promise<void>((resolve) => this.readerWaiters.push(resolve));
    this.readers += 1;
    return () => this.releaseRead();
  }

  async acquireWrite(): Promise<() => void> {
    if (!this.writer && this.readers === 0) {
      this.writer = true;
      return () => this.releaseWrite();
    }
    await new Promise<void>((resolve) => this.writerWaiters.push(resolve));
    return () => this.releaseWrite();
  }

  tryAcquireWrite(): (() => void) | undefined {
    if (this.writer || this.readers > 0) return undefined;
    this.writer = true;
    return () => this.releaseWrite();
  }

  private releaseRead(): void {
    this.readers = Math.max(0, this.readers - 1);
    if (this.readers === 0 && this.writerWaiters.length > 0) {
      this.writer = true;
      this.writerWaiters.shift()?.();
    }
  }

  private releaseWrite(): void {
    this.writer = false;
    if (this.writerWaiters.length > 0) {
      this.writer = true;
      this.writerWaiters.shift()?.();
      return;
    }
    while (this.readerWaiters.length > 0) this.readerWaiters.shift()?.();
  }
}

export interface UpstreamConnector {
  readonly serverId: string;
  connect(): Promise<void>;
  close(): Promise<void>;
  listTools(): Promise<McpTool[]>;
  tryListTools(): Promise<McpTool[] | undefined>;
  callTool(name: string, args: unknown, signal?: AbortSignal, timeoutMs?: number): Promise<McpCallResult>;
  health(): HealthStatus;
}

type ConnectorLogger = {
  warn: (data: Record<string, unknown>, message: string) => void;
};

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
  private readonly requestGate = new AsyncReadWriteLock();
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private activeToolCalls = 0;
  private static readonly MAX_RECONNECT = 10;
  private static readonly RECONNECT_BASE_MS = 1000;

  constructor(
    public readonly serverId: string,
    private readonly server: ServerConfig,
    private readonly defaults: { timeoutMs: number; maxConcurrency: number },
    private readonly logger?: ConnectorLogger
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
        const observedTransport = transport as { onclose?: () => void; onerror?: (error: Error) => void };
        observedTransport.onclose = () => {
          if (this.client === client) {
            this.client = null;
            this.state = 'FAILED';
            this.lastError = 'UPSTREAM_TRANSPORT_CLOSED';
            this.logger?.warn({
              serverId: this.serverId,
              upstreamType: this.server.type,
              activeToolCalls: this.activeToolCalls,
              lastConnectedAt: this.lastConnectedAt
            }, 'MCP upstream transport closed');
            this.scheduleReconnect();
          }
        };
        observedTransport.onerror = (error) => {
          this.state = 'DEGRADED';
          this.lastError = error.message;
          this.logger?.warn({
            err: error,
            serverId: this.serverId,
            upstreamType: this.server.type,
            activeToolCalls: this.activeToolCalls
          }, 'MCP upstream transport error');
        };
        // Register lifecycle handlers before connect so Protocol can retain
        // its own close/error handlers instead of having them overwritten.
        await client.connect(transport);
        this.client = client;
        this.transport = transport as { close?: () => Promise<void> };
        this.state = 'READY';
        this.lastError = undefined;
        this.lastConnectedAt = new Date().toISOString();
        this.clearReconnect();
      } catch (error) {
        this.state = 'FAILED';
        this.lastError = error instanceof Error ? error.message : String(error);
        this.client = null;
        throw error;
      }
    });
  }

  private buildStdioEnv(): Record<string, string> {
    // Only pass whitelisted system vars to subprocesses — not the full process.env
    const allowPrefixes = ['PATH', 'HOME', 'USER', 'LANG', 'TMP', 'SHELL', 'NODE_', 'CODEX_', 'OPENAI_', 'GEMINI_', 'ANTHROPIC_'];
    const env: Record<string, string> = {};
    for (const key of Object.keys(process.env)) {
      const value = process.env[key];
      if (value === undefined) continue;
      if (allowPrefixes.some((prefix) => key.startsWith(prefix))) {
        env[key] = value;
      }
    }
    // Server-configured env vars always win
    if (this.server.env) {
      Object.assign(env, this.server.env);
    }
    return env;
  }

  private createTransport(): unknown {
    const server = this.server;
    if (server.type === 'stdio') {
      if (!server.command) throw new Error(`stdio server ${server.id} has no command`);
      return new StdioClientTransport({
        command: server.command,
        args: server.args ?? [],
        cwd: server.cwd,
        env: this.buildStdioEnv()
      });
    }
    if (!server.url) throw new Error(`remote server ${server.id} has no url`);
    const url = new URL(server.url);
    const headers = server.headers ?? {};
    const options = { requestInit: { headers } };
    if (server.type === 'streamable-http') return new StreamableHTTPClientTransport(url, options as never);
    return new SSEClientTransport(url, { requestInit: { headers }, eventSourceInit: { headers } } as never);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempt >= McpClientConnector.MAX_RECONNECT) {
      this.lastError = `UPSTREAM_TRANSPORT_CLOSED (max ${McpClientConnector.MAX_RECONNECT} reconnect attempts exhausted)`;
      return;
    }
    const delay = Math.min(McpClientConnector.RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt), 60_000);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.connect().catch(() => undefined);
    }, delay);
  }

  private clearReconnect(): void {
    this.reconnectAttempt = 0;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  async close(): Promise<void> {
    await this.lifecycle.runExclusive(async () => {
      this.state = 'STOPPING';
      this.clearReconnect();
      const client = this.client;
      this.client = null;
      this.transport = null;
      await client?.close().catch(() => undefined);
      this.state = 'STOPPED';
    });
  }

  async listTools(): Promise<McpTool[]> {
    await this.connect();
    const release = await this.requestGate.acquireWrite();
    try {
      const result = await this.client!.listTools();
      return result.tools ?? [];
    } finally {
      release();
    }
  }

  async tryListTools(): Promise<McpTool[] | undefined> {
    await this.connect();
    const release = this.requestGate.tryAcquireWrite();
    if (!release) return undefined;
    try {
      const result = await this.client!.listTools();
      return result.tools ?? [];
    } finally {
      release();
    }
  }

  async callTool(name: string, args: unknown, signal?: AbortSignal, timeoutMs = this.defaults.timeoutMs): Promise<McpCallResult> {
    await this.connect();
    const releaseSemaphore = await this.semaphore.acquire();
    const releaseRequest = await this.requestGate.acquireRead();
    this.activeToolCalls += 1;
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
      this.activeToolCalls = Math.max(0, this.activeToolCalls - 1);
      releaseRequest();
      releaseSemaphore();
    }
  }

  health(): HealthStatus {
    return { status: this.state, error: this.lastError, lastConnectedAt: this.lastConnectedAt };
  }
}
