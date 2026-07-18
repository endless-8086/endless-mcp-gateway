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
