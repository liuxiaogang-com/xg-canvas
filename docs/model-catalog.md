# XG Canvas Model Catalog 规范

本文定义 XG Canvas 已实现的本地版本化模型目录，以及未来接入远端官方目录时必须保持的边界。
当前版本不包含远端更新 API、网络拉取、签名、定时同步或第三方目录源。

## 1. 目标与边界

当前实现解决四个问题：

- Provider/Model 作者配置可以按家族和输入模式拆分，不再维护数百行单文件。
- 官方预置与部署者创建的本地资源具有不同 Source、稳定 UUID 和不可变 Revision。
- 运行时只消费确定性的 Catalog Bundle 和数据库 Revision，不直接读取作者 YAML。
- 目录变化通过不可变 Snapshot 引用在单个 API 进程内切换；任务固定创建时的模型与费率 Revision。

本阶段明确不做：

- Catalog URL、HTTP 拉取、ETag、CDN、OCI 或第三方目录源。
- 远端 `/check`、`/sync`、`/activate`、`/rollback` API。
- TUF、签名、公钥、密钥轮换、Diff/审批 UI 和定时调度。
- 在线下载或执行 Adapter 代码。
- 多 API 副本间的更新通知和一致性屏障。

官方目录仍随应用镜像发布。未来更新器只能把经过信任校验的完整 Bundle 交给现有导入服务，
不能绕过 Schema、Release、Revision 或 Snapshot 构建流程。

## 2. 核心不变量

1. Adapter 鉴权、请求构造、轮询和响应解析留在代码中；Catalog 只含声明式数据。
2. `config/model-providers/**/*.yaml` 仅是构建期作者输入，运行时只读 `model-catalog.bundle.json`。
3. 官方 Source 和本地 Source 物理隔离；官方导入不能接管或覆盖本地资源。
4. Resource Revision 与官方 Release 只追加，历史 Revision 不原地修改。
5. Credential、实际 Endpoint、启停和路由属于部署本地运营状态，不写回官方 Revision。
6. Registry 只暴露完整的不可变 Snapshot，切换为单次引用替换。
7. 编译、导入或候选 Snapshot 构建失败时，当前 Snapshot 保持不变。
8. Bundle 不含 Credential、Secret、脚本、远程 `$ref` 或可执行表达式。
9. 新官方模型默认不全量启用；凭证向导必须绑定一个显式 Channel，只启用用户勾选且允许该
   Channel 的模型。
10. 公开 API 使用稳定 `model_id`，内部身份和关联统一使用 `resource_uid`。
11. 所有 Task（包括 Demo）保存并使用创建时的 Model/Rate Card Revision；执行方式由 `execution_mode` 选择。
12. 官方结构字段只读；要改变协议、参数或能力，必须 Fork 成本地模型。
13. Provider 与 Channel 都必须声明非空 `adapter_keys`；Model 必须声明一个 `adapter_key` 和非空 `allowed_channel_uids`，不存在“空集合代表全部 Channel”的通配语义。
14. Channel 的 `adapter_keys` 必须是所属 Provider 声明集合的子集；Model 只能选择属于同一 Provider、且明确支持其 `adapter_key` 的 Channel。
15. Provider/Channel `base_url` 是携带 Credential 的出站路由，只允许绝对 HTTPS URL，禁止 URL
    userinfo、fragment 与疑似密钥 query；Provider `auth_config` 与 Channel `request_config` 任意深度
    都不能包含 `authorization/api_key/*_token/*_password/*_secret/*_cookie` 等密钥型键。
16. 出站配置在作者 Bundle、本地 Revision、Runtime Settings 写入和 Snapshot 构建四个边界使用同一
    校验语义；Task/Request Log 必须保存通过校验的精确非密路由，只有日志与管理 API 投影做深度脱敏，
    不能把供 Poll/Cancel/恢复使用的运行数据改写成脱敏占位符。
17. 厂商出站请求只连接公网 HTTPS：解析并校验全部 DNS 地址后把 socket 固定到已校验 IP；携带
    Credential 的 API 请求禁止重定向，资产下载每一跳重新校验且跨 origin 移除敏感头。JSON、错误体、
    SSE 与资产下载均有流式字节上限，不能先无界读入内存再截断。

