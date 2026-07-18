# Endless MCP Gateway

A gateway that aggregates stdio, SSE, and Streamable HTTP upstream MCP servers into a single Streamable HTTP MCP endpoint.

Core protocol support uses the official [`@modelcontextprotocol/sdk`](https://github.com/modelcontextprotocol/sdk), with PostgreSQL 18 for configuration and operational auditing.
> [中文文档](README_CN.md)


## Features

- Connect `stdio`, `sse`, and `streamable-http` MCP upstreams.
- Each stdio upstream runs as an independent child process via the MCP SDK — no shared stdin/stdout.
- Aggregate `tools/list` and `tools/call` across multiple upstreams.
- Per-tool enable/disable, display name, description override, timeout, and concurrency settings.
- Tag creation, editing, deletion, and tool-tag associations.
- Expose MCP endpoints filtered by server or tag.
- PostgreSQL 18 with transactions, optimistic locking, and `LISTEN/NOTIFY` for configuration sync.
- Upstream connection status, failure details, and admin operation audit trails.
- Request size limits, tool call timeouts, concurrency caps, and admin API authentication.

## Quick Start

Requires Node.js 24+ and PostgreSQL 18+.

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run dev
```

Default address: `http://localhost:8080`.

The app reads `config/gateway.json` by default. Copy `config/gateway.example.json` and adjust the database connection. Set `MCP_GATEWAY_CONFIG` to point to an alternative JSON file. Environment variables take precedence over JSON config — useful for containers and CI.

Open `http://localhost:8080/` for the admin console (Chinese UI). If `ADMIN_TOKEN` is set, enter it in the top-right corner and save; the token is only stored in the browser's `localStorage`.

If npm didn't create `.bin` links:

```bash
node node_modules/tsx/dist/cli.mjs src/main.ts
```

### PostgreSQL Docker

```bash
docker compose up -d postgres
export DATABASE_URL="postgres://mcp_gateway:mcp_gateway@localhost:5432/mcp_gateway"
npm run db:migrate
npm start
```

In production, store `DATABASE_URL`, `ADMIN_TOKEN`, and upstream secrets in a secret manager or environment variables — never commit `.env`.

Remote PostgreSQL example (do not commit real credentials):

```bash
export DATABASE_URL="postgres://<user>:<password>@192.168.99.101:5432/mcp-gateway"
npm run db:migrate
npm start
```

Example JSON config:

```json
{
  "database": {
    "url": "postgres://<user>:<password>@192.168.99.101:5432/mcp-gateway",
    "poolMax": 20,
    "connectionTimeoutMs": 5000
  },
  "http": { "host": "0.0.0.0", "port": 8080 },
  "security": {
    "adminToken": "change-me",
    "upgradeInsecureRequests": false
  }
}
```

The gateway serves the admin console over HTTP by default, so `upgradeInsecureRequests` is off. Only enable it behind a reverse proxy or when HTTPS is set up on the gateway itself.

## Admin API

All admin endpoints except `/healthz` and `/readyz` require:

```
Authorization: Bearer <ADMIN_TOKEN>
```

### Create a stdio Upstream

```bash
curl -X POST http://localhost:8080/api/v1/servers \
  -H "Authorization: Bearer change-me" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "filesystem",
    "name": "Filesystem MCP",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
    "enabled": true
  }'
```

### API Reference

```
GET    /api/v1/servers
POST   /api/v1/servers
PUT    /api/v1/servers/{id}
DELETE /api/v1/servers/{id}
POST   /api/v1/servers/{id}/enable
POST   /api/v1/servers/{id}/disable
POST   /api/v1/servers/{id}/refresh
GET    /api/v1/servers/{id}/health

GET    /api/v1/tools
PUT    /api/v1/servers/{id}/tools/{toolName}
PUT    /api/v1/servers/{id}/tools/{toolName}/tags

GET    /api/v1/tags
POST   /api/v1/tags
PUT    /api/v1/tags/{name}
DELETE /api/v1/tags/{name}
```

The tools list supports pagination and server-side filtering:

```
GET /api/v1/tools?paginate=true&page=1&pageSize=20&search=maps&serverId=1001&tag=geo&includeDisabled=true
```

Paginated response:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

Without `paginate=true`, the original array format is returned for backward compatibility.

Server and tool updates use `version`-based optimistic locking; mismatched versions return HTTP 409.

## MCP Endpoint

```
POST /mcp
POST /mcp/servers/{serverId}
POST /mcp/tags/{tag}
```

When `MCP_TOKEN` is set, the data plane requires:

```
Authorization: Bearer <MCP_TOKEN>
```

Tools use stable fully-qualified names, e.g.:

```
filesystem.read_file
github.search_issues
```

MCP clients can configure `http://localhost:8080/mcp` directly as a Streamable HTTP server. Tag-scoped endpoints only return tools matching the given tag that are also enabled.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | HTTP listen address |
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | local example | PostgreSQL 18 connection string |
| `ADMIN_TOKEN` | *empty* | Admin API Bearer token; **must be set in production** |
| `MCP_TOKEN` | *empty* | MCP data-plane Bearer token |
| `TOOL_REFRESH_INTERVAL_MS` | `60000` | Auto-refresh upstream tool lists |
| `DEFAULT_CALL_TIMEOUT_MS` | `30000` | Default tool call timeout |
| `MAX_TOOL_CONCURRENCY` | `8` | Default concurrency per upstream |
| `MAX_BODY_BYTES` | `1048576` | Maximum HTTP request body size |
| `ALLOWED_STDIO_COMMANDS` | *empty* | Comma-separated stdio executable allowlist |
| `ALLOWED_UPSTREAM_HOSTS` | *empty* | Remote upstream hostname allowlist |
| `ALLOW_PRIVATE_UPSTREAMS` | `true` (dev) | Disable in production to reduce SSRF risk |

## Process & Concurrency Safety

- stdio transports use the SDK's `StdioClientTransport` — no shell — with one independent child process per upstream.
- Each upstream holds its own MCP Client, Transport, request ID counter, and concurrency semaphore.
- Configuration changes are written inside PostgreSQL transactions and broadcast via `pg_notify` so all gateway instances refresh their in-memory snapshots.
- Tool calls read from an immutable directory snapshot; upstream Transports share no mutable state across requests.
- Upstream connection failures do not affect other upstreams; call errors are mapped to MCP JSON-RPC errors.

## Testing & Build

```bash
npx tsc -p tsconfig.json
npx tsx --test test/connector.test.ts test/gateway-http.test.ts
```

Tests cover: AsyncMutex serialization, Semaphore concurrency limits, stdio child-process MCP tool calls, Streamable HTTP MCP initialization, tool listing, and tool invocation.

The admin console serves static assets through a fixed-route allowlist (`/`, `/index.html`, `/styles.css`, `/app.js`) with no open directory mapping.

## Security

Production deployments should additionally enable at the reverse proxy or platform level: HTTPS, admin API IP allowlisting, remote URL SSRF allowlist, stdio command allowlist, a secret manager, Prometheus/OpenTelemetry, and finer-grained RBAC.

---

*[中文文档](README_CN.md)*
