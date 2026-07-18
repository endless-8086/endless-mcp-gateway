# Endless MCP Gateway

一个将 stdio、SSE 和 Streamable HTTP 上游 MCP 服务统一聚合并暴露为 Streamable HTTP MCP Endpoint 的网关。

核心协议能力使用官方 `@modelcontextprotocol/sdk`，配置和运行审计使用 PostgreSQL 18。

## 能力

- 接入 `stdio`、`sse`、`streamable-http` 三种 MCP 上游。
- 每个 stdio 上游由 MCP SDK 启动独立子进程，互不共享 stdin/stdout。
- 聚合多个上游的 `tools/list` 和 `tools/call`。
- 工具启用/停用、展示名称、描述覆盖、超时和并发数编辑。
- 标签创建、编辑、删除和工具标签关联。
- 按服务或标签暴露 MCP Endpoint。
- PostgreSQL 18 事务、乐观锁和 `LISTEN/NOTIFY` 配置同步。
- 上游连接状态、失败信息和管理操作审计。
- 请求大小、工具调用超时、并发上限和管理 API 鉴权。

## 快速启动

需要 Node.js 24+、PostgreSQL 18+。

```powershell
Copy-Item .env.example .env
npm install
npm run db:migrate
npm run dev
```

默认地址：`http://localhost:8080`。

应用默认读取 [config/gateway.json](D:/Work/WorkSpace/VS/endless-mcp-gateway/config/gateway.json)。可以先复制 [config/gateway.example.json](D:/Work/WorkSpace/VS/endless-mcp-gateway/config/gateway.example.json) 再修改数据库连接；`MCP_GATEWAY_CONFIG` 可以指定其他 JSON 配置文件。环境变量优先级高于 JSON 配置，适合容器和 CI 覆盖单项设置。

打开 `http://localhost:8080/` 即可进入中文管理控制台。控制台包含总览、上游服务、工具目录和标签管理四个视图；如果设置了 `ADMIN_TOKEN`，在右上角输入令牌后保存即可访问管理 API。令牌只保存在当前浏览器的 localStorage 中。

如果当前 npm 环境没有生成 `.bin` 链接，可以直接执行：

```powershell
node node_modules/tsx/dist/cli.mjs src/main.ts
```

### PostgreSQL Docker

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgres://mcp_gateway:mcp_gateway@localhost:5432/mcp_gateway"
npm run db:migrate
npm start
```

生产环境请将 `DATABASE_URL`、`ADMIN_TOKEN` 和上游密钥放在 Secret Manager 或环境变量中，不要提交 `.env`。

远程 PostgreSQL 连接示例（不要把真实密码写入仓库）：

```powershell
$env:DATABASE_URL = "postgres://<user>:<password>@192.168.99.101:5432/mcp-gateway"
npm run db:migrate
npm start
```

JSON 配置结构示例：

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

网关默认通过 HTTP 提供管理台，因此 `upgradeInsecureRequests` 默认关闭；只有在反向代理或网关本身已经启用 HTTPS 时才建议打开。

## 管理 API

除 `/healthz`、`/readyz` 外，管理 API 需要：

```text
Authorization: Bearer <ADMIN_TOKEN>
```

### 创建 stdio 上游

```powershell
Invoke-RestMethod http://localhost:8080/api/v1/servers `
  -Method Post `
  -Headers @{ Authorization = "Bearer change-me" } `
  -ContentType 'application/json' `
  -Body '{
    "id": "filesystem",
    "name": "Filesystem MCP",
    "type": "stdio",
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/data"],
    "enabled": true
  }'
```

### 主要管理接口

```text
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

工具目录支持分页和服务端筛选：

```text
GET /api/v1/tools?paginate=true&page=1&pageSize=20&search=maps&serverId=1001&tag=geo&includeDisabled=true
```

分页响应格式：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

不带 `paginate=true` 时仍返回原来的工具数组格式，兼容已有调用方。

服务和工具更新使用 `version` 乐观锁；版本不匹配时返回 HTTP 409。

## MCP Endpoint

```text
POST /mcp
POST /mcp/servers/{serverId}
POST /mcp/tags/{tag}
```

当设置了 `MCP_TOKEN` 时，数据面需要：

```text
Authorization: Bearer <MCP_TOKEN>
```

工具名称使用稳定的全限定名称，例如：

```text
filesystem.read_file
github.search_issues
```

MCP 客户端可以直接把 `http://localhost:8080/mcp` 配置为 Streamable HTTP Server。标签 Endpoint 只返回匹配标签且同时启用的工具。

## 配置说明

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | HTTP 监听地址 |
| `PORT` | `8080` | HTTP 监听端口 |
| `DATABASE_URL` | 本地示例 | PostgreSQL 18 连接串 |
| `ADMIN_TOKEN` | 空 | 管理 API Bearer Token；生产必须设置 |
| `MCP_TOKEN` | 空 | MCP 数据面 Bearer Token |
| `TOOL_REFRESH_INTERVAL_MS` | `60000` | 自动刷新上游工具列表 |
| `DEFAULT_CALL_TIMEOUT_MS` | `30000` | 默认工具调用超时 |
| `MAX_TOOL_CONCURRENCY` | `8` | 单上游默认并发数 |
| `MAX_BODY_BYTES` | `1048576` | HTTP 请求体上限 |
| `ALLOWED_STDIO_COMMANDS` | 空 | 逗号分隔的 stdio 可执行文件白名单 |
| `ALLOWED_UPSTREAM_HOSTS` | 空 | 远程上游 hostname 白名单 |
| `ALLOW_PRIVATE_UPSTREAMS` | 开发环境为 `true` | 生产建议关闭以降低 SSRF 风险 |

## 进程与并发安全

- stdio 使用 SDK 的 `StdioClientTransport`，不经过 shell，并为每个上游维护独立子进程。
- 每个上游拥有独立 MCP Client、Transport、请求 ID 和并发信号量。
- 配置变更通过 PostgreSQL 事务写入，提交后使用 `pg_notify` 通知所有网关实例刷新内存快照。
- 工具调用只读不可变目录快照；上游 Transport 不在请求之间共享可变状态。
- 上游连接失败不会影响其他上游；调用错误会映射为 MCP JSON-RPC 错误。

## 测试与构建

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.json
node node_modules/tsx/dist/cli.mjs --test test/connector.test.ts test/gateway-http.test.ts
```

测试覆盖：AsyncMutex 串行化、Semaphore 并发限制、stdio 子进程 MCP 工具调用、Streamable HTTP MCP 初始化、工具列表和工具调用。

管理台静态资源使用固定白名单路由 `/`、`/index.html`、`/styles.css` 和 `/app.js`，没有开启任意文件目录映射。

## 安全建议

生产部署还应在反向代理或平台层补充：HTTPS、管理 API IP 白名单、远程 URL SSRF allowlist、stdio 命令 allowlist、Secret Manager、Prometheus/OpenTelemetry 和更细粒度 RBAC。
