# XG Canvas Architecture

本文配合 [overview.md](./overview.md) 阅读，描述当前实现口径。

## 1. 服务拓扑

M6 之后项目是模块化单体：

```text
canvas-web (5180, React + /settings)
        |
        | REST /api/v1/* and /api/v1/admin/*
        v
canvas-api (5181, NestJS)
  - business: project/canvas/task/asset/preset/chat/billing/request-log
  - account subsystem: src/account/*
  - Dreamina CLI runner: src/account/dreamina/*
        |
        +-- HTTP vendor APIs
        +-- Dreamina CLI child process
        +-- remote S3/R2 bucket
        +-- PostgreSQL schemas: account, canvas, ops
        +-- Redis keys prefixed with xgcanvas:
```

`account-api` 已并入 `canvas-api/src/account`，`account-admin` 已并入 `canvas-web /settings`。旧 `account-cli-bridge` 不再存在；即梦 CLI 由 `DreaminaCliRunner` 在 server 内直接 spawn，Docker 镜像内置 CLI 二进制，并通过 volume 持久化登录态。

认证使用服务端 opaque session；旧 JWT 宽限兼容已移除，不再需要 JWT 环境密钥。
浏览器会话与 OAuth state Cookie 使用 `HttpOnly + SameSite=Lax`；`Secure` 按 canvas-web
对外请求的实际协议决定，从而同时支持可信局域网 HTTP 初次部署与 HTTPS 反向代理。

## 2. 端口

| 服务          |          正式部署 |          开发编排 |
| ------------- | ----------------: | ----------------: |
| canvas-web    |     宿主机 `5180` | 宿主机回环 `5180` |
| canvas-api    | 仅编排网络 `5181` | 宿主机回环 `5181` |
| PostgreSQL 18 | 仅编排网络 `5432` | 宿主机回环 `5433` |
| Redis 8       | 仅编排网络 `6379` | 宿主机回环 `6381` |

对象存储使用远程 S3/R2 兼容桶，不再由 compose 启动本地对象存储服务。

## 3. 模块边界

| 边界                         | 必须                                                                        |
| ---------------------------- | --------------------------------------------------------------------------- |
| canvas 业务模块调用模型/厂商 | 经过 `account-client` seam（`AccountInvokeClient` / `AccountModelsClient`） |
| account adapter 调即梦 CLI   | 经过 Nest DI 注入的 `DreaminaCliRunner`                                     |
| adapter 返回第三方资产       | 必须经 `AssetDownloaderService` 下载到我们的 S3/R2 桶                       |
| Redis                        | 必须经 `RedisModule`，全局 key 前缀 `xgcanvas:`                             |

`src/account/*` 是模块边界内部实现。业务模块不要越过 `account-client` 直接 import account 内部服务。

## 4. 数据库

同一 PostgreSQL 实例中使用三个 schema：

### account

- `providers`
- `channels`
- `credentials`
- `model_definitions`
- `model_channel_mappings`
- `encryption_keys`
- `feature_model_configs`
- `system_settings`（对象存储等运行期集成配置；Secret 加密存储）
- `instance_setup`（首次部署状态；完成后不可逆，不保存初始化口令）

模型注册表为双源：

- `source=preset`：由 `config/model-providers/*.yaml` 同步，reload 会刷新。
- `source=manual`：后台新增或厂商 `/models` 导入，reload 不覆盖。

`model_definitions.input_contract` 声明生成模型支持的 `mode` 与素材 `slot`。YAML、后台写入与 DB 读取均经过同一套运行时结构校验，非法历史行不会进入注册表或公开模型列表；空对象表示未声明契约。它只约束输入形态，不参与“可用模型”判断。

“可用模型”的统一定义：模型和 provider 已启用，且该 provider 下存在启用的 channel 与启用的 credential。不要求 credential 已验证或未过期；验证状态只作为运营提示。

### canvas

核心表包括：

- `users`, `workspaces`, `workspace_members`
- `projects`, `canvases`, `canvas_nodes`, `canvas_edges`, `canvas_snapshots`
- `tasks`, `assets`, `prompt_presets`, `entities`
- `library_entries`, `favorites`
- `conversations`, `messages`
- auth / RBAC 相关表

