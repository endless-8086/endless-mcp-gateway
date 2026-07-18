import assert from 'node:assert/strict';
import test from 'node:test';
import { GatewayRepository } from '../src/db/repository.js';

test('tool repository returns a bounded page with metadata', async () => {
  const calls: string[] = [];
  const db = {
    query: async (sql: string) => {
      calls.push(sql);
      if (sql.includes('COUNT(DISTINCT')) return { rows: [{ total: 3 }] };
      return {
        rows: [{
          id: 1, server_id: 'demo', upstream_name: 'echo', exposed_name: 'demo.echo', input_schema: { type: 'object' },
          upstream_description: 'Echo', description_override: null, display_name: null, enabled: true, orphaned: false,
          timeout_ms: null, concurrency_limit: null, version: 1, tags: ['demo']
        }]
      };
    }
  };
  const page = await new GatewayRepository(db as never).listToolsPage({ includeDisabled: true, page: 2, pageSize: 2, search: 'echo' });
  assert.equal(page.total, 3);
  assert.equal(page.page, 2);
  assert.equal(page.pageSize, 2);
  assert.equal(page.totalPages, 2);
  assert.equal(page.items[0].exposedName, 'demo.echo');
  assert.match(calls[1], /LIMIT \$2 OFFSET \$3/);
});

test('tool discovery does not invalidate user configuration versions', async () => {
  const calls: string[] = [];
  const db = {
    transaction: async (fn: (client: { query: (sql: string) => Promise<{ rows: [] }> }) => Promise<void>) => fn({
      query: async (sql: string) => {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        return { rows: [] };
      }
    })
  };
  await new GatewayRepository(db as never).syncTools('demo', [{
    name: 'echo',
    description: 'Echo input',
    inputSchema: { type: 'object' }
  }]);
  const upsertIndex = calls.findIndex((sql) => sql.includes('INSERT INTO mcp_tools'));
  const orphanIndex = calls.findIndex((sql) => sql.startsWith('UPDATE mcp_tools SET orphaned = TRUE'));
  assert.ok(upsertIndex >= 0);
  assert.ok(orphanIndex > upsertIndex);
  assert.doesNotMatch(calls[upsertIndex], /version=/);
  assert.match(calls[orphanIndex], /AND orphaned = FALSE/);
  assert.match(calls[orphanIndex], /NOT \(upstream_name = ANY\(\$2::text\[\]\)\)/);
  assert.doesNotMatch(calls[orphanIndex], /version = version \+ 1/);
});

test('tool settings update without a catalog version precondition', async () => {
  const calls: string[] = [];
  const row = {
    id: 1, server_id: 'demo', upstream_name: 'echo', exposed_name: 'demo.echo', input_schema: { type: 'object' },
    upstream_description: 'Echo', description_override: null, display_name: null, enabled: false, orphaned: false,
    timeout_ms: null, concurrency_limit: null, version: 2
  };
  const db = {
    transaction: async (fn: (client: { query: (sql: string) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => fn({
      query: async (sql: string) => {
        calls.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('UPDATE mcp_tools')) return { rows: [row] };
        if (sql.includes('SELECT tg.name')) return { rows: [] };
        throw new Error(`unexpected query: ${sql}`);
      }
    })
  };
  const updated = await new GatewayRepository(db as never).patchTool('demo', 'echo', { enabled: false });
  assert.equal(updated?.enabled, false);
  assert.equal(updated?.version, 2);
  assert.doesNotMatch(calls.join('\n'), /SELECT id, version/);
});
