import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

type JsonConfig = Record<string, unknown>;

function readJsonConfig(): JsonConfig {
  const filePath = process.env.MCP_GATEWAY_CONFIG ?? path.resolve(process.cwd(), 'config/gateway.json');
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('root must be an object');
    return parsed as JsonConfig;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new Error(`Invalid MCP_GATEWAY_CONFIG ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const fileConfig = readJsonConfig();
const databaseConfig = (fileConfig.database ?? {}) as JsonConfig;
const httpConfig = (fileConfig.http ?? {}) as JsonConfig;
const runtimeConfig = (fileConfig.runtime ?? {}) as JsonConfig;
const securityConfig = (fileConfig.security ?? {}) as JsonConfig;

function setting(name: string, fileValue: unknown, fallback: string): string {
  const envValue = process.env[name];
  return envValue !== undefined && envValue !== '' ? envValue : typeof fileValue === 'string' && fileValue !== '' ? fileValue : fallback;
}

function numberSetting(name: string, fileValue: unknown, fallback: number): number {
  const value = process.env[name];
  const parsed = Number(value !== undefined && value !== '' ? value : fileValue ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanSetting(name: string, fileValue: unknown, fallback: boolean): boolean {
  const value = process.env[name];
  if (value !== undefined && value !== '') return value.toLowerCase() === 'true' || value === '1';
  return typeof fileValue === 'boolean' ? fileValue : fallback;
}

function listSetting(name: string, fileValue: unknown): string[] {
  const value = process.env[name];
  if (value !== undefined) return value.split(',').map((item) => item.trim()).filter(Boolean);
  if (Array.isArray(fileValue)) return fileValue.filter((item): item is string => typeof item === 'string' && item.length > 0);
  return [];
}

const nodeEnvironment = setting('NODE_ENV', fileConfig.nodeEnv, 'development');
const adminToken = setting('ADMIN_TOKEN', securityConfig.adminToken, '');
const mcpToken = setting('MCP_TOKEN', securityConfig.mcpToken, '');

// Production safety: refuse to start with empty admin token in production.
// Set MCP_GATEWAY_ALLOW_EMPTY_TOKEN=true to override (NOT recommended).
if (nodeEnvironment === 'production' && !adminToken && process.env.MCP_GATEWAY_ALLOW_EMPTY_TOKEN !== 'true') {
  throw new Error('ADMIN_TOKEN must be set in production mode. Set MCP_GATEWAY_ALLOW_EMPTY_TOKEN=true to override.');
}

export const config = {
  configFile: process.env.MCP_GATEWAY_CONFIG ?? path.resolve(process.cwd(), 'config/gateway.json'),
  nodeEnv: nodeEnvironment,
  host: setting('HOST', httpConfig.host, '0.0.0.0'),
  port: numberSetting('PORT', httpConfig.port, 8080),
  databaseUrl: setting('DATABASE_URL', databaseConfig.url ?? fileConfig.databaseUrl, 'postgres://mcp_gateway:mcp_gateway@localhost:5432/mcp-gateway'),
  dbPoolMax: numberSetting('DB_POOL_MAX', databaseConfig.poolMax, 20),
  dbIdleTimeoutMs: numberSetting('DB_IDLE_TIMEOUT_MS', databaseConfig.idleTimeoutMs, 30_000),
  dbConnectionTimeoutMs: numberSetting('DB_CONNECTION_TIMEOUT_MS', databaseConfig.connectionTimeoutMs, 5_000),
  dbMaxUses: numberSetting('DB_MAX_USES', databaseConfig.maxUses, 0),
  adminToken,
  mcpToken,
  upgradeInsecureRequests: booleanSetting('UPGRADE_INSECURE_REQUESTS', securityConfig.upgradeInsecureRequests, false),
  logLevel: setting('LOG_LEVEL', runtimeConfig.logLevel, 'info'),
  refreshIntervalMs: numberSetting('TOOL_REFRESH_INTERVAL_MS', runtimeConfig.refreshIntervalMs, 60_000),
  defaultCallTimeoutMs: numberSetting('DEFAULT_CALL_TIMEOUT_MS', runtimeConfig.defaultCallTimeoutMs, 300_000),
  maxBodyBytes: numberSetting('MAX_BODY_BYTES', runtimeConfig.maxBodyBytes, 1_048_576),
  maxToolConcurrency: numberSetting('MAX_TOOL_CONCURRENCY', runtimeConfig.maxToolConcurrency, 8),
  maxRestarts: numberSetting('MAX_UPSTREAM_RESTARTS', runtimeConfig.maxRestarts, 10),
  restartBackoffMs: numberSetting('UPSTREAM_RESTART_BACKOFF_MS', runtimeConfig.restartBackoffMs, 1_000),
  allowedStdioCommands: listSetting('ALLOWED_STDIO_COMMANDS', securityConfig.allowedStdioCommands),
  allowedUpstreamHosts: listSetting('ALLOWED_UPSTREAM_HOSTS', securityConfig.allowedUpstreamHosts),
  allowPrivateUpstreams: booleanSetting('ALLOW_PRIVATE_UPSTREAMS', securityConfig.allowPrivateUpstreams, nodeEnvironment !== 'production')
};
