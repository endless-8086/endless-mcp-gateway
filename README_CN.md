# Endless MCP Gateway

[English README](README.md)

Endless MCP Gateway 将 `stdio`、`SSE` 与 Streamable HTTP 上游 MCP 服务聚合为统一、可管理的 Streamable HTTP 数据面，提供管理台、PostgreSQL 持久化配置、按范围暴露的 MCP Endpoint，以及面向长时间工具调用的运行保护。

> **运行要求：** Node.js 24+、PostgreSQL 18+。

## 核心能力

- 接入多个 `stdio`、`sse`、`streamable-http` 上游 MCP 服务。
- 每个 stdio 上游由 MCP SDK 独立启动子进程，不共享 stdin、stdout、Transport 或请求可变状态。
- 将多个上游的 `tools/list` 与 `tools/call` 聚合为一个 Streamable HTTP MCP Endpoint。
- 分别暴露全部工具、指定上游服务或指定标签下的工具。
- 在中英文管理台中管理上游、健康状态、刷新、启停、工具元数据、单工具限制与标签。
- 清晰的超时优先级：**工具级覆盖 -> 服务级覆盖 -> Gateway 默认值**。
- 使用 PostgreSQL 保存配置和审计数据，并通过 `LISTEN` / `NOTIFY` 同步多实例内存状态。
- 提供请求体、超时、并发、stdio 命令与远程主机等安全控制。

## 管理台

启动后访问 `http://localhost:8080/`。管理台支持中英文；管理员令牌仅保存在当前浏览器的 `localStorage` 中。

### 总览

总览集中展示接入端点、工具目录指标和上游运行状态。

![Gateway 总览](docs/images/admin-overview-en.png)

### 上游服务

可以创建、编辑、启用、停用、刷新并查看 stdio、SSE、Streamable HTTP 上游的健康状态。

![上游服务](docs/images/admin-servers-en.png)

### 工具目录

支持搜索、分页和按标签、服务筛选。每个工具都可启用/停用，并编辑展示名称、描述覆盖、调用超时、并发上限和标签。

![工具目录](docs/images/admin-tools-en.png)

### 标签管理

可以创建标签并将其分配给工具。既有标签的标识名称不可修改，但展示名称和描述可安全编辑。

![标签管理](docs/images/admin-tags-en.png)

## 架构

```text
MCP 接入端
  |  Streamable HTTP
  v
Gateway 数据面（/mcp、/mcp/servers/:id、/mcp/tags/:tag）
  |  不可变工具目录快照
  +--> stdio 上游（独立子进程）
  +--> SSE 上游
  +--> Streamable HTTP 上游

管理台 / 管理 API --> PostgreSQL <-- LISTEN / NOTIFY --> Gateway 实例
```

控制面负责配置和目录元数据；数据面服务下游 MCP 客户端，并将工具调用路由到对应的上游连接器。

## 快速启动

### 1. 安装依赖

```powershell
npm install
```

### 2. 启动 PostgreSQL

本地开发可直接使用项目附带的 Compose 服务：

```powershell
docker compose up -d postgres
$env:DATABASE_URL = 'postgres://mcp_gateway:mcp_gateway@localhost:5432/mcp_gateway'
```

### 3. 配置 Gateway

程序默认读取 `config/gateway.json`。复制示例后填入实际配置；真实配置文件已被 Git 忽略：

```powershell
Copy-Item config/gateway.example.json config/gateway.json
```

也可以通过进程环境变量提供配置。环境变量优先于 JSON，适合容器、systemd 和 CI 按部署环境覆盖单项设置。

### 4. 执行迁移并启动

```powershell
npm run db:migrate
npm run dev
```

默认访问地址为 `http://localhost:8080`。

生产构建：

```powershell
npm run build
npm start
```

## 配置

