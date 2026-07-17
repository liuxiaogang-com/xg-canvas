# XG Canvas Overview

XG Canvas 是类似 ComfyUI + Dify + TapNow 的 AI 创意项目管理与画布平台。

项目是面向企业创意团队的开源、自托管 Beta 产品，完整代码采用 `AGPL-3.0-only` 发布，并保留独立商业授权路径。项目不按功能拆分社区版与企业版：现阶段优先把抽象、扩展点和契约做对，核心结构稳定后再进入结构冻结期并引入升级兼容承诺。

## 1. 产品范围

- Workspace -> Project -> Canvas -> Node/Asset
- 文本、图像、视频、音频生成
- 角色 / 场景 / 道具 / 分镜 / 脚本
- 单租户多用户 MVP，后续扩展实时协作
- `/settings` 后台用于 provider、credential、model、feature config、billing、request log 管理

## 2. 当前服务拓扑

当前采用模块化单体：

| 服务       | 技术                           |                端口 | 路径              |
| ---------- | ------------------------------ | ------------------: | ----------------- |
| canvas-web | React + Vite + React Flow      |                5180 | `apps/canvas-web` |
| canvas-api | NestJS                         |                5181 | `apps/canvas-api` |
| PostgreSQL 18 | account / canvas / ops schemas | 5433(dev compose) | integrated/external |
| Redis 8       | `xgcanvas:` prefix             | 6381(dev compose) | integrated/external |
| S3/R2      | remote S3-compatible bucket    |               cloud | external          |

`account-api` 已并入 `apps/canvas-api/src/account`，`account-admin` 已并入 `canvas-web /settings`。旧 `account-cli-bridge` 已删除；即梦 CLI 由 `DreaminaCliRunner` 在 server 中直接 spawn，Docker 镜像内置 CLI 并持久化登录态。

## 3. 核心原则

1. 单文件尽量不超过 400 行，严禁超过 500 行。
2. 业务模块调用模型/厂商必须经过 `account-client` seam。
3. Adapter 协议层 code-first；Catalog Revision 是 Provider、Channel、Model 与 Rate Card 的唯一结构真相，官方作者 YAML 构建为确定性 Bundle，运行时不维护结构镜像。
4. 任务即真相：长任务先落 `canvas.tasks`，使用 `SELECT ... FOR UPDATE SKIP LOCKED` 拿单。
5. 资产先落我们的远程 S3/R2：adapter 拿到第三方 URL 后必须经 downloader 转存。
6. Redis 全局前缀为 `xgcanvas:`，所有客户端必须经 `RedisModule`。
7. Model Catalog 使用稳定 `resource_uid`、不可变 Revision 和官方/本地 Source；Registry 由 Active
   Official Revisions、Local Heads、Runtime Settings 与 Credential 合成并原子切换不可变 Snapshot。
8. 即梦 CLI 只通过 `DreaminaCliRunner` 使用，不再有 account-cli-bridge。
9. 前端永远拿我们的资产 URL，不拿第三方临时 CDN URL。
10. 改行为必须同步相关 docs。

## 4. 模型可用性定义

模型必须同时满足以下可用性门禁：

- 当前 Model Revision 为 `active|deprecated`，且对应 `model_settings.enabled=true`
- 当前 Provider Revision 存在，且对应 `provider_installations.enabled=true`
- 至少一个模型允许的当前 Channel Revision 对应 `channel_installations.enabled=true`，并且该 Channel 下
  存在 `enabled=true` 的 Credential

Adapter 契约也必须成立。公开模型列表使用相同规则，并额外要求
`model_settings.visibility=public`。可用性不要求 Credential `is_valid=true`，也不因为 `expires_at`
过滤；验证状态是运营提示，不是可用性门禁。所有 Task 创建时固定模型与费率 Revision；真实分发后
还会固定精确 Channel Revision/Route/Credential。Poll、Cancel 与恢复不重新选路，目录更新不改变
任务语义。

当前 Beta 只接受全新的 Catalog-native 数据库，不读取此前的模型行或任务记录。部署该基线时必须
使用新 PostgreSQL 数据卷；后续进入结构冻结期后再恢复追加式升级策略。

## 5. 当前阶段

项目已完成模块化单体、画布、任务、资产、Provider/模型管理、账户与 RBAC 等主要骨架，
目前处于公开 Beta 前的链路收口阶段。历史实施清单不属于公开规范；当前状态和后续优先级
统一维护在 [roadmap.md](./roadmap.md)。

当前焦点：

- 画布 / UX 迭代
- 用户体系 + RBAC 后续完善
- provider / adapter / agent 结构继续补齐
- Bailian DashScope 图像/视频真实调用
- 简单可靠的注册登录与生产部署验证

## 6. 文档地图

| 文档                      | 角色                             |
| ------------------------- | -------------------------------- |
| `docs/architecture.md`    | 服务边界、DB schema、Redis、部署 |
| `docs/api-conventions.md` | API 命名、鉴权、端点             |
| `docs/task-lifecycle.md`  | 任务状态机、轮询、取消、资产     |
| `docs/adapter-guide.md`   | provider / adapter / model 扩展  |
| `docs/model-catalog.md`   | 目录身份、修订、Bundle 与热加载  |
| `docs/node-spec.md`       | 节点、IO、画布交互               |
| `docs/agent-spec.md`      | Agent 与工具调用                 |
| `docs/billing.md`         | 计费与请求日志成本冻结           |
| `docs/design-tokens.md`   | 视觉 token                       |
| `docs/roadmap.md`         | 当前状态、优先级与后续方向       |
| `docs/open-source-deferred.md` | 开源暂隐功能待办与恢复入口   |
| `docs/branding.md`        | 项目命名与品牌使用规范           |

## 7. 目录

```text
apps/
  canvas-web/
  canvas-api/
    src/account/
packages/
  shared-types/
  adapters-contract/
  constraint-engine/
  model-catalog/
  ui-kit/
config/
  model-catalog.yaml
  model-providers/
  schema-templates/
database/migrations/
  account/
  canvas/
  ops/
docs/
```

## 8. Git 策略

- 每个独立功能或 roadmap 切片使用聚焦的分支和 commit。
- `main` 始终可运行。
- 重大重构前打 tag。
