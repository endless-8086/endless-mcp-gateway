import pg from 'pg';
import { config } from '../src/config.js';

const pool = new pg.Pool({ connectionString: config.databaseUrl });
try {
  const result = await pool.query<{ db: string; usr: string; tables: number }>(`
    SELECT current_database() AS db, current_user AS usr, count(*)::int AS tables
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'mcp_%'
  `);
  console.log(JSON.stringify(result.rows[0]));
} finally {
  await pool.end();
}