`canvas.library_entries` 是统一资源库(人物库/音色库/风格库),用判别式 `kind` 区分类型,
双绑定形态共存:`material`(我们桶里的自有素材 asset_ids)与 `provider_refs[]`(厂商侧资源,
如训练音色 id / 授权人像 id)。Provider binding 是 credential-scoped server state，至少携带
`binding_id/provider/channel_id/credential_id/status`；只有精确候选凭证下的 `ready` 记录可调用，
legacy JSON fail closed。普通 Library API 会脱敏并隐藏凭证路由/验证参数。可见性与 `assets` 一致
(`private | project | workspace`)。
剧本角色实体 `canvas.entities` 通过 `library_entry_id` **引用**库条目(叙事对象与可复用资源解耦,
不合表):entities 仍是项目内叙事对象,库条目可跨项目复用。`canvas.favorites(user_id,
target_type, target_id)` 是通用收藏表,覆盖 asset / library_entry / entity。生成引用库条目时,
任务执行器在 invoke 前验证 workspace/project scope，把条目展开为素材 URL 引用 + 仅含已验证
server binding 的 `metadata.library.provider_refs`,详见
[adapter-guide.md](./adapter-guide.md) §5.1。

`canvas.tasks.status` 统一为：

```text
pending | queued | running | succeeded | failed | cancelled
```

### ops

- `request_logs`

请求日志记录 request-id、provider/model/channel/credential 维度、脱敏请求/响应、错误信息、用量与冻结成本。

## 5. Redis 命名空间

全局 keyPrefix 为 `xgcanvas:`。

| 用途              | key                                           |
| ----------------- | --------------------------------------------- |
| registry revision | `xgcanvas:cache:registry:v1`                  |
| session liveness  | `xgcanvas:session:<token_sha256_hex>`         |
| revoked session   | `xgcanvas:session:revoked:<token_sha256_hex>` |
| authz cache       | `xgcanvas:authz:caps:*`                       |
| task progress     | `xgcanvas:task:progress:<task_id>`            |
| rate limit        | `xgcanvas:ratelimit:<channel_id>:<window>`    |

## 6. 资产存储

使用远程 S3/R2 兼容桶。管理员在 `/settings/object-storage` 配置 endpoint、
region、bucket 与访问密钥；Secret 由实例根密钥加密后写入 `account.system_settings`。
没有显式提供 `ENCRYPTION_KEY_V*` 时，canvas-api 会在首次启动时生成 `v1` 根密钥并写入
持久化数据目录；Docker 编排将该目录挂载到独立 volume。根密钥不进入数据库，也不会写入
日志。未配置对象存储不会阻止服务启动，但上传、生成资产和签名 URL 会返回明确的未配置
错误。保存配置后运行期客户端立即刷新。

自动生成模式适合单实例部署。部署者必须将根密钥 volume 与 PostgreSQL 一起备份；丢失根密钥
后，数据库中已加密的 Provider 与对象存储 Secret 无法恢复。已有部署仍可通过
`ENCRYPTION_KEY_V1...Vn` 与 `ENCRYPTION_KEY_CURRENT` 显式管理密钥和轮转。

后端统一通过 `ObjectStorageClient` 访问对象存储，不从 `S3_*` 环境变量读取配置。

资产生命周期（生成产物）：

1. Adapter 获得第三方临时 URL。
2. `AssetDownloaderService` 下载，限制大小并计算 sha256。
3. 上传到远程 S3/R2 bucket。
4. canvas-api 持久化 `canvas.assets`。
5. 前端只通过 `GET /api/v1/assets/:id/url`（或 `POST /assets/urls` 批量）拿我们的 presigned URL。

资产生命周期（用户上传）：预签名直传两段式。`POST /assets/upload-intent` 由服务端生成
storage_key 并签发 PUT URL，客户端直传对象与客户端生成的缩略图，`POST /assets/uploads/:draftId/complete`
经 `HeadObject` 核验后落库。缩略图属于 best-effort 派生物：探测、抽帧或缩略图 PUT 失败时，
客户端必须以 `has_thumbnail=false` 完成源对象，不得让可用源文件随缩略图一起失败。浏览器直传
要求对象存储桶配置 CORS：允许前端 Origin（开发态为
`http://localhost:5180`）、Methods `GET/PUT/HEAD`、Headers `Content-Type`。预签名 PUT 禁用
AWS SDK 灵活校验和（`requestChecksumCalculation=WHEN_REQUIRED`），避免多余 checksum 头触发预检失败。

资产可见性与隔离：`visibility = private | project | workspace` 三态，独立于存储归属
`scope`。`private` 仅 owner；`project` 要求在该项目持有 `project.asset.view`（RBAC project
binding）；`workspace` 对工作区成员可见。桶保持私有读写，任何预签名 URL 都在可见性判定
通过后才签发；列表查询按“自己的 ∪ workspace 可见 ∪ 有权限项目的 project 可见”过滤。

