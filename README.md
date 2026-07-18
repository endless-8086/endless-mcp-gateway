# Endless MCP Gateway

[中文文档](README_CN.md)

Endless MCP Gateway aggregates `stdio`, `SSE`, and Streamable HTTP upstream MCP servers into one managed Streamable HTTP data plane. It provides an admin console, persistent PostgreSQL configuration, scoped MCP endpoints, and operational safeguards for long-running tool calls.

> **Runtime requirements:** Node.js 24+ and PostgreSQL 18+.

## What It Provides

- Connect multiple `stdio`, `sse`, and `streamable-http` upstream MCP servers.
- Run each stdio upstream as its own MCP SDK child process; upstreams do not share stdin, stdout, transport, or mutable request state.
- Aggregate `tools/list` and `tools/call` behind one Streamable HTTP endpoint.
- Expose the entire catalog, one server, or one tag through separate MCP URLs.
- Manage upstreams, health, refreshes, enablement, tool metadata, per-tool limits, and tags from a bilingual admin console.
- Apply timeout precedence predictably: **tool override -> server override -> Gateway default**.
- Persist configuration and audit data in PostgreSQL; propagate changes across instances with `LISTEN` / `NOTIFY`.
- Apply request-size, timeout, concurrency, stdio-command, and remote-host controls.

## Admin Console

Open `http://localhost:8080/` after the Gateway starts. The console supports Chinese and English, and stores only the admin token in the current browser's `localStorage`.

### Overview

The overview combines endpoint guidance, catalog metrics, and current upstream health.

![Gateway overview](docs/images/admin-overview-en.png)

### Upstream Servers

Create, edit, enable, disable, refresh, and inspect configured stdio, SSE, and Streamable HTTP servers.

![Upstream servers](docs/images/admin-servers-en.png)

### Tool Catalog

Search and filter the discovered tool catalog. Each tool can be enabled or disabled, and can override its display name, description, timeout, concurrency limit, and tags.

![Tool catalog](docs/images/admin-tools-en.png)

### Tag Manager

Create tags and associate them with tools. Existing tag identifiers are immutable; their display name and description can be edited safely.

![Tag manager](docs/images/admin-tags-en.png)

## Architecture

```text
MCP clients
  |  Streamable HTTP
  v
Gateway data plane (/mcp, /mcp/servers/:id, /mcp/tags/:tag)
  |  immutable catalog snapshots
  +--> stdio upstreams (isolated child processes)
  +--> SSE upstreams
  +--> Streamable HTTP upstreams

Admin console / Admin API --> PostgreSQL <-- LISTEN / NOTIFY --> Gateway instances
```

The control plane manages configuration and catalog metadata. The data plane serves downstream MCP clients and routes a tool invocation to the owning upstream connector.

## Quick Start

### 1. Install dependencies

```powershell
npm install
```

### 2. Start PostgreSQL

For local development, the included Compose service is the quickest option:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = 'postgres://mcp_gateway:mcp_gateway@localhost:5432/mcp_gateway'
```

### 3. Configure the Gateway

The application reads `config/gateway.json` by default. Copy the example, fill in your values, and keep the real file out of Git:

```powershell
Copy-Item config/gateway.example.json config/gateway.json
```

Alternatively, set configuration through process environment variables. Environment variables override JSON values, which is useful for containers and CI.

### 4. Migrate and run

```powershell
npm run db:migrate
npm run dev
```

The default address is `http://localhost:8080`.

For a production build:

```powershell
npm run build
npm start
```

## Configuration

`config/gateway.example.json` is the complete configuration reference. Set `MCP_GATEWAY_CONFIG` when the JSON file lives elsewhere.

```json
{
  "nodeEnv": "production",
  "http": { "host": "0.0.0.0", "port": 8080 },
  "database": {
    "url": "postgres://<user>:<password>@<host>:5432/mcp-gateway",
    "poolMax": 20,
    "connectionTimeoutMs": 5000
  },
  "security": {
    "adminToken": "replace-me",
    "mcpToken": "replace-me",
    "allowedStdioCommands": ["npx"],
    "allowedUpstreamHosts": ["mcp.example.com"],
    "allowPrivateUpstreams": false
  },
  "runtime": {
    "refreshIntervalMs": 60000,
    "defaultCallTimeoutMs": 1800000,
    "maxToolConcurrency": 8
  }
}
```

