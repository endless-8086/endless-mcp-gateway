import pg from 'pg';
import type { PoolClient, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export class Database {
  readonly pool = new Pool({
    connectionString: config.databaseUrl,
    max: config.dbPoolMax,
    idleTimeoutMillis: config.dbIdleTimeoutMs,
    connectionTimeoutMillis: config.dbConnectionTimeoutMs,
    maxUses: config.dbMaxUses || undefined
  });

  async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async transaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async advisoryLock(key: string): Promise<() => Promise<void>> {
    const client = await this.pool.connect();
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [key]);
    return async () => {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [key]).catch(() => undefined);
      client.release();
    };
  }

  async notify(channel: string, payload: unknown): Promise<void> {
    await this.query('SELECT pg_notify($1, $2)', [channel, JSON.stringify(payload)]);
  }

  async listen(channel: string, onMessage: (payload: string) => void): Promise<() => Promise<void>> {
    const client = await this.pool.connect();
    await client.query(`LISTEN "${channel.replace(/"/g, '""')}"`);
    const handler = (message: { channel: string; payload?: string }) => {
      if (message.channel === channel) onMessage(message.payload ?? '');
    };
    client.on('notification', handler);
    return async () => {
      client.off('notification', handler);
      await client.query(`UNLISTEN "${channel.replace(/"/g, '""')}"`).catch(() => undefined);
      client.release();
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