## 3. 身份、修订与生命周期

### 3.1 Source

每个目录来源包含：

- `source_id`：永久 UUID。
- `namespace`：唯一可读名；官方为 `xgcanvas.official`，本地为 `local:<uuid>`。
- `kind`：`official | local`。

代码必须检查 `kind` 与已激活官方 `source_id`，不能从 UUID 形态猜来源。数据库首次迁移会创建
一个实例本地 Source；后续所有后台新增和 Fork 都写入该 Source。

### 3.2 Resource 与 Revision

可形成历史的资源类型：

- `provider`
- `channel_template`
- `model_offering`
- `rate_card`

每个资源具有永久 `resource_uid`、Source 内唯一 `slug` 和从 1 递增的 `revision`。官方 UUID
提交在作者文件中；本地 UUID 创建一次后持久化。`slug` 与公开 `model_id` 创建后不可修改；展示名称
与 `provider_model_id` 可以随 Revision 更新。确需更换公开标识时，创建新资源并把原资源标记为
`retired`。

新 Resource 必须从 Revision 1 开始。导入已有 Resource 时，只接受“当前 Head Revision + 相同 Digest”的幂等重放，或恰好 `Head + 1` 的新 Revision；回退、跳号和同 Revision 改写都会拒绝。本地 Resource 的 `catalog_resources.head_revision` 是唯一 Local Head 指针；官方当前版本则由 Active Release 的 `catalog_release_entries(resource_uid, revision)` 精确选定，二者都不允许用“最大 revision”临时猜当前版本。

数据库唯一性以 Source 为边界，但有效 Snapshot 还必须消除运行时歧义：Provider `slug` 在官方与本地当前资源的并集中全局唯一；Channel `slug` 在同一 Provider 下唯一；公开 `model_id` 全局唯一。跨 Source 冲突会使候选 Snapshot 构建失败，不通过“本地优先”或“官方优先”静默覆盖。

生命周期为：

- `active`：可用于新任务和历史固定任务。
- `deprecated`：仍可用，但 UI/文档应提示迁移。
- `retired`：不进入新任务选择；此前的 active/deprecated Revision 仍可服务已固定任务。
- `revoked`：当前和历史 Revision 都不得执行；历史记录仍保留在数据库。

本地更新要求客户端提交 `expected_revision`。Revision 不匹配返回
`CATALOG_REVISION_CONFLICT`，防止静默覆盖并发编辑。

### 3.3 Official Release

官方作者目录头声明：

- `release_id`：不可变 UUID。
- `sequence`：同一官方 Source 内递增的正整数。
- `published_at`。
- `min_runtime_version`：可选的三段数字语义版本。

编译/导入层再对规范 JSON 字节计算 SHA-256 `content_digest`，并与 Release 一起持久化；Digest 不是
作者可以手填的 Bundle 字段。

相同 `sequence` 必须对应相同 Release 与 Digest；较低 Sequence 的镜像内 Bundle 不会覆盖数据库
中较高的 Active Release。运行时同时校验候选 Bundle 与数据库中已激活 Bundle 的最低版本要求，
因此旧二进制也不会在重启时误加载需要新语义的目录。

## 4. 作者配置与确定性 Bundle

作者入口：

```text
config/model-catalog.yaml
config/model-providers/<provider>/provider.yaml
config/model-providers/<provider>/channels.yaml
config/model-providers/<provider>/models/<family-or-mode>.yaml
config/model-providers/<provider>/profiles/*.yaml       # 可选局部模板
config/schema-templates/*.yaml                          # 共享模板
```

Loader 递归读取 YAML；每个作者文件最多 200 行，超过时 `catalog:check` 直接失败。按模型家族或
输入模式拆分，不要求一模型一文件。Release 文件和每个 Resource 必须使用稳定 UUID。

常用命令：

```bash
pnpm catalog:check
pnpm catalog:build
```

`catalog:check` 会先构建 `model-catalog` 及其 workspace 依赖，再编译和校验配置。
`catalog:build` 生成 `config/model-catalog.bundle.json`；该文件是构建产物并被 Git 忽略，Docker
镜像在 build 阶段重新生成。

Compiler 输出完整 `CatalogBundleV1`：