| Setting | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | local PostgreSQL example | PostgreSQL connection string |
| `ADMIN_TOKEN` | empty | Bearer token for the admin API; required in production |
| `MCP_TOKEN` | empty | Optional shared Bearer token for the MCP data plane |
| `TOOL_REFRESH_INTERVAL_MS` | `60000` | Upstream tool-catalog refresh interval |
| `DEFAULT_CALL_TIMEOUT_MS` | `1800000` | Gateway default tool-call timeout (30 minutes) |
| `MAX_TOOL_CONCURRENCY` | `8` | Default concurrent calls per upstream |
| `MAX_BODY_BYTES` | `1048576` | Maximum HTTP request body size |
| `ALLOWED_STDIO_COMMANDS` | empty | Comma-separated stdio executable allowlist |
| `ALLOWED_UPSTREAM_HOSTS` | empty | Comma-separated remote upstream hostname allowlist |
| `ALLOW_PRIVATE_UPSTREAMS` | `true` in development | Whether private remote addresses are allowed |

`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`, `DB_MAX_USES`, `MAX_UPSTREAM_RESTARTS`, and `UPSTREAM_RESTART_BACKOFF_MS` are also available as environment overrides.

## Authentication and Security Boundary

The Gateway has two independent shared-secret boundaries:

| Surface | Credential | Behavior |
| --- | --- | --- |
| Admin console and `/api/v1/*` | `ADMIN_TOKEN` | Protects configuration and operational APIs. The browser sends it as `Authorization: Bearer <ADMIN_TOKEN>`. |
| MCP data plane | `MCP_TOKEN` | When set, protects every `/mcp` endpoint with `Authorization: Bearer <MCP_TOKEN>`. When unset, the MCP data plane is open. |

`MCP_TOKEN` is currently a single shared token, not a client-identity or scoped authorization system. For production deployments, put the Gateway behind HTTPS and add network controls, secret management, and, where needed, an identity-aware proxy.

Never commit `config/gateway.json`, `.env`, real database URLs, or tokens.

## MCP Endpoints

Configure a Streamable HTTP-capable MCP client with one of these URLs:

| Scope | Endpoint | Result |
| --- | --- | --- |
| All enabled tools | `/mcp` | Aggregates every enabled upstream tool. |
| One upstream | `/mcp/servers/{serverId}` | Exposes tools from one server only. |
| One tag | `/mcp/tags/{tag}` | Exposes enabled tools associated with one tag. |

For example:

```text
http://localhost:8080/mcp
```

Tool names are stable and fully qualified:

```text
filesystem.read_file
github.search_issues
```

## Admin API

All admin routes require `Authorization: Bearer <ADMIN_TOKEN>` when `ADMIN_TOKEN` is configured. Health probes remain public.

| Area | Routes |
| --- | --- |
| Health | `GET /healthz`, `GET /readyz` |
| Servers | `GET, POST /api/v1/servers`; `GET, PUT, DELETE /api/v1/servers/{id}`; `POST /enable`, `/disable`, `/refresh`; `GET /health` |
| Tools | `GET /api/v1/tools`; `GET /api/v1/servers/{id}/tools`; `PUT /api/v1/servers/{id}/tools/{toolName}`; `PUT /api/v1/servers/{id}/tools/{toolName}/tags` |
| Tags | `GET, POST /api/v1/tags`; `PUT, DELETE /api/v1/tags/{name}` |
| Runtime | `GET /api/v1/runtime` |

The tool list supports server-side filters and paging:

```text
GET /api/v1/tools?paginate=true&page=1&pageSize=20&search=maps&serverId=gaode&tag=geo&includeDisabled=true
```

With `paginate=true`, the response is:

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

Without `paginate=true`, the API returns the tool array for compatibility.

## Upstream Runtime Semantics

- A stdio upstream is spawned through the official MCP SDK, never through a shell.
- Every upstream owns an independent client, transport, request sequence, and concurrency semaphore.
- Refreshes do not interrupt an active tool call; a periodic refresh is deferred while the upstream is busy.
- A server timeout overrides the Gateway default, and a tool timeout overrides the server timeout.
- Catalog discovery updates upstream metadata without invalidating operator tool settings.
- Failures are isolated to the affected upstream and surfaced through runtime health and logs.

## Development and Verification

```powershell
npm run lint
npm test
npm run build
```

The test suite covers transport isolation, concurrency, tool refresh behavior, timeout precedence, HTTP MCP initialization, pagination, catalog synchronization, and admin UI structural regressions.

## Production Checklist

- Use HTTPS, ideally terminated at a reverse proxy.
- Set `ADMIN_TOKEN`; set `MCP_TOKEN` whenever the data plane is not fully trusted.
- Restrict `ALLOWED_STDIO_COMMANDS` and `ALLOWED_UPSTREAM_HOSTS`.
- Disable `ALLOW_PRIVATE_UPSTREAMS` unless private network targets are intentional.
- Store credentials in a secret manager or deployment environment, never in the repository.
- Monitor application logs and PostgreSQL health; add metrics and tracing appropriate to the deployment.

---

[中文文档](README_CN.md)
