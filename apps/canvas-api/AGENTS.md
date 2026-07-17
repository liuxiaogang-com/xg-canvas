# canvas-api Codex Guide

本目录是 NestJS 单体后端，包含业务模块和 `src/account` 子系统。改这里时同时遵守根目录 `AGENTS.md`。

## 必读路由

- 改 provider / adapter / model registry：先读 `docs/model-catalog.md` 和 `docs/adapter-guide.md`。
- 改任务状态、重试、资产落桶：先读 `docs/task-lifecycle.md`。
- 改 API 入参/返回/错误：先读 `docs/api-conventions.md`。
- 改 agent/tool/stream event：先读 `docs/agent-spec.md`。
- 改数据库结构：同步 `database/migrations/*` 和 `docs/architecture.md`。

## 后端边界

- 业务模块调用模型必须经过 `src/account-client`，不要直接 import `src/account/*` 内部服务。
- `src/account` 内部 adapter 调外部厂商必须走 adapter contract，并通过 DI 获得依赖。
- 即梦 CLI 只能由 `DreaminaCliRunner` 封装和 spawn；不要恢复旧 bridge 或额外服务。
- Redis 只能通过项目 RedisModule / RedisService，禁止直接 `new Redis()`。
- 远程资产必须由 `AssetDownloaderService` 下载到对象存储后再返回，不把第三方 CDN URL 透给前端。

## 模型与可用性

- 运行时只读取构建生成的 `model-catalog.bundle.json`；作者 YAML 不得在 API 进程中直接加载。
- Catalog Revision 是 Provider、Channel、Model 与 Rate Card 的唯一结构真相；官方和本地资源都使用稳定 Catalog UUID 与不可变 Revision，不维护结构镜像表。
- Provider/Channel/Model 的本地结构写入必须通过 `CatalogLocalWriterService`，外层由 `RegistryBootstrapService.mutateLocal` 在事务中构建候选 Snapshot 并提交后切换。
- Runtime Settings 只使用 `provider_installations`、`channel_installations`、`model_settings`；Credential 直接引用 `channel_resource_uid`，结构关系只能来自当前 Catalog Revision。
- 模型可用性由 `ModelAvailabilityService` 统一判定：Live/Demo 都要求当前 Revision、Model/Provider/允许 Channel Settings 与 Adapter 契约成立；Live 还要求启用 Credential，但不要求验证通过或未过期，Demo 只豁免 Credential。
- 所有 Task（包括 Demo）创建时固定 Model/Rate Card Revision；`execution_mode=demo` 同时决定选模凭证门禁与 MockExecutor，Invoke/Poll/Cancel/Retry 不得回退到当前新 Revision。
- 结构性生成输入放在 `input_contract`；真实生成参数放在 `param_schema` 和 `param_constraints`。
- Catalog 只接受规范 task/capability、紧凑 Param Schema 与 components Pricing；不得在 Compiler、导入层或 Snapshot 层加入旧格式转换。
- 厂商 `/models` 只提供 ID，必须由显式 contract profile 推导 Adapter 和兼容 Channel，禁止按模型名猜能力。
- 厂商模型 probe/list/import 与凭证接入必须携带一个明确的 `channel_resource_uid`，禁止按渠道数量推断或自动创建默认 Channel。
- 凭证向导涉及的 Provider/Channel 启用、Credential 保存、Vendor Model Local Revision 与官方 Model 启用必须在同一次 `RegistryBootstrapService.mutateLocal` 事务中完成。

## 验证

- 后端逻辑改动优先跑：`pnpm --filter @xgcanvas/canvas-api test`。
- contract/shared-types 改动后跑对应 package build 或 typecheck。
- 涉及 Catalog/Registry 时至少跑 `pnpm catalog:check`，并确认 fresh DB migration、Runtime Settings、Snapshot 与实体一致。
