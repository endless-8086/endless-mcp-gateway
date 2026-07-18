import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Database } from './database.js';

const db = new Database();
const migrationDir = path.resolve(process.cwd(), 'migrations');

async function migrate(): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const files = (await fs.readdir(migrationDir)).filter((file) => file.endsWith('.sql')).sort();
  const applied = new Set((await db.query<{ version: string }>('SELECT version FROM schema_migrations')).rows.map((row) => row.version));
  for (const file of files) {
    if (applied.has(file)) continue;
    await db.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['mcp-gateway:migration']);
      const check = await client.query<{ version: string }>('SELECT version FROM schema_migrations WHERE version = $1', [file]);
      if (check.rowCount) return;
      await client.query(await fs.readFile(path.join(migrationDir, file), 'utf8'));
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    });
  }
}

async function rollback(): Promise<void> {
  // Deliberately conservative: migrations are forward-only by default.
  throw new Error('Rollback is not supported for the initial migration. Restore a database backup instead.');
}

try {
  if (process.argv[2] === 'rollback') await rollback();
  else await migrate();
} finally {
  await db.close();
}
