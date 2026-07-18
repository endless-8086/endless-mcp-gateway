import type { PoolClient } from 'pg';
import type { Database } from './database.js';
import type { McpTool, ServerConfig, ToolMetadata, UpstreamType, RuntimeStatus } from '../types.js';

type ServerRow = {
  id: string; name: string; type: UpstreamType; enabled: boolean; command: string | null;
  args: string[]; cwd: string | null; env: Record<string, string>; url: string | null;
  headers: Record<string, string>; config: Record<string, unknown>; status: RuntimeStatus;
  last_error: string | null; last_connected_at: Date | null; version: number;
};

type ToolRow = {
  id: number; server_id: string; upstream_name: string; exposed_name: string; input_schema: Record<string, unknown>;
  upstream_description: string | null; description_override: string | null; display_name: string | null;
  enabled: boolean; orphaned: boolean; timeout_ms: number | null; concurrency_limit: number | null; version: number;
};

function mapServer(row: ServerRow): ServerConfig {
  return {
    id: row.id, name: row.name, type: row.type, enabled: row.enabled,
    command: row.command ?? undefined, args: row.args ?? [], cwd: row.cwd ?? undefined,
    env: row.env ?? {}, url: row.url ?? undefined, headers: row.headers ?? {}, config: row.config ?? {},
    status: row.status, lastError: row.last_error, lastConnectedAt: row.last_connected_at?.toISOString() ?? null,
    version: row.version
  };
}

function mapTool(row: ToolRow, tags: string[] = []): ToolMetadata {
  return {
    id: row.id, serverId: row.server_id, upstreamName: row.upstream_name, exposedName: row.exposed_name,
    inputSchema: row.input_schema ?? {}, upstreamDescription: row.upstream_description,
    descriptionOverride: row.description_override, displayName: row.display_name, enabled: row.enabled,
    orphaned: row.orphaned, timeoutMs: row.timeout_ms, concurrencyLimit: row.concurrency_limit,
    tags, version: row.version
  };
}

export interface ToolPatch {
  enabled?: boolean;
  displayName?: string | null;
  descriptionOverride?: string | null;
  timeoutMs?: number | null;
  concurrencyLimit?: number | null;
  version?: number;
}

export interface ToolListOptions {
  serverId?: string;
  tag?: string;
  search?: string;
  includeDisabled?: boolean;
}

