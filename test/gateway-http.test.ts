import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import test from 'node:test';
import { GatewayMcpEndpoint } from '../src/gateway/gateway-server.js';
import type { ToolMetadata } from '../src/types.js';

const tool: ToolMetadata = {
  serverId: 'fake', upstreamName: 'echo', exposedName: 'fake.echo', inputSchema: { type: 'object' },
  enabled: true, orphaned: false, tags: ['demo']
};

test('gateway exposes a Streamable HTTP MCP endpoint', async () => {
  const app = Fastify({ bodyLimit: 1024 * 1024 });
  const manager = {
    listTools: async (scope: { tag?: string }) => scope.tag === 'missing' ? [] : [tool],
    callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] })
  };
  const endpoint = new GatewayMcpEndpoint(manager as never, {} as never, app.log);
  await app.register(async (instance) => endpoint.register(instance));
  await app.listen({ host: '127.0.0.1', port: 0 });
  const address = app.server.address();
  assert.ok(address && typeof address === 'object');
  const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${address.port}/mcp`));
  const client = new Client({ name: 'test-client', version: '1.0.0' }, { capabilities: {} });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    assert.equal(tools.tools[0].name, 'fake.echo');
    const result = await client.callTool({ name: 'fake.echo', arguments: { text: 'hello' } });
    assert.equal((result.content as Array<{ text: string }>)[0].text, 'ok');
  } finally {
    await client.close().catch(() => undefined);
    await endpoint.close();
    await app.close();
  }
});
