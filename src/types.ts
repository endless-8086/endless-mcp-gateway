export type UpstreamType = 'stdio' | 'streamable-http' | 'sse';
export type RuntimeStatus = 'DISABLED' | 'STARTING' | 'READY' | 'DEGRADED' | 'STOPPING' | 'STOPPED' | 'FAILED';

export interface ServerConfig {
  id: string;
  name: string;
  type: UpstreamType;
  enabled: boolean;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
  config?: Record<string, unknown>;
  timeoutMs?: number | null;
  status?: RuntimeStatus;
  lastError?: string | null;
  lastConnectedAt?: string | null;
  version?: number;
}

export interface ToolMetadata {
  id?: number;
  serverId: string;
  upstreamName: string;
  exposedName: string;
  inputSchema: Record<string, unknown>;
  upstreamDescription?: string | null;
  descriptionOverride?: string | null;
  displayName?: string | null;
  enabled: boolean;
  orphaned: boolean;
  timeoutMs?: number | null;
  concurrencyLimit?: number | null;
  tags: string[];
  version?: number;
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface McpCallResult {
  [key: string]: unknown;
}

export interface HealthStatus {
  status: RuntimeStatus;
  error?: string;
  lastConnectedAt?: string;
}