export interface ToolPage {
  items: ToolMetadata[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class GatewayRepository {
  constructor(private readonly db: Database) {}

  async listServers(): Promise<ServerConfig[]> {
    return (await this.db.query<ServerRow>('SELECT * FROM mcp_servers ORDER BY id')).rows.map(mapServer);
  }

  async getServer(id: string): Promise<ServerConfig | null> {
    const result = await this.db.query<ServerRow>('SELECT * FROM mcp_servers WHERE id = $1', [id]);
    return result.rows[0] ? mapServer(result.rows[0]) : null;
  }

  async saveServer(server: ServerConfig, expectedVersion?: number): Promise<ServerConfig> {
    const version = expectedVersion ?? server.version;
    return this.db.transaction(async (client) => {
      if (version !== undefined) {
        const current = await client.query<{ version: number }>('SELECT version FROM mcp_servers WHERE id = $1 FOR UPDATE', [server.id]);
        if (current.rowCount && current.rows[0].version !== version) throw new Error('VERSION_CONFLICT');
      }
      const result = await client.query<ServerRow>(`
        INSERT INTO mcp_servers (id, name, type, enabled, command, args, cwd, env, url, headers, config, status, version)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8::jsonb,$9,$10::jsonb,$11::jsonb,COALESCE($12,'STOPPED'),COALESCE($13,1))
        ON CONFLICT (id) DO UPDATE SET
          name=EXCLUDED.name, type=EXCLUDED.type, enabled=EXCLUDED.enabled, command=EXCLUDED.command,
          args=EXCLUDED.args, cwd=EXCLUDED.cwd, env=EXCLUDED.env, url=EXCLUDED.url, headers=EXCLUDED.headers,
          config=EXCLUDED.config, version=mcp_servers.version + 1
        RETURNING *`, [
        server.id, server.name, server.type, server.enabled, server.command ?? null, JSON.stringify(server.args ?? []),
        server.cwd ?? null, JSON.stringify(server.env ?? {}), server.url ?? null, JSON.stringify(server.headers ?? {}),
        JSON.stringify(server.config ?? {}), server.status ?? 'STOPPED', version ?? null
      ]);
      return mapServer(result.rows[0]);
    });
  }

  async deleteServer(id: string): Promise<void> {
    await this.db.query('DELETE FROM mcp_servers WHERE id = $1', [id]);
  }

  async setServerEnabled(id: string, enabled: boolean): Promise<ServerConfig | null> {
    const result = await this.db.query<ServerRow>('UPDATE mcp_servers SET enabled = $2, version = version + 1 WHERE id = $1 RETURNING *', [id, enabled]);
    return result.rows[0] ? mapServer(result.rows[0]) : null;
  }

  async setServerStatus(id: string, status: RuntimeStatus, error?: string | null): Promise<void> {
    await this.db.query('UPDATE mcp_servers SET status = $2, last_error = $3, last_connected_at = CASE WHEN $2 = \'READY\' THEN now() ELSE last_connected_at END WHERE id = $1', [id, status, error ?? null]);
  }

  private buildToolWhere(options: ToolListOptions, params: unknown[]): string[] {
    const where: string[] = [];
    if (options.serverId) { params.push(options.serverId); where.push(`t.server_id = $${params.length}`); }
    if (!options.includeDisabled) where.push('t.enabled = TRUE AND s.enabled = TRUE AND t.orphaned = FALSE');
    if (options.tag) { params.push(options.tag); where.push(`EXISTS (SELECT 1 FROM mcp_tool_tags tt2 JOIN mcp_tags tg2 ON tg2.id = tt2.tag_id WHERE tt2.tool_id = t.id AND tg2.name = $${params.length} AND tg2.enabled = TRUE)`); }
    if (options.search?.trim()) {
      params.push(`%${options.search.trim()}%`);
      where.push(`(t.exposed_name ILIKE $${params.length} OR t.upstream_name ILIKE $${params.length} OR t.server_id ILIKE $${params.length} OR COALESCE(t.display_name, '') ILIKE $${params.length} OR COALESCE(t.description_override, '') ILIKE $${params.length} OR COALESCE(t.upstream_description, '') ILIKE $${params.length})`);
    }
    return where;
  }

  async listTools(options: ToolListOptions = {}): Promise<ToolMetadata[]> {
    const params: unknown[] = [];
    const where = this.buildToolWhere(options, params);
    const result = await this.db.query<ToolRow & { tags: string[] }>(`
      SELECT t.*, COALESCE(array_agg(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL), ARRAY[]::text[]) AS tags
      FROM mcp_tools t JOIN mcp_servers s ON s.id = t.server_id
      LEFT JOIN mcp_tool_tags tt ON tt.tool_id = t.id LEFT JOIN mcp_tags tg ON tg.id = tt.tag_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY t.id ORDER BY t.exposed_name`, params);
    return result.rows.map((row) => mapTool(row, row.tags ?? []));
  }

  async listToolsPage(options: ToolListOptions & { page?: number; pageSize?: number } = {}): Promise<ToolPage> {
    const pageSize = Math.min(100, Math.max(1, Math.floor(options.pageSize ?? 20)));
    const requestedPage = Math.max(1, Math.floor(options.page ?? 1));
    const countParams: unknown[] = [];
    const countWhere = this.buildToolWhere(options, countParams);
    const countResult = await this.db.query<{ total: number }>(`
      SELECT COUNT(DISTINCT t.id)::int AS total
      FROM mcp_tools t JOIN mcp_servers s ON s.id = t.server_id
      ${countWhere.length ? `WHERE ${countWhere.join(' AND ')}` : ''}`, countParams);
    const total = countResult.rows[0]?.total ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const params: unknown[] = [];
    const where = this.buildToolWhere(options, params);
    params.push(pageSize, (page - 1) * pageSize);
    const result = await this.db.query<ToolRow & { tags: string[] }>(`
      SELECT t.*, COALESCE(array_agg(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL), ARRAY[]::text[]) AS tags
      FROM mcp_tools t JOIN mcp_servers s ON s.id = t.server_id
      LEFT JOIN mcp_tool_tags tt ON tt.tool_id = t.id LEFT JOIN mcp_tags tg ON tg.id = tt.tag_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      GROUP BY t.id ORDER BY t.exposed_name
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return { items: result.rows.map((row) => mapTool(row, row.tags ?? [])), total, page, pageSize, totalPages };
  }

  async getTool(serverId: string, upstreamName: string): Promise<ToolMetadata | null> {
    const result = await this.db.query<ToolRow & { tags: string[] }>(`
      SELECT t.*, COALESCE(array_agg(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL), ARRAY[]::text[]) AS tags
      FROM mcp_tools t LEFT JOIN mcp_tool_tags tt ON tt.tool_id=t.id LEFT JOIN mcp_tags tg ON tg.id=tt.tag_id
      WHERE t.server_id=$1 AND t.upstream_name=$2 GROUP BY t.id`, [serverId, upstreamName]);
    return result.rows[0] ? mapTool(result.rows[0], result.rows[0].tags ?? []) : null;
  }

  async syncTools(serverId: string, tools: McpTool[]): Promise<void> {
    await this.db.transaction(async (client) => {
      const names = tools.map((tool) => tool.name);
      await client.query('UPDATE mcp_tools SET orphaned = TRUE, updated_at = now() WHERE server_id = $1', [serverId]);
      for (const tool of tools) {
        const exposedName = `${serverId}.${tool.name}`;
        await client.query(`
          INSERT INTO mcp_tools (server_id, upstream_name, exposed_name, input_schema, upstream_description, orphaned, last_seen_at)
          VALUES ($1,$2,$3,$4::jsonb,$5,FALSE,now())
          ON CONFLICT (server_id, upstream_name) DO UPDATE SET
            exposed_name=EXCLUDED.exposed_name, input_schema=EXCLUDED.input_schema,
            upstream_description=EXCLUDED.upstream_description, orphaned=FALSE, last_seen_at=now(),
            version=CASE WHEN mcp_tools.exposed_name IS DISTINCT FROM EXCLUDED.exposed_name
              OR mcp_tools.input_schema IS DISTINCT FROM EXCLUDED.input_schema
              OR mcp_tools.upstream_description IS DISTINCT FROM EXCLUDED.upstream_description
              OR mcp_tools.orphaned IS DISTINCT FROM EXCLUDED.orphaned
              THEN mcp_tools.version + 1 ELSE mcp_tools.version END`, [
          serverId, tool.name, exposedName, JSON.stringify(tool.inputSchema ?? {}), tool.description ?? null
        ]);
      }
      if (names.length) await client.query('UPDATE mcp_tools SET orphaned = FALSE WHERE server_id = $1 AND upstream_name = ANY($2::text[])', [serverId, names]);
    });
  }

  async patchTool(serverId: string, upstreamName: string, patch: ToolPatch): Promise<ToolMetadata | null> {
    return this.db.transaction(async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      const add = (sql: string, value: unknown) => { values.push(value); fields.push(`${sql} = $${values.length}`); };
      if (patch.enabled !== undefined) add('enabled', patch.enabled);
      if (patch.displayName !== undefined) add('display_name', patch.displayName);
      if (patch.descriptionOverride !== undefined) add('description_override', patch.descriptionOverride);
      if (patch.timeoutMs !== undefined) add('timeout_ms', patch.timeoutMs);
      if (patch.concurrencyLimit !== undefined) add('concurrency_limit', patch.concurrencyLimit);
      if (!fields.length) return this.getTool(serverId, upstreamName);
      const current = await client.query<{ id: number; version: number }>('SELECT id, version FROM mcp_tools WHERE server_id=$1 AND upstream_name=$2 FOR UPDATE', [serverId, upstreamName]);
      if (!current.rows[0]) return null;
      if (patch.version !== undefined && current.rows[0].version !== patch.version) throw new Error('VERSION_CONFLICT');
      values.push(serverId, upstreamName);
      const result = await client.query<ToolRow>(`UPDATE mcp_tools SET ${fields.join(', ')}, version = version + 1 WHERE server_id = $${values.length - 1} AND upstream_name = $${values.length} RETURNING *`, values);
      if (!result.rows[0]) return null;
      const tags = await client.query<{ name: string }>('SELECT tg.name FROM mcp_tool_tags tt JOIN mcp_tags tg ON tg.id=tt.tag_id WHERE tt.tool_id=$1 ORDER BY tg.name', [result.rows[0].id]);
      return mapTool(result.rows[0], tags.rows.map((row) => row.name));
    });
  }

  async listTags(): Promise<Array<{ id: number; name: string; displayName: string | null; description: string | null; enabled: boolean }>> {
    const result = await this.db.query<{ id: number; name: string; display_name: string | null; description: string | null; enabled: boolean }>('SELECT * FROM mcp_tags ORDER BY name');
    return result.rows.map((row) => ({ id: row.id, name: row.name, displayName: row.display_name, description: row.description, enabled: row.enabled }));
  }

  async createTag(input: { name: string; displayName?: string; description?: string }): Promise<void> {
    await this.db.query('INSERT INTO mcp_tags(name, display_name, description) VALUES ($1,$2,$3)', [input.name, input.displayName ?? null, input.description ?? null]);
  }

  async updateTag(name: string, input: { displayName?: string | null; description?: string | null; enabled?: boolean }): Promise<void> {
    const fields: string[] = [];
    const values: unknown[] = [];
    const add = (field: string, value: unknown) => { values.push(value); fields.push(`${field}=$${values.length}`); };
    if (Object.prototype.hasOwnProperty.call(input, 'displayName')) add('display_name', input.displayName);
    if (Object.prototype.hasOwnProperty.call(input, 'description')) add('description', input.description);
    if (Object.prototype.hasOwnProperty.call(input, 'enabled')) add('enabled', input.enabled);
    if (!fields.length) return;
    values.push(name);
    await this.db.query(`UPDATE mcp_tags SET ${fields.join(', ')} WHERE name=$${values.length}`, values);
  }

  async deleteTag(name: string): Promise<void> { await this.db.query('DELETE FROM mcp_tags WHERE name = $1', [name]); }

  async setToolTags(serverId: string, upstreamName: string, names: string[]): Promise<void> {
    await this.db.transaction(async (client) => {
      const tool = await client.query<{ id: number }>('SELECT id FROM mcp_tools WHERE server_id=$1 AND upstream_name=$2 FOR UPDATE', [serverId, upstreamName]);
      if (!tool.rows[0]) throw new Error('TOOL_NOT_FOUND');
      await client.query('DELETE FROM mcp_tool_tags WHERE tool_id=$1', [tool.rows[0].id]);
      for (const name of [...new Set(names)]) {
        const tag = await client.query<{ id: number }>('SELECT id FROM mcp_tags WHERE name=$1', [name]);
        if (!tag.rows[0]) throw new Error(`TAG_NOT_FOUND:${name}`);
        await client.query('INSERT INTO mcp_tool_tags(tool_id, tag_id) VALUES ($1,$2)', [tool.rows[0].id, tag.rows[0].id]);
      }
    });
  }

  async appendAudit(actor: string | undefined, action: string, resourceType: string, resourceId: string | undefined, details: unknown = {}): Promise<void> {
    await this.db.query('INSERT INTO mcp_audit_logs(actor, action, resource_type, resource_id, details) VALUES ($1,$2,$3,$4,$5::jsonb)', [actor ?? null, action, resourceType, resourceId ?? null, JSON.stringify(details)]);
  }

  async appendRuntimeEvent(serverId: string, status: RuntimeStatus, error: string | undefined, details: unknown = {}): Promise<void> {
    await this.db.query('INSERT INTO mcp_runtime_events(server_id,status,error,details) VALUES ($1,$2,$3,$4::jsonb)', [serverId, status, error ?? null, JSON.stringify(details)]);
  }
}