```text
format / schema_version / source / release
providers[] / channel_templates[] / model_offerings[] / rate_cards[]
```

编译器会展开模板、稳定排序键和数组，并校验 UUID、长度、引用、Adapter 能力、Input Contract、
Param Schema、Constraint、Pricing 和生命周期。作者文件只接受 shared-types 规范
task/capability、紧凑 Param Schema 与 `{ currency, components[] }` Pricing；Compiler 不做格式转换。
相同输入必须产生相同规范 JSON 与 Digest。Bundle V1 是完整快照，不实现 Delta，也不自带自制
签名字段。`retired/revoked` 直接由资源 Revision 表达。

Provider/Channel/Model 的 Adapter 关系在编译期做闭包校验：Provider 与 Channel 的 `adapter_keys` 都非空且去重，Channel 不能声明 Provider 未提供的 Adapter；Model 的 `adapter_key` 必须由 Provider 声明，`allowed_channel_slugs` 必须非空，且其中每个 Channel 都属于该 Provider，并支持此 Adapter。Pricing 的 `components[].meter` 也不得重复。

### 4.1 Param Contract V1

`param_schema` 只有三种合法输入：

1. 省略：编译为规范空 Schema `{ version: "1.0", groups: [], properties: {}, required: [], defaults: {} }`。
2. 直接定义：必须完整提供 `version/groups/properties/required/defaults`。
3. 模板引用：只允许 `{ extends, override? }`；`override` 只允许
   `groups/properties/required/defaults`，合并后仍按完整 V1 Schema 校验。

所有层级都是 strict object：未知键、缺少必填键、重复 group/constraint id、引用不存在字段、非法范围或未知 constraint action 都直接失败，不注入隐式默认值，也不兼容旧扁平格式。模板文件的 `schema` 自身同样必须带 `version: "1.0"`。

### 4.2 Input Contract V1

`input_contract` 省略表示该 Model 没有结构化素材契约；只有 `undefined` 表示省略，`null`、空对象和未知字段均非法。存在时必须至少声明一个 mode，`default_mode` 必须引用其中一个 mode；mode id、同一 mode 下的 slot、library kind/form 都不得重复。

`required_slots` 的有效 `min` 默认为 1 且不能为 0；`optional_slots` 的有效 `min` 默认为 0，若显式填写也只能为 0；`max` 不能小于有效 `min`。Slot 不再使用冗余 `required` 布尔值，是否必填只由它位于 `required_slots` 或 `optional_slots` 决定。运行时输入只能引用当前 mode 声明过的 slot。

## 5. 数据模型与运营状态

`account` schema 中的 Catalog 表：

```text
catalog_sources
catalog_releases
catalog_resources
catalog_resource_revisions
catalog_release_entries
provider_installations
channel_installations
model_settings
catalog_runtime_state
```

职责：

- `catalog_releases` 保存不可变官方 Bundle、Sequence 和 Digest。
- `catalog_resources` 保存逻辑身份；本地资源的 `head_revision` 指向当前 Head。
- `catalog_resource_revisions` 保存不可变规范化文档。
- `catalog_release_entries` 固定 Release 中每个 Resource 的精确 Revision。
- `provider_installations` 保存 Provider 启用、排序及 `base_url/auth_config` 运营覆盖。
- `channel_installations` 保存 Channel 启用、优先级与 Endpoint/路由覆盖。
- `model_settings` 保存 Model 启用、可见性和排序。
- `catalog_runtime_state` 保存 Active Official Release、单调 `catalog_epoch` 与 Snapshot Digest。

Catalog Revision 是 Provider、Channel、Model 与 Rate Card 的唯一结构真相；数据库不维护结构镜像
表。Credential 直接引用稳定的 Channel `resource_uid`。管理列表、可用性判断与路由都从当前
Revision 合成本地 Settings/Credential，不能回退到另一份模型定义。

当前 Runtime Settings 字段：

- Provider：`enabled`、`sort_order`，以及 `base_url/auth_config` 运营覆盖。
- Channel：`enabled`、`priority`，以及 `base_url/request_config` 运营覆盖。
- Model：`enabled`、`visibility`、`sort_order`。

