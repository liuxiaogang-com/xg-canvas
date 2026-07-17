# XG Canvas - Codex / AI 协作指南

Codex 会在每次会话/任务启动时自动读取本文件，并按当前工作目录继续读取更深层的 `AGENTS.md`。日常下需求时不需要额外提醒“先读 AGENTS”；如果某类规则长期有效，应写入本文件或更靠近代码目录的 `AGENTS.md`。

## 项目定位

面向企业创意团队的开源、自托管 AI 创意生产与画布平台，产品形态结合 ComfyUI、Dify 与 TapNow 的部分能力。
当前为单租户多用户，后续扩展企业 SSO、配额治理与实时协作。

完整产品代码采用 `AGPL-3.0-only` 发布，并保留独立商业授权路径；不按功能拆分社区版与企业版。Adapter、模型注册表、节点契约、工具调用等对外扩展面要完整、通用、容易 PR；不要为了赶进度把结构做死。

当前阶段是 Beta 开发版，内容和结构仍可大改。现阶段优先把抽象做对、扩展点留好，先不背历史包袱。等核心功能稳定后进入结构冻结期，再引入 DB/Schema 迁移、API 版本化、配置文件升级和向后兼容承诺。改动结构时同步评估未来升级路径。

## 必读文档

进入任何任务前先看：

1. [docs/overview.md](docs/overview.md)
2. [docs/architecture.md](docs/architecture.md)
3. [docs/roadmap.md](docs/roadmap.md)

按修改类型再看：

- 改主题/颜色/间距： [docs/design-tokens.md](docs/design-tokens.md)
- 加节点 / 改 IO 类型： [docs/node-spec.md](docs/node-spec.md)
- 加 Provider / Model： [docs/adapter-guide.md](docs/adapter-guide.md)
- 改模型目录身份、修订、Release 或热加载： [docs/model-catalog.md](docs/model-catalog.md)
- 改 Agent / 工具调用： [docs/agent-spec.md](docs/agent-spec.md)
- 改任务流程 / 重试 / 资产： [docs/task-lifecycle.md](docs/task-lifecycle.md)
- 加 API： [docs/api-conventions.md](docs/api-conventions.md)
- 改预设： [docs/prompt-preset-spec.md](docs/prompt-preset-spec.md)

目录级规则：

- 改后端 / account / adapter： [apps/canvas-api/AGENTS.md](apps/canvas-api/AGENTS.md)
- 改前端 / 节点 / settings： [apps/canvas-web/AGENTS.md](apps/canvas-web/AGENTS.md)
- 改模型 YAML： [config/model-providers/AGENTS.md](config/model-providers/AGENTS.md)
- 改文档： [docs/AGENTS.md](docs/AGENTS.md)

## 技术栈

- 前端：Vite + React 18 + TypeScript；`canvas-web` 用 React Flow + 原生 UI 组件；管理页并入 `/settings`
- 后端：NestJS 单体 `canvas-api`，内含 `src/account` 子系统；即梦 CLI 由 `DreaminaCliRunner` 在 server 内直接 spawn
- 数据：PostgreSQL（三个 schema：`account` / `canvas` / `ops`）、Redis（全局 `xgcanvas:` 前缀）、远程 S3/R2 兼容桶
- Monorepo：pnpm workspaces
- 共享包：`@xgcanvas/shared-types` / `@xgcanvas/adapters-contract` / `@xgcanvas/constraint-engine` / `@xgcanvas/model-catalog` / `@xgcanvas/ui-kit`

## 服务拓扑

```
canvas-web(5180, 含 /settings) -> canvas-api(5181, 含 account 子系统 + Dreamina CLI) -> HTTP 厂商
canvas-api -> PostgreSQL / Redis / 远程 S3/R2
```

不再启动本地对象存储服务；`account-cli-bridge` 已删除；不再维护 `/internal/v1/*` HTTP 调用面。

## 铁律

1. 单文件不超过 400 行，严禁超过 500 行；接近 350 行开始拆分。
2. 模块边界不可越级：
   - 业务模块调模型/厂商必须经过 `account-client` 接缝，不直接 import `src/account/*` 内部实现。
   - 即梦 CLI 统一由 `DreaminaCliRunner` 封装，adapter 通过 DI 注入使用。
   - 前端永远拿我们对象存储的预签名 URL，不拿第三方 CDN。