## 7. Dreamina CLI

即梦 CLI 合并进 server：

- Docker 镜像包含 `/usr/local/bin/dreamina`。
- 本地开发可用 `DREAMINA_CLI_PATH` 指向本机二进制。
- Docker volume 持久化：
  - `/root/.dreamina_cli`
  - `/root/.local/share/dreamina`

登录态由 CLI 本地持久化，adapter 只通过 `DreaminaCliRunner` 使用 CLI。

## 8. API 面

外部业务 API：

- `/api/v1/*`
- `/api/v1/models`
- `/api/v1/assets/*`
- `/api/v1/tasks/*`

后台设置 API：

- `/api/v1/admin/*`

account 子系统调用为进程内 service 调用，不再暴露 `/internal/v1/*` HTTP 路由。

## 9. 身份验证码与邮件发送

### 首次初始化

空实例启动后直接进入 `/setup`，不依赖 `SETUP_TOKEN`。首位部署者在页面中创建邮箱＋密码
管理员；用户、个人 Workspace、`it_super_admin` system binding、
`is_instance_owner=true` 与 `completed_at` 必须在同一事务中写入。PostgreSQL advisory lock
与行锁保证并发请求中只有一个能成功成为 instance owner。

实例未完成初始化时，除健康检查和 Setup API 外，业务 API、普通注册与登录均不可用。
无 Token 模式以“部署者先完成初始化、再开放公网入口”为安全边界；不能保证尚未初始化且已暴露
到不可信网络的实例不被抢先认领。初始化完成后 `completed_at` 成为不可逆事实，Setup API
永久关闭；已有 Owner/超管的旧实例会被自动标记为已初始化，不会重新开放 Setup。管理员可在
个人中心绑定微信、飞书等其他身份，本地密码身份保留为 break-glass 登录方式。

旧库若已有用户但没有活动 Owner/超管，服务必须 fail-closed 并提示运维通过
`recover:instance-owner` 离线指定一个已存在账号；不得退回匿名“首个请求认领”。

`/api/v1/auth/email/code`、`/api/v1/me/identities/bind/email/code` 和
`/api/v1/me/account/confirm-code` 共用 `VerificationService`。验证码只以
`sha256` 写入 `canvas.verification_challenges`，默认 10 分钟过期、最多尝试 5 次。

配置 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` 和
`MAIL_FROM` 后，邮箱验证码与 magic-link 会通过 SMTP 真实发送。未配置 SMTP 时，
非 production 仍会在接口响应中返回 `devCode` / `devToken` 并写日志，方便本地测试。
production 环境不应依赖 dev reveal，必须配置真实邮件通道后再开启邮箱验证码登录。
开发环境若要强制验证真实投递，可设置 `EMAIL_DELIVERY_REQUIRED=true`。

`/settings/mail` 已提供写入 `account.system_settings`、加密保存与连通测试能力，并用于实例
readiness；当前 `EmailSenderService` 仍从上述环境变量读取真实发信配置。统一切换到后台配置、
保留环境变量兼容回退属于公开 Beta 前的待办，见根目录 `TODO.md`。

`PUBLIC_BASE_URL` 用于生成 magic-link 链接，通常指向 `canvas-web` 对外访问地址。
密码注册登录不依赖它；只有启用 Magic Link、微信或飞书 OAuth 时才必须配置。未配置时
外部链接与 OAuth provider 不对 Web 宣称可用，禁止回退到部署者电脑的 `localhost`。

## 10. 部署

`docker-compose.yml` 是零配置生产部署文件，从公开 CNB 制品库拉取 `canvas-web`、
`canvas-api` 的 `latest` 镜像，并使用 Docker Hub 官方 PostgreSQL 18、Redis 8 镜像集成数据库
与缓存迁移。无需 `.env`；
宿主机只暴露 Web 端口，内部数据库账号只用于隔离的 Compose 网络。应用镜像保留
`pull_policy: always`，确保重新部署会拉取最新制品。对象存储仍使用管理员在后台配置的
远程 S3/R2 兼容桶。

PostgreSQL 18 数据卷挂载在 `/var/lib/postgresql`。旧 PostgreSQL 16 volume 不能直接挂给
PostgreSQL 18；已有部署升级时必须先备份，再通过 dump/restore 迁移。

`docker-compose.dev.yml` 是可独立启动的本地开发栈，包含 PostgreSQL 18、Redis 8、源码热加载的
canvas-api 与 canvas-web，不创建 `.env` 也能启动。两个编排都为自动生成的根密钥挂载独立
持久卷。