Settings 不预留尚未实现的负载均衡、限流、配额、并发、健康探测、
`display_name_override/default_params/price_override`。清除运营覆盖会恢复
当前 Catalog Revision 中的默认值；结构字段只能通过 Local Revision 变更。

Endpoint、auth 与 request 配置只保存非密协议和路由信息，Credential payload 是唯一密钥来源。
Runtime override 同样必须满足 HTTPS、无 URL 凭据、无密钥 query、无密钥型配置键；绕过 API 写入的非法数据库值会让
候选 Snapshot fail fast，而不是进入 Adapter。若某 Channel 已绑定启用且未归档的 Credential，
把其有效 Endpoint 改到新的 URL origin 还必须持有 `system.credential.manage`；只有
`system.model.manage` 的操作者只能调整同 origin 路径或不影响现有 Credential 的路由。

## 6. 导入与原子热加载

主要实现接缝：

- `CatalogImportService`：校验和导入官方 Release，阻止降级与 Source 接管。
- `CatalogLocalWriterService`：创建本地资源、追加 Revision、Retire 与 Settings 更新。
- `RegistrySnapshotFactory`：从 Active Official Revisions、本地 Heads、Settings 与 Credential 构建候选快照。
- `RegistryBootstrapService`：串行化 reload/本地写事务，提交后切换 Snapshot。
- `RegistryService`：只读当前 Snapshot，按稳定 `model_id` 或固定 Revision 解析。
- `ModelAvailabilityService`：唯一的“可开始新任务”判定入口。

有效目录为：

```text
Active Official Revisions
+ Local Resource Heads
+ Runtime Settings / Credential
= Immutable Runtime Snapshot
```

启动或 `POST /api/v1/admin/registry/reload` 时：

1. 从配置根目录读取已生成的 `model-catalog.bundle.json`。
2. 校验 Bundle、Runtime 版本、官方 Source、Sequence 和 Digest 连续性。
3. 在 `SERIALIZABLE` 事务与 PostgreSQL advisory lock 中幂等导入 Release/Revision。
4. 为首次出现的 Provider/Channel/Model 创建默认关闭的 Settings；已有稳定 UUID 的 Settings 与
   Credential 保持不变。
5. 在同一事务内由 Active Official Revisions、Local Heads、Settings 与 Credential 构建完整候选
   Snapshot，更新 `catalog_epoch` 与 Digest。
6. 事务成功后单次替换当前进程 Snapshot，并写 Redis 元数据 `xgcanvas:registry:revision`。

本实现只支持全新 Catalog-native 数据库。数据库中任何 Task 都必须自创建起具有完整 Revision Pin。
部署该 Beta 基线时必须显式使用新的 PostgreSQL 数据卷；应用和 Compose 不会自动删除数据。

候选构建失败会回滚整个事务，旧 Snapshot 不变。事务提交后再替换内存引用，因此数据库提交与
内存替换之间存在极短窗口，但单次请求只捕获并使用一个完整的不可变 Snapshot。本阶段不提供
多副本同步保证；Redis 值仅是观测元数据，不是分发协议。

Snapshot 同时建立历史 Model/Rate Card Revision 索引以解析 Task Pin。读取每个 Revision 时必须用
规范 JSON 重新计算 SHA-256 并核对持久化的 `content_digest`。任何历史文档损坏、Digest 不一致、所属
Resource/Provider 缺失、Rate Card 归属不一致或 Adapter 契约不成立都应让候选整体失败；不得跳过
坏行后发布一个“部分可用”Snapshot。当前 active/deprecated Rate Card 必须被其当前所属 Model 精确
反向引用，不能留下仍“有效”但已脱链的费率。只有当前资源显式 `revoked` 时，相关历史 Revision 才按
生命周期规则从可执行索引中移除。

## 7. 可用性

Live 与 Demo 都必须满足以下基础门禁：

- 当前 Model Revision 是 active/deprecated，Model Settings `enabled=true`。
- 当前 Provider 和至少一个被模型允许的 Channel 都是当前 Revision且 Settings 已启用。
- Model 的 `adapter_key` 由 Provider 声明，且候选 Channel 的 `adapter_keys` 明确包含它。
- Adapter 存在、声明支持模型 task type，并实现对应 sync/stream/async 能力。

