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
`GET /auth/config` 返回 `{ methods, oauth }`，只公布当前实例实际可用的密码、验证码和真实 OAuth
方式；不提供跳过认证的登录入口或本地身份 Provider。

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
`mode/prompt/prompt_doc/negative_prompt/references/json`。`references[]` 最多 32 条，
每条 `type` 必填，并且必须且只能提供 `asset_id` 或 `library_entry_id`；不得提交 URL、本地路径、
mime type 或服务端 metadata。服务端在签名 URL 前对照权威 Asset `type + mime_type` 校验声明类型，
不从文件名猜类型；音频同样使用 `references[]` 并声明 `type=audio`。带 `source_node_id` 时必须同时
提供同工作区的 `project_id`，且调用者需有 `project.canvas.node.edit`。

客户端只能提交稳定公开 `model_id`，不能提交 Catalog Pin、`catalog_epoch` 或路由。服务端在同一
可用性解析中为每个 Task 写入
`model_resource_uid/model_revision_id/rate_card_revision_id/catalog_epoch`。Retry 沿用原 Pin。

真实分发建立内部 `invoke_logical_request_id`；每个物理厂商调用先写一条独立
`request_log(id, attempt_no, status=pending)`，随后才发送请求。分发选中的
`channel_resource_uid/channel_revision_id/channel_route/credential_id` 在该日志中精确保存，并在
Task 成功或异步作业被接受时写回 Task；异步作业还保存 `invoke_request_id/external_task_id`。这些关联
字段不属于公共 Task DTO。Poll、Cancel 和
恢复使用精确路由。写请求结果未知时不自动重放；用户 retry 在上一物理 attempt 尚未终结时返回
`INVOKE_ATTEMPT_UNRESOLVED`。

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
credential_id、channel_resource_uid、verified_params 或内部 params；Provider 绑定管理 API 尚未开放。

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
GET    /api/v1/models/schema?id=
POST   /api/v1/models/validate-params
POST   /api/v1/models/estimate-cost
```

两个 POST 的 body 都使用 `{ model_id, params }`。Model ID 可能包含 `/`，因此 schema 使用 query、
validate/estimate 使用 body，不把 ID 放入 path。

模型可用性由 `ModelAvailabilityService` 统一判定：当前 Model/Provider 和模型允许的 Channel 必须
具有启用的 Runtime Settings，并且候选 Channel 下存在启用 Credential。公开列表应用同一门禁，并
额外要求 `visibility=public`。`credential.is_valid` 和 `expires_at` 只用于运营提示，不参与可用性过滤。
`model_id` 是不可修改的
公开稳定键，内部关联使用 `resource_uid`。

Schema 与价格响应来自当前 Model/Rate Card Revision。`param_schema` 只使用规范紧凑 Schema，价格
只使用 `{ currency, components[] }`；API 不提供旧格式转换。没有当前 Rate Card 时 `pricing=null`，
不是空对象。

### Stats

```text
GET    /api/v1/stats/overview
GET    /api/v1/stats/by-model
GET    /api/v1/stats/by-member
GET    /api/v1/stats/by-project
```

四个接口都要求 `system.billing.view`，且只读取当前认证 Session 的 Workspace。可选
`workspace_id` 只用于客户端断言当前范围；若与 Session Workspace 不一致返回 `403 FORBIDDEN`，
服务端不会接受调用方指定任意 Workspace。每次读取还会重新确认 Workspace Membership。

Stats 只返回 Task 数量、状态、成功率和最近使用时间，不包含 `estimated_cost` 或任何按任务数推算的
费用。真实成本只能读取 `/admin/billing/*` 的 Request Log 冻结成本，并按原生币种分别展示。

### Admin

```text
GET/POST               /api/v1/admin/providers
GET/PATCH/DELETE       /api/v1/admin/providers/:id
GET/POST               /api/v1/admin/providers/:providerId/channels
GET/PATCH/DELETE       /api/v1/admin/channels/:id
GET                    /api/v1/admin/credential-catalog
POST                   /api/v1/admin/credentials
GET/POST               /api/v1/admin/channels/:channelId/credentials
GET/PATCH/DELETE       /api/v1/admin/credentials/:id
POST                   /api/v1/admin/credentials/:id/validate
GET                    /api/v1/admin/credentials/:id/balance
GET                    /api/v1/admin/providers/:id/status
GET                    /api/v1/admin/providers/:id/models?channel_resource_uid=&contract_profile=
POST                   /api/v1/admin/providers/:id/models/import
POST                   /api/v1/admin/providers/:id/probe-models
GET/POST               /api/v1/admin/models
GET/PATCH/DELETE       /api/v1/admin/models/:id
POST                   /api/v1/admin/models/:id/fork
POST                   /api/v1/admin/registry/reload
GET                    /api/v1/admin/registry/snapshot
GET                    /api/v1/admin/feature-configs
GET                    /api/v1/admin/feature-configs/model-options
GET/PUT/DELETE         /api/v1/admin/feature-configs/:key
GET                    /api/v1/admin/dreamina/status
POST                   /api/v1/admin/dreamina/login
GET                    /api/v1/admin/dreamina/login/status
POST                   /api/v1/admin/dreamina/logout
GET                    /api/v1/admin/request-logs
GET                    /api/v1/admin/request-logs/:id
POST                   /api/v1/admin/request-logs/:id/analyze
POST                   /api/v1/admin/request-logs/purge
GET                    /api/v1/admin/billing/overview
```

Provider/Channel/Model 管理路径中的 `:id` 均为 Catalog `resource_uid`。Catalog Revision 是四类资源
的唯一结构真相；三类管理列表只把当前 Revision 与对应 Runtime Settings/Credential 合成为响应。
管理响应包含：

```text
origin.kind            official | local
origin.source_id
origin.resource_uid
origin.revision
origin.revision_id
origin.release_id      official 时存在
```

官方 Model 结构只读，可通过 `/models/:id/fork` 创建本地副本；Provider/Channel 当前没有 Fork API，
自定义时直接新建本地资源。本地结构 Patch 必须提交 `expected_revision`。官方运营字段仍可编辑，
并可用 `reset_config_overrides` 恢复 Catalog 默认值：Provider 支持 `base_url/auth_config`；
Channel 支持 `base_url/request_config`。负载均衡、限流、配额、并发和健康探测尚未实现，当前契约不接受这些字段。
任何资源的 `slug` 与 Model 的 `model_id` 创建后都不能 Patch；更换标识需要创建新资源并 Retire 原资源。

Provider/Channel `base_url` 只接受绝对 HTTPS URL，禁止 userinfo、fragment 和密钥型 query；Provider
`auth_config` 与 Channel `request_config` 的任意嵌套层级都禁止
`authorization/api_key/*_token/*_password/*_secret/*_cookie`
等密钥型键。Endpoint/auth/request 配置不是 Secret 存储面。若某 Channel 已绑定启用且未归档的 Credential，
将有效 Endpoint 改到新 URL origin 还要求 `system.credential.manage`；仅有
`system.model.manage` 可以做同 origin 路径调整或不影响活动 Credential 的配置变更。错误码为
`CREDENTIAL_ROUTE_CHANGE_FORBIDDEN` 或 `CATALOG_OUTBOUND_CONFIG_INVALID`。
运行时 Vendor 请求只连接公网 HTTPS：全部 DNS 答案通过校验后将 socket 固定到已校验 IP；携带
Credential 的 API 请求不跟随重定向。资产 URL 最多跟随 3 跳，每一跳重新校验，跨 origin 时移除
Authorization/Cookie 等敏感头。JSON、错误体、SSE 与资产均按用途设置流式字节上限。

创建/修改 Provider 时 `adapter_keys` 必须非空；创建/修改 Channel 时 `adapter_keys` 也必须非空且是
Provider 声明集合的子集。创建/修改 Local Model 必须显式提交 `adapter_key` 与非空
`allowed_channel_resource_uids`，所选 Channel 必须属于同一 Provider，并支持该 Adapter；空数组不表示
全部 Channel。Local Model Patch 中省略 `pricing` 表示不修改，对象表示创建/追加 Rate Card，
`pricing:null` 必须同时提交精确 `expected_rate_revision`；系统先追加 retired Rate Card Revision，
再追加 Model Revision 并解除当前 Rate Card 关联。历史 Revision 不删除。

目录相关冲突码包括 `CATALOG_RESOURCE_READ_ONLY`、`CATALOG_REVISION_CONFLICT`、
`CATALOG_RESOURCE_IN_USE`；历史固定 Revision 不可解析时返回 `CATALOG_REVISION_MISSING`。
厂商 `/models` 导入必须提交 `contract_profile=openai-text-chat-stream`；缺失时返回
`VENDOR_MODEL_CONTRACT_REQUIRED`。Probe、List、Import 和 `POST /credentials` 都必须提交精确
`channel_resource_uid`；Channel 必须属于目标 Provider，且 Provider/Channel 都支持该契约对应的
Adapter。系统不会推断、默认或自动创建 Channel。导入的 Local Model 只允许所选 Channel。

`POST /credentials` 是凭证向导的原子保存入口：启用所选 Provider/Channel、写入 Credential、导入
勾选的 Vendor Model、启用与所选 Channel 兼容的勾选官方 Model，均在一次
`RegistryBootstrapService.mutateLocal` 数据库事务与候选 Snapshot 中完成；任一步失败全部回滚。
当前向导只支持 `api_key`（payload 必须且只能含非空 `api_key`）和 `cli_login`（payload 必须为空）。

Credential 使用 `channel_resource_uid` 绑定 Catalog Channel；Feature Config 通过
`feature_model_bindings(model_resource_uid, priority)` 保存有序 Model 绑定，不复制 `model_id` 数组。
`GET /api/v1/admin/credential-catalog` 使用 `system.credential.manage`，从当前 Registry Snapshot 返回
凭证页所需 Provider/Channel/Model 最小结构投影，并附带未归档 Credential；它不要求
`system.model.manage`，也不返回完整 Param Schema/Pricing 管理对象或 Secret payload。
Feature Config 响应返回代码拥有的 `required_task_type`；当前 `ai-analysis`、`agent`、
`script-extract` 都要求 `gen.text`。未知 feature、缺失/非当前 Model 和 task type 不兼容的绑定都会被
拒绝，客户端不能在请求中改写功能所需类型。`GET /api/v1/admin/feature-configs/model-options` 使用
`system.config.manage`，只返回选择器需要的
`resource_uid/model_id/display_name/task_types/enabled/provider.display_name` 最小投影；Feature Config
页面不借用需要 `system.model.manage` 的 `/admin/models` 管理接口。结果只来自当前 Registry Snapshot，
不包含 Param Schema、Pricing、Credential 或其他完整管理字段。

Request Log 的 `id` 标识一次物理调用，`logical_request_id + attempt_no` 标识它在一次逻辑 Invoke 中
的位置；`attempt_no=null` 只能是未触达厂商且已终结的 preflight 日志，任何 `pending` 行都必须带
正整数 attempt 与完整路由 Pin。Billing 只读取
`source=invoke AND attempt_no IS NOT NULL` 的物理 attempt，并按原生币种分别聚合；只有成功物理
attempt 会冻结 `cost/cost_currency`。Purge 必须至少带一个有效过滤条件，且无论请求条件如何都不会
删除 `status=pending` 的恢复账本；空条件和 `status=pending` 都删除 0 条。
写入 Request Log 前对 Channel Route 做非密配置校验并精确保存，JSON detail 和错误文本在持久化边界
脱敏；管理 API、分析输入和应用日志再次使用独立脱敏投影。运行态路由不会被改写成占位符，因此异步
Poll、Cancel 和恢复仍能复用原始合法非密路由。

当前没有远端 Catalog check/sync/activate/rollback API；`registry/reload` 只导入镜像内 Bundle 并
重建本地 Snapshot。

## 6. OpenAPI

Swagger 暴露在 canvas-api：

- `/api/v1/docs`

后台 API 也属于同一 canvas-api OpenAPI 面；不再维护 `/internal/v1/docs`。
