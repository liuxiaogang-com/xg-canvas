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

M6 之后为模块化单体：

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
3. Adapter 协议层 code-first；模型清单为 YAML preset 与 DB manual 双源注册表。
4. 任务即真相：长任务先落 `canvas.tasks`，使用 `SELECT ... FOR UPDATE SKIP LOCKED` 拿单。
5. 资产先落我们的远程 S3/R2：adapter 拿到第三方 URL 后必须经 downloader 转存。
6. Redis 全局前缀为 `xgcanvas:`，所有客户端必须经 `RedisModule`。
7. 模型注册表 = preset YAML ∪ manual DB；manual 不被 reload 覆盖。
8. 即梦 CLI 只通过 `DreaminaCliRunner` 使用，不再有 account-cli-bridge。
9. 前端永远拿我们的资产 URL，不拿第三方临时 CDN URL。
10. 改行为必须同步相关 docs。

## 4. 可用模型定义

“可用模型”统一定义为：

- model row enabled
- provider enabled
- provider 下存在 enabled channel
- channel 下存在 enabled credential

不要求 credential `is_valid=true`，也不因为 `expires_at` 过滤。验证状态是运营提示，不是可用性门禁。

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
  ui-kit/
config/
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
