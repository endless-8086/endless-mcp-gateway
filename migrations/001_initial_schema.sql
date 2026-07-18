CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('stdio', 'streamable-http', 'sse')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  command TEXT,
  args JSONB NOT NULL DEFAULT '[]'::jsonb,
  cwd TEXT,
  env JSONB NOT NULL DEFAULT '{}'::jsonb,
  url TEXT,
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'STOPPED',
  last_error TEXT,
  last_connected_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mcp_servers_connection_fields CHECK (
    (type = 'stdio' AND command IS NOT NULL AND url IS NULL)
    OR (type IN ('streamable-http', 'sse') AND url IS NOT NULL AND command IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id BIGSERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  upstream_name TEXT NOT NULL,
  exposed_name TEXT NOT NULL,
  input_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  upstream_description TEXT,
  description_override TEXT,
  display_name TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  orphaned BOOLEAN NOT NULL DEFAULT FALSE,
  timeout_ms INTEGER,
  concurrency_limit INTEGER,
  last_seen_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(server_id, upstream_name),
  UNIQUE(exposed_name),
  CHECK (timeout_ms IS NULL OR timeout_ms BETWEEN 100 AND 3600000),
  CHECK (concurrency_limit IS NULL OR concurrency_limit BETWEEN 1 AND 1000)
);

CREATE TABLE IF NOT EXISTS mcp_tags (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tool_tags (
  tool_id BIGINT NOT NULL REFERENCES mcp_tools(id) ON DELETE CASCADE,
  tag_id BIGINT NOT NULL REFERENCES mcp_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tool_id, tag_id)
);

CREATE TABLE IF NOT EXISTS mcp_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_runtime_events (
  id BIGSERIAL PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES mcp_servers(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_servers_enabled_type ON mcp_servers(enabled, type);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_server_enabled ON mcp_tools(server_id, enabled);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_seen ON mcp_tools(last_seen_at);
CREATE INDEX IF NOT EXISTS idx_mcp_tool_tags_tag_tool ON mcp_tool_tags(tag_id, tool_id);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON mcp_audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_mcp_runtime_server_created ON mcp_runtime_events(server_id, created_at);

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS mcp_servers_updated_at ON mcp_servers;
CREATE TRIGGER mcp_servers_updated_at BEFORE UPDATE ON mcp_servers
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS mcp_tools_updated_at ON mcp_tools;
CREATE TRIGGER mcp_tools_updated_at BEFORE UPDATE ON mcp_tools
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
DROP TRIGGER IF EXISTS mcp_tags_updated_at ON mcp_tags;
CREATE TRIGGER mcp_tags_updated_at BEFORE UPDATE ON mcp_tags
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