Live 可用性还要求候选 Channel 下存在 `enabled=true` 的 Credential；Demo 可选择性只豁免凭证要求。
Credential 的 `is_valid` 与 `expires_at` 只作运营提示，不参与 Live 可用性门禁。公开模型列表按当前
实例执行模式使用同一规则并额外要求 `visibility=public`。公开模型列表、Feature Config、Invoke 和
account-client 都复用 `ModelAvailabilityService`，不能各自复制近似 SQL。`model_id` 是不可修改的
公开稳定键；内部关联始终使用 `resource_uid`。

Feature Config 的 `required_task_type` 来自代码拥有的 Feature Contract，不保存为可编辑配置。当前 `ai-analysis`、`agent`、`script-extract` 都要求 `gen.text`；绑定写入前以及运行时选择时都会拒绝不兼容 Model。它通过 `system.config.manage` 专用的 `/admin/feature-configs/model-options` 获取最小 Model 投影，不依赖 `system.model.manage` 的完整 Model 管理 API。

## 8. 官方、本地与 Fork

API/UI 返回 `origin`，包含 Source kind、Resource UUID、Revision、Revision ID 和官方 Release ID。
官方资源结构字段只读；Provider/Channel 仍可编辑前述运营字段。模型结构需要修改时调用
`POST /api/v1/admin/models/:id/fork`，创建带 `forked_from_resource_uid/revision` 的本地模型。

本地 Provider、Channel、Model 可直接创建；每次结构修改追加本地 Revision。删除采用 Retire，
不物理删除仍可能被任务或日志引用的历史。厂商 `/models` 只返回模型 ID，导入时必须显式选择
`openai-text-chat-stream` 契约和一个属于目标 Provider 的精确 `channel_resource_uid`，且
Provider/Channel 都已声明 `openai-compat`。系统不会从名称、官方模型并集或“只有一个 Channel”
推断路由，也不会自动创建 Channel；导入的 Local Model 只允许所选 Channel。

凭证接入通过一次 `RegistryBootstrapService.mutateLocal` 原子完成：启用所选 Provider/Channel、保存 Credential、创建勾选的 Vendor Model Local Resource、启用与该 Channel 兼容的勾选官方 Model，随后才切换候选 Snapshot。任何一步失败都会回滚整个事务。

Provider/Channel 的 Endpoint 与 request 配置不能承载 Secret。变更会使已有启用 Credential 被发送到
新 origin 时，管理 API 执行条件授权并要求 `system.credential.manage`；该检查与 Settings 写入位于
同一 Catalog mutation 事务中，防止先检查、后换路由。

Credential 的类型与字段必须在同一事务内按当前 Provider Revision 的 `auth_method` 校验；当前只接受 `api_key` 与 `cli_login`，新增鉴权方式必须先扩展 Catalog、Credential 与向导契约。Provider 仍有未归档 Credential 时禁止修改 `auth_method`，必须先归档旧 Credential 后再变更并重新接入。

本地 Model 更新中，`pricing` 省略表示“不修改价格”，对象表示追加或创建 Local Rate Card Revision。
`pricing: null` 必须同时提交精确 `expected_rate_revision`：同一事务先为当前 Rate Card 追加
`retired` Revision，再追加新的 Model Revision 并解除 `rate_card_uid` 关联。历史 Rate Card Revision
不物理删除，既有 Task/Request Log 仍按已固定的 Rate Card Revision 解释。

## 9. Task 与费率固定

创建 Task 时，在统一可用性校验后保存：

```text
model_resource_uid
model_revision_id
rate_card_revision_id
catalog_epoch
execution_mode             live | demo
```

客户端不能提交这些字段。Invoke、Poll、Cancel、Retry 都通过同一 Pin 解析 Adapter 与上游模型，
目录更新只影响之后创建的任务。所有 Task（包括 Demo）创建时必须写入完整 Pin；Demo 在创建时只
豁免 Credential 门禁，并通过 `execution_mode=demo` 选择 MockExecutor。固定 Revision 无法解析时返回永久错误
`CATALOG_REVISION_MISSING`，不能悄悄改用当前模型。

