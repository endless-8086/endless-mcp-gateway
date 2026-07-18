import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { AsyncMutex, McpClientConnector, Semaphore } from '../src/upstream/connector.js';

test('AsyncMutex serializes critical sections', async () => {
  const mutex = new AsyncMutex();
  const order: number[] = [];
  await Promise.all([1, 2, 3].map((value) => mutex.runExclusive(async () => {
    order.push(value);
    await new Promise((resolve) => setTimeout(resolve, 5));
    order.push(value * 10);
  })));
  assert.deepEqual(order, [1, 10, 2, 20, 3, 30]);
});

test('Semaphore enforces the configured concurrency', async () => {
  const semaphore = new Semaphore(2);
  let active = 0;
  let peak = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    const release = await semaphore.acquire();
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    release();
  }));
  assert.equal(peak, 2);
});

test('stdio connector starts an isolated MCP process and proxies tools', async () => {
  const fixture = path.resolve('test/fixtures/stdio-mcp.mjs');
  const connector = new McpClientConnector('fixture', { id: 'fixture', name: 'fixture', type: 'stdio', enabled: true, command: process.execPath, args: [fixture] }, { timeoutMs: 5000, maxConcurrency: 2 });
  await connector.connect();
  assert.equal((await connector.listTools())[0].name, 'echo');
  const result = await connector.callTool('echo', { text: 'hello' });
  assert.equal((result.content as Array<{ text: string }>)[0].text, 'hello');
  assert.equal(connector.health().status, 'READY');
  await connector.close();
});

test('catalog refresh waits for an active tool call to finish', async () => {
  const fixture = path.resolve('test/fixtures/stdio-mcp.mjs');
  const connector = new McpClientConnector('fixture', { id: 'fixture', name: 'fixture', type: 'stdio', enabled: true, command: process.execPath, args: [fixture] }, { timeoutMs: 5000, maxConcurrency: 2 });
  await connector.connect();
  const inFlight = connector.callTool('echo', { text: 'hello', delayMs: 100 });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(await connector.tryListTools(), undefined);
  await inFlight;
  assert.equal((await connector.tryListTools())?.[0].name, 'echo');
  await connector.close();
});
