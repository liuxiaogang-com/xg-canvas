# XG Canvas API Conventions

## 1. URL

- 全部小写，kebab-case。
- 业务 API：`/api/v1/*`
- 后台设置 API：`/api/v1/admin/*`
- 模型列表：`/api/v1/models`

account 子系统在 `canvas-api` 进程内调用，不再暴露 `/internal/v1/*` HTTP API。

## 2. HTTP 动词

| 动作     | 方法                                 |
| -------- | ------------------------------------ |
| 列表     | `GET /resources?page=&page_size=&q=` |
| 详情     | `GET /resources/:id`                 |
| 创建     | `POST /resources`                    |
| 全量更新 | `PUT /resources/:id`                 |
| 局部更新 | `PATCH /resources/:id`               |
| 删除     | `DELETE /resources/:id`              |
| 动作     | `POST /resources/:id/<verb>`         |

## 3. 响应

成功：

```json
{ "data": {}, "meta": {} }
```

错误：

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": {} } }
```

## 4. 鉴权

| 通道                                 | 凭据                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------- |
| canvas-web -> canvas-api             | opaque session cookie `xgcanvas_session` 或 `Authorization: Bearer <token>` |
| canvas-web `/settings` -> admin API  | 同一 session + RBAC capability                                              |
| canvas business -> account subsystem | `account-client` 进程内调用                                                 |
| account adapter -> Dreamina CLI      | `DreaminaCliRunner` 进程内 spawn                                            |

旧 `X-Internal-Token` / `account-cli-bridge` 链路已删除。

`xgcanvas_session` 与 OAuth state Cookie 始终使用 `HttpOnly + SameSite=Lax + Path=/`。
`Secure` 必须跟随浏览器访问 canvas-web 的实际协议：局域网明文 HTTP 不设置，HTTPS 直连或
经反向代理转发 `X-Forwarded-Proto: https` 时设置。不能用 `NODE_ENV=production` 推断传输协议。
`POST /auth/refresh` 在服务端与浏览器 Cookie 中续同一份 `SESSION_TTL_DAYS`，Web 在进入
受保护路由时主动续期；业务级 `INVALID_CODE` 等 401/400 不触发重放或清空登录态。

## 5. 资源端点

### Auth

```text
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/logout
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
GET    /api/v1/auth/config
POST   /api/v1/auth/email/code
POST   /api/v1/auth/email/login
POST   /api/v1/auth/email/magic
GET    /api/v1/auth/magic
POST   /api/v1/auth/phone/code
POST   /api/v1/auth/phone/login
GET    /api/v1/auth/oauth/:key/start
GET    /api/v1/auth/oauth/:key/callback
```

密码方式启用时，canvas-web 同时提供明确的登录与注册模式；密码注册要求邮箱、显示名和至少
12 位密码，成功后立即签发与登录相同的 opaque session，不要求重启服务。

### Instance Setup

```text
GET    /api/v1/setup/status
POST   /api/v1/setup/complete
```

当实例尚无 `is_instance_owner` / `it_super_admin` 时进入 `setup_required`：除 `/health` 与
上述 Setup API 外，其余 API 返回 `503 SETUP_REQUIRED`。`setup/complete` 只接收本地邮箱、
密码与显示名，不依赖部署 Token；它在同一数据库事务中创建用户、Workspace、超级管理员
绑定并写入不可逆的初始化完成状态，成功后直接签发 opaque session。并发请求通过 PostgreSQL
advisory lock 串行化，只能产生一个 instance owner；输掉并发竞争的请求返回
`409 SETUP_ALREADY_COMPLETED`。

尚未初始化的实例不应先暴露到不可信公网。初始化完成后 Setup API 永久关闭；迁移前已经存在
Owner/超管的实例只会被收编为已初始化，不会重新开放首次注册。

### Projects / Canvas

```text
GET    /api/v1/workspaces
POST   /api/v1/workspaces
GET    /api/v1/workspaces/:id/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id
DELETE /api/v1/projects/:id
GET    /api/v1/canvases/:id
PATCH  /api/v1/canvases/:id
```

`PATCH /api/v1/projects/:id` 是项目元信息更新入口,重命名项目时提交 `{ "name": "..." }`,并可继续承载 `description`、`cover_url`、`is_favorite`、`archived` 等轻量字段更新。

### Tasks

```text
POST   /api/v1/tasks
GET    /api/v1/tasks?status=&project_id=&standalone=&active=&before=&limit=
GET    /api/v1/tasks/:id
POST   /api/v1/tasks/:id/cancel
POST   /api/v1/tasks/:id/retry
```

`standalone=true` 只返回 `project_id IS NULL` 的任务,用于快速生成页的全局 feed;不得与
`project_id` 同时使用。`active=true` 只返回 `pending/queued/running` 且没有被同源节点更新任务
取代的记录，不能与 `status` 同时使用；画布 hydrate 用它恢复轮询。列表接口用于初次加载和分页,
进行中的任务进度应轮询 `GET /api/v1/tasks/:id`,不要反复拉取整页列表。

`POST /tasks` 的 `inputs` 是公开、标识符优先的契约，只接受
`mode/prompt/prompt_doc/negative_prompt/references/audio_url/json`。`references[]` 最多 32 条，
每条必须且只能提供 `asset_id` 或 `library_entry_id`；不得提交 URL、本地路径、mime type 或服务端
metadata。`audio_url` 为兼容字段名，但公开值同样必须是 asset UUID。带 `source_node_id` 时必须同时
提供同工作区的 `project_id`，且调用者需有 `project.canvas.node.edit`。

取消、重试和 runner 回写都由服务端租约/CAS 保护；客户端不应把一次取消或重试解释为可以复用旧
`external_task_id`。终态任务不会再被迟到的 worker 覆盖。

### Library

```text
GET    /api/v1/library?kind=&project_id=&q=&favorited=&before=&limit=
GET    /api/v1/library/:id
POST   /api/v1/library
PATCH  /api/v1/library/:id
DELETE /api/v1/library/:id
```

`project_id=global` 只读 workspace-level 条目；项目生成可使用当前项目条目和 global 条目，不能
引用其他项目的条目。公共 create/update 禁止写 `provider_refs`。list/detail/create/update 的
普通响应只返回脱敏绑定视图（provider、状态、binding_id、掩码 external id），不会返回
credential_id、channel_id、verified_params 或旧 params；Provider 绑定管理 API 尚未开放。

### Assets

```text
GET    /api/v1/assets?project_id=&type=&limit=&before=
GET    /api/v1/assets/:id
GET    /api/v1/assets/:id/url?ttl=&variant=full|thumb
POST   /api/v1/assets/urls
POST   /api/v1/assets/upload-intent
POST   /api/v1/assets/uploads/:draftId/complete
POST   /api/v1/assets/:id/thumbnail-intent
POST   /api/v1/assets/:id/thumbnail-complete
POST   /api/v1/assets/:id/copy-to-project
DELETE /api/v1/assets/:id
```

资产可见性为三态 `visibility = private | project | workspace`：`private` 仅 owner 可见；
`project` 需要在对应项目持有 `project.asset.view`；`workspace` 对工作区成员可见。所有读取
（详情、单个/批量签名 URL、列表）都先过可见性判定，签发 presigned URL 的时机就是鉴权点。
`POST /assets/urls` 批量签发（body `{ ids[], ttl? }`），无权限的 id 静默省略，用于网格缩略图；
有 `thumb_storage_key` 时签发缩略图，否则回退主对象（列表预览兼容无封面的历史资产）。

`GET /assets/:id/url` 默认 `variant=full`（主对象）。`variant=thumb` 仅签发封面；无
`thumb_storage_key` 时返回 `THUMB_NOT_FOUND`，**不会**回退到整段视频，避免把视频当封面。
资产记录含 `thumb_storage_key`（可为 null）。

上传为预签名直传两段式：

1. `POST /assets/upload-intent`：提交 `type/mime_type/bytes/name?/project_id?/visibility?/with_thumbnail?`；
   服务端校验并生成 storage_key（客户端不能自选 key），返回 `{ draft_id, upload_url, thumb_upload_url?, expires_in }`。
   未指定 `visibility` 时默认：有 `project_id` 为 `project`，否则为 `private`。
2. 服务端先持久化 `asset_upload_drafts`；客户端只能向 staging key `PUT` 主对象和可选缩略图。
3. `POST /assets/uploads/:draftId/complete` 在行锁事务中重新鉴权，`HeadObject` 精确核验大小/mime，
   再用带源 ETag 条件的 CopyObject 提升到不可变 final key；同一 draft 最多生成一个 asset，重复
   complete 幂等返回该记录。intent 有效期 1 小时，清理任务以原子 claim 避免与 complete 竞态。
   事务提交后删除 staging 对象并记录 `staging_cleaned_at`；若对象存储临时失败，定时清理器会
   对已完成 draft 幂等重试，不回滚已经可用的资产。

已落库资产补封面（生成视频等无 `thumb_storage_key` 时由前端抽帧）：

1. `POST /assets/:id/thumbnail-intent`：owner（或 workspace super/owner）获得 `{ thumb_upload_url, expires_in }`，
   目标 key 固定为 `{storage_key}.thumb.jpg`。
2. 客户端 `PUT` JPEG。
3. `POST /assets/:id/thumbnail-complete`：`HeadObject` 通过后写入 `thumb_storage_key` 并返回资产。

### Models

```text
GET    /api/v1/models?task_type=
GET    /api/v1/models/:id
POST   /api/v1/models/estimate-cost
```

“可用模型”统一定义为：模型/provider 已启用，且 provider 下存在启用的 channel 与启用的 credential。`credential.is_valid` 只用于 UI 提示，不参与可用性过滤。

### Admin

```text
GET/POST/PATCH/DELETE  /api/v1/admin/providers
GET/POST/PATCH/DELETE  /api/v1/admin/channels
GET/POST/PATCH/DELETE  /api/v1/admin/credentials
POST                   /api/v1/admin/credentials/:id/validate
GET/PATCH              /api/v1/admin/models
POST                   /api/v1/admin/registry/reload
GET/PUT/DELETE         /api/v1/admin/feature-configs/:key
GET                    /api/v1/admin/dreamina/status
POST                   /api/v1/admin/dreamina/login
GET                    /api/v1/admin/dreamina/login/status
POST                   /api/v1/admin/dreamina/logout
GET                    /api/v1/admin/request-logs
GET                    /api/v1/admin/billing/overview
```

## 6. OpenAPI

Swagger 暴露在 canvas-api：

- `/api/v1/docs`

后台 API 也属于同一 canvas-api OpenAPI 面；不再维护 `/internal/v1/docs`。