Channel 不是 Task 创建时的 Catalog Pin：真实调用在分发前从 Model 显式允许的 Channel 中选路，
先把精确的 `channel_resource_uid/channel_revision_id/channel_route/credential_id` 持久化到分发前的
物理 Request Log；Task 预先保存 `invoke_logical_request_id`，并在成功或异步作业被接受时保存精确
路由。已接受的异步任务在 Poll/Cancel/恢复时
只使用这组精确路由，不因 Settings、Credential 或目录 Head 变化而重新选路；显式的新执行尝试只有
在上一物理尝试已确定终结后才清除路由并重新选择。精确路由只允许已经过非密配置校验的字段；存储值
不得预先脱敏，管理 API、分析输入和日志输出必须使用独立的脱敏投影。

`ops.request_logs` 同样保存模型/费率 Revision。Rate Card 是不可变 Resource Revision；成本按固定
Revision 计算并将 `cost/cost_currency` 冻结在请求日志中。缓存输入 token 单独计入
`cached_input_tokens`，不会同时重复计入普通 `input_tokens`。

## 10. 当前管理接口

当前仅提供本地管理和嵌入 Bundle 重载：

```text
POST /api/v1/admin/registry/reload
GET  /api/v1/admin/registry/snapshot

GET/POST/PATCH/DELETE /api/v1/admin/providers...
GET/POST/PATCH/DELETE /api/v1/admin/channels...
GET/POST/PATCH/DELETE /api/v1/admin/models...
POST /api/v1/admin/models/:id/fork
GET  /api/v1/admin/credential-catalog
POST /api/v1/admin/credentials
```

`credential-catalog` 是 `system.credential.manage` 的用途化只读 Snapshot 投影，不是第二份 Catalog
真相；`POST /credentials` 必须提交精确 `channel_resource_uid`，并使用前述单事务 onboarding。完整
Provider/Channel/Model 管理仍由 `system.model.manage` 端点负责。

没有远端更新 API。未来若增加远端分发，网络层应只负责获取和验证 Bundle，随后调用同一
`CatalogImportService` 激活接缝；远端新增 Provider 只有在当前二进制已有对应 Adapter 时才可用。
未来接口必须把“检查/下载候选 Bundle”和“激活 Release”分开，支持 ETag/签名/审批也只能发生在候选进入导入服务之前；激活仍必须遵守 Source 身份、Release Sequence、逐 Resource Revision、完整 Schema/Adapter 图校验和候选 Snapshot 原子切换。远端不得写 Runtime Settings、Credential 或本地 Source，也不得下发或执行 Adapter 代码。当前路由中没有为这些未来动作预留可调用的占位端点。
在引入历史 Release 回放或经过签名的 checkpoint 格式前，远端更新器不能让全新实例直接跳到含高 Revision 的头部 Bundle。

## 11. 验收标准

- 相同作者配置必须产生相同 Bundle 与 Digest；作者 YAML 不得超过 200 行。
- 重复导入不得新增 Revision；相同 Sequence 不得对应不同 Release/Digest，低 Sequence 不得降级。
- 新 Resource 必须从 Revision 1 开始；已有 Resource 只能幂等重放 Head 或追加 Head + 1。
- 官方导入不得覆盖本地 Source、Runtime Settings 或 Credential；新资源的 Settings 默认关闭。
- Active Official Revisions、Local Heads、Runtime Settings 与 Credential 必须合成单个不可变 Snapshot。
- Provider/Channel/Model 的 Adapter 图和显式允许 Channel 必须在编译、Local 写入与 Snapshot 构建时
  一致校验；空 Channel 集合不得被解释为通配。
- 本地创建、修改、Retire 与 Settings 更新无需重启即可生效；无效候选不得切换当前 Snapshot。
- 运行中 Task 必须继续使用其固定 Revision；Request Log 成本必须按固定 Rate Card Revision 冻结。
- Catalog、API 与 Web 必须通过单元测试、类型检查、lint 和生产构建。
- PostgreSQL 18 全新库必须通过首次迁移、重复迁移、失败回滚及 API 冷启动验证。
- API/Web 镜像必须通过 clean build context 构建，Compose 必须能解析并启动全新数据库。
- Runtime 不得直接读取作者 YAML；多进程通知、远端更新、签名和调度不属于当前版本。
