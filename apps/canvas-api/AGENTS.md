# canvas-api Codex Guide

本目录是 NestJS 单体后端，包含业务模块和 `src/account` 子系统。改这里时同时遵守根目录 `AGENTS.md`。

## 必读路由

- 改 provider / adapter / model registry：先读 `docs/adapter-guide.md`。
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

- “可用模型”只按 provider/channel/credential/model enabled 且存在后台凭证判断，不要求凭证验证通过或未过期。
- `source=preset` 来自 YAML reload；`source=manual` 来自 DB，reload 不覆盖。
- 结构性生成输入放在 `input_contract`；真实生成参数放在 `param_schema` 和 `param_constraints`。
- 手动模型引用模板并做少量 override，不在 DB 手写大段 `param_schema`。

## 验证

- 后端逻辑改动优先跑：`pnpm --filter @xgcanvas/canvas-api test`。
- contract/shared-types 改动后跑对应 package build 或 typecheck。
- 涉及 registry/YAML 时至少验证 YAML 可加载，并确认 DB migration 与实体一致。