完整字段见 `config/gateway.example.json`。如果 JSON 配置放在其他位置，可通过 `MCP_GATEWAY_CONFIG` 指定文件路径。

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

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` | 本地 PostgreSQL 示例 | PostgreSQL 连接串 |
| `ADMIN_TOKEN` | 空 | 管理 API 的 Bearer Token；生产环境必须设置 |
| `MCP_TOKEN` | 空 | MCP 数据面的可选共享 Bearer Token |
| `TOOL_REFRESH_INTERVAL_MS` | `60000` | 上游工具目录刷新间隔 |
| `DEFAULT_CALL_TIMEOUT_MS` | `1800000` | Gateway 默认工具调用超时，30 分钟 |
| `MAX_TOOL_CONCURRENCY` | `8` | 每个上游的默认并发调用数 |
| `MAX_BODY_BYTES` | `1048576` | HTTP 请求体最大字节数 |
| `ALLOWED_STDIO_COMMANDS` | 空 | 逗号分隔的 stdio 可执行文件白名单 |
| `ALLOWED_UPSTREAM_HOSTS` | 空 | 逗号分隔的远程上游主机名白名单 |
| `ALLOW_PRIVATE_UPSTREAMS` | 开发环境为 `true` | 是否允许私网远程地址 |

`DB_POOL_MAX`、`DB_IDLE_TIMEOUT_MS`、`DB_CONNECTION_TIMEOUT_MS`、`DB_MAX_USES`、`MAX_UPSTREAM_RESTARTS`、`UPSTREAM_RESTART_BACKOFF_MS` 也可作为环境变量覆盖。

## 鉴权与安全边界

Gateway 有两个独立的共享密钥边界：

| 范围 | 凭据 | 行为 |
| --- | --- | --- |
| 管理台与 `/api/v1/*` | `ADMIN_TOKEN` | 保护配置和运维 API。浏览器以 `Authorization: Bearer <ADMIN_TOKEN>` 发送。 |
| MCP 数据面 | `MCP_TOKEN` | 配置后保护所有 `/mcp` Endpoint，使用 `Authorization: Bearer <MCP_TOKEN>`；未配置时数据面开放。 |

`MCP_TOKEN` 当前是单一共享 Token，不是客户端身份识别或范围授权体系。生产部署应使用 HTTPS，并按需在前方部署带身份识别能力的代理、网络访问控制和 Secret Manager。

不要提交 `config/gateway.json`、`.env`、真实数据库连接串或令牌。

## MCP Endpoint

在支持 Streamable HTTP 的 MCP 客户端中配置以下 URL 之一：

| 作用域 | Endpoint | 结果 |
| --- | --- | --- |
| 所有已启用工具 | `/mcp` | 聚合全部上游已启用工具。 |
| 指定上游 | `/mcp/servers/{serverId}` | 仅暴露一个服务的工具。 |
| 指定标签 | `/mcp/tags/{tag}` | 仅暴露关联该标签且已启用的工具。 |

示例：

```text
http://localhost:8080/mcp
```

工具名称使用稳定的全限定名：

```text
filesystem.read_file
github.search_issues
```

## 管理 API

设置 `ADMIN_TOKEN` 后，所有管理接口都需要 `Authorization: Bearer <ADMIN_TOKEN>`；健康检查保持公开。

| 分类 | 接口 |
| --- | --- |
| 健康检查 | `GET /healthz`、`GET /readyz` |
| 服务 | `GET, POST /api/v1/servers`；`GET, PUT, DELETE /api/v1/servers/{id}`；`POST /enable`、`/disable`、`/refresh`；`GET /health` |
| 工具 | `GET /api/v1/tools`；`GET /api/v1/servers/{id}/tools`；`PUT /api/v1/servers/{id}/tools/{toolName}`；`PUT /api/v1/servers/{id}/tools/{toolName}/tags` |
| 标签 | `GET, POST /api/v1/tags`；`PUT, DELETE /api/v1/tags/{name}` |
| 运行状态 | `GET /api/v1/runtime` |

工具目录支持服务端筛选和分页：

```text
GET /api/v1/tools?paginate=true&page=1&pageSize=20&search=maps&serverId=gaode&tag=geo&includeDisabled=true
```

当 `paginate=true` 时，响应格式为：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20,
  "totalPages": 1
}
```

不带 `paginate=true` 时，为兼容已有调用方，接口返回工具数组。

## 上游运行语义

- stdio 上游通过官方 MCP SDK 启动，不经过 shell。
- 每个上游独立拥有 Client、Transport、请求序列与并发 Semaphore。
- 刷新不会中断执行中的工具调用；周期刷新遇到忙碌上游会延后。
- 服务级超时覆盖 Gateway 默认值，工具级超时覆盖服务级超时。
- 工具目录发现会更新上游元数据，但不会使运维人员的工具配置失效。
- 上游失败仅影响自身，运行状态和日志会记录失败原因。

## 开发与验证

```powershell
npm run lint
npm test
npm run build
```

测试覆盖 Transport 隔离、并发、工具刷新行为、超时优先级、HTTP MCP 初始化、分页、目录同步与管理台结构回归。

## 生产检查清单

- 使用 HTTPS，建议在反向代理终止 TLS。
- 设置 `ADMIN_TOKEN`；数据面不完全可信时也设置 `MCP_TOKEN`。
- 限制 `ALLOWED_STDIO_COMMANDS` 与 `ALLOWED_UPSTREAM_HOSTS`。
- 除非明确需要私网目标，否则关闭 `ALLOW_PRIVATE_UPSTREAMS`。
- 凭据放在部署环境或 Secret Manager 中，不进入仓库。
- 监控应用日志与 PostgreSQL 健康状态，并根据部署接入指标和链路追踪。

---

[English README](README.md)
