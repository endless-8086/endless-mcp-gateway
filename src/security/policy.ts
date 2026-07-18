import net from 'node:net';
import type { ServerConfig } from '../types.js';
import { config } from '../config.js';

function privateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function validateUpstreamPolicy(server: ServerConfig): void {
  if (server.type === 'stdio') {
    if (!server.command || server.command.includes('\0')) throw new Error('INVALID_STDIO_COMMAND');
    if (config.allowedStdioCommands.length && !config.allowedStdioCommands.includes(server.command)) throw new Error('STDIO_COMMAND_NOT_ALLOWED');
    return;
  }
  if (!server.url) throw new Error('REMOTE_URL_REQUIRED');
  const url = new URL(server.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('REMOTE_URL_PROTOCOL_NOT_ALLOWED');
  const allowedHosts = config.allowedUpstreamHosts.map((value) => value.toLowerCase());
  if (allowedHosts.length && !allowedHosts.includes(url.hostname.toLowerCase())) throw new Error('REMOTE_HOST_NOT_ALLOWED');
  if (!config.allowPrivateUpstreams && (url.hostname === 'localhost' || url.hostname.endsWith('.localhost') || url.hostname === '::1' || net.isIP(url.hostname) === 6 || privateIpv4(url.hostname))) throw new Error('PRIVATE_REMOTE_NOT_ALLOWED');
}