3. Code-first Adapter + 版本化 Model Catalog：Catalog Revision 是 Provider、Channel、Model 与 Rate Card 的唯一结构真相；官方 YAML 只在构建期编译为确定性 Bundle，运行时由 Active Official Revisions、Local Heads、三张 Runtime Settings 与 Credential 合成一个不可变 Snapshot，禁止直接扫描作者 YAML 或维护结构镜像表。
4. 任务即真相：任何长任务先落 `tasks` 表，刷新页面不丢；worker 用 `SELECT ... FOR UPDATE SKIP LOCKED` 拿单。
5. 资产先落桶：Adapter 拿到第三方结果后必须经 `_shared/asset-downloader` 下载到远程 S3/R2 兼容桶，再返回本地资产描述。
6. Redis 全局前缀是 `xgcanvas:`，所有客户端必须经 `RedisModule`，禁止 `new Redis()`。
7. 模型可用性统一经过 `ModelAvailabilityService`：当前 Model/Provider/允许的 Channel Revision 均可用于新任务，且 `model_settings/provider_installations/channel_installations` 均启用。Live 模式还要求候选 Channel 下存在启用凭证，但不要求凭证校验通过或未过期；Demo 模式只豁免凭证要求。公开列表按当前执行模式应用同一门禁，并额外要求 `visibility=public`。
8. 模型启用规则：新官方资源的 Runtime Settings 默认关闭；凭证向导必须明确绑定一个允许的 Channel，并在同一次 `RegistryBootstrapService.mutateLocal` 事务中保存凭证、导入所选本地模型和启用所选官方模型。本地结构修改只能追加 Revision并原子切换 Snapshot。`slug/model_id` 创建后不可修改；换标识必须创建新资源并 Retire 原资源。
9. 即梦 CLI 必须随 server/Docker 镜像打包，登录态由 volume 持久化；旧 `account-cli-bridge` 相关代码和配置不再恢复。
10. 不主动写 README.md / 中间总结文档，除非用户明确要求。
11. 改行为先改文档：`docs/` 中相关 spec 与代码必须同步。

## 目录结构

```
apps/
├── canvas-web/
└── canvas-api/
    └── src/account/
packages/
├── shared-types/
├── adapters-contract/
├── constraint-engine/
├── model-catalog/
└── ui-kit/
config/
├── model-catalog.yaml
├── model-providers/
└── schema-templates/
database/migrations/{account,canvas,ops}/
docs/
docker-compose.yml + docker-compose.dev.yml
```

## 当前焦点

- 画布 / UX 迭代
- 用户体系 + RBAC，之后再做配额
- provider / adapter / agent 结构搭建
- Bailian / DashScope 真实生图、生视频接入
- 远程 S3/R2 资产链路收口

## UI 与设计同步

- `docs/design-tokens.md`、前端 CSS token 和 `packages/ui-kit` 是公开仓库中的设计依据。
- 改主题、颜色、间距和组件外观时，同步设计 token、共享组件和相关产品文档。
- 不把本地设计草稿或第三方研究快照提交到公开仓库。

## 启动方式

```bash
# 开发栈（源码热加载 + PostgreSQL 18 + Redis 8）
docker compose -f docker-compose.dev.yml up

# 零配置部署栈（CNB latest 应用镜像 + PostgreSQL 18 + Redis 8）
docker compose up -d
```

## 关键环境变量

- `DREAMINA_CLI_PATH`
- `PUBLIC_BASE_URL` / `DEMO_MODE`（可选运行覆盖）
- `CANVAS_API_IMAGE` / `CANVAS_WEB_IMAGE` / `POSTGRES_IMAGE` / `REDIS_IMAGE`（可选镜像覆盖）
- 加密根密钥默认自动生成并持久化到独立 volume；旧 `ENCRYPTION_KEY_V*` 仅用于兼容导入/轮转
- 首次管理员通过 `/setup` 创建，不使用默认账号或 `SETUP_TOKEN`
- 对象存储与 Provider 凭证统一在 `/settings` 配置，不从 env 读取

## Git 策略

- 每个独立功能或 roadmap 切片一 commit
- 主干 `main` 始终可运行
- Git commit 使用当前操作者自行配置的人类 Git 身份；不得自动修改 `user.name` / `user.email`，也不得冒用其他人的身份。
- commit 标题、正文和 trailer 不写 Claude、Codex 或其他 AI 工具，不添加 AI `Co-authored-by` 或 `Generated with`。

## Codex 自动化约定

- 重复流程优先沉淀到 `.agents/skills/`，不要把长流程塞进根 `AGENTS.md`。
- 用户指出反复出现的问题时，应把稳定规则写回最贴近的 `AGENTS.md`。
- 需要强制执行的规则优先用 lint/test/hook/CI 兜底，`AGENTS.md` 只写人类可读的协作约定。

## Multi-agent policy

For non-trivial tasks, first classify complexity.

Use a single agent for:

- simple Q&A
- small one-file edits
- mechanical changes with clear scope

Use subagents when the task is:

- cross-module
- bug investigation with unclear root cause
- PR/code review
- security-sensitive
- requires docs research
- likely to need more than 3-5 files or multiple hypotheses

When using subagents:

- keep write-heavy work in the main agent unless explicitly requested
- use read-only subagents for exploration, testing, docs, and review
- wait for all subagents and return a consolidated summary
