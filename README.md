# XG Canvas｜西瓜画布

> 把分散的模型、素材与创作流程，收进企业自己的 AI 生产画布。

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-14b8a6.svg)](./LICENSE)
![Status: Beta](https://img.shields.io/badge/Status-Beta-f59e0b.svg)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-5fa04e.svg)

**XG Canvas（西瓜画布）**是一款面向企业创意团队的开源、自托管 AI 创意生产平台。它将项目、脚本、角色、场景、分镜、多模型生成任务和创意资产组织在同一张可扩展画布中，同时提供模型凭证、角色权限、任务追踪、调用日志与成本治理能力。

企业真正缺的往往不是另一个生成入口，而是一套能把创作上下文、模型调用、权限、成本和资产归属连接起来的生产系统。

XG Canvas 的核心差异是 **BYOK（企业自带模型凭证）+ 自托管 + 团队权限 + 可定制工作流**：成员使用各自的平台账户协作，管理员统一配置企业的模型凭证，团队不需要共享厂商登录账号；生成费用直接发生在企业自己的模型供应商账户中，让成本更接近真实调用量，而不是被固定席位和预付平台额度锁定。

> [!WARNING]
> XG Canvas 当前处于 Beta 阶段。核心架构与主要产品链路已经建立，部分真实模型调用、生产部署和企业增强能力仍在验证或规划中。接口、配置和数据结构在稳定版前可能调整，暂不建议直接用于关键生产业务。

## 项目地址

| 入口            | 地址                                                                                 | 用途                                 |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------ |
| GitHub          | [github.com/liuxiaogang-com/xg-canvas](https://github.com/liuxiaogang-com/xg-canvas) | 源码、Issue 与后续协作入口           |
| CNB（国内访问） | [cnb.cool/liuxiaogang/xg-canvas](https://cnb.cool/liuxiaogang/xg-canvas)             | 代码仓库、自动构建记录与 Docker 制品 |

正式部署默认从 CNB 公开制品库拉取应用镜像；从 GitHub 或 CNB 获取的同版本代码均可用于
本地开发。问题反馈可提交到 [GitHub Issues](https://github.com/liuxiaogang-com/xg-canvas/issues)
或 [CNB Issues](https://cnb.cool/liuxiaogang/xg-canvas/-/issues)。

## 为什么需要 XG Canvas

| 企业痛点                                              | XG Canvas 的处理方式                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| 团队套餐按席位收费，共享一个厂商账号又容易互相挤下线  | 每位成员使用独立的 XG Canvas 账户，在权限范围内共享企业模型能力          |
| 平台会员和预付额度可能在淡季闲置，旺季又不够用        | 连接企业自己的模型 API，生成成本随实际调用量变化，不额外购买平台生成额度 |
| SaaS 工作流和节点由平台决定，业务变化只能等待产品更新 | 工作流、节点、Adapter、模型路由和内部业务集成都可以配置或二次开发        |
| 脚本、提示词、参考素材和生成结果散落在不同工具        | 让脚本、实体、分镜、任务和资产围绕项目持续沉淀                           |
| 成员各自保存 API Key，模型配置重复且难以治理          | 集中管理 Provider、渠道、凭证、模型和功能默认模型                        |
| 图像和视频任务耗时长，刷新后失联，失败难排查          | 任务先持久化，提供状态追踪、取消、重试和错误记录                         |
| 生成结果停留在第三方临时链接                          | 自动转存至企业自己的 S3 / R2 兼容对象存储                                |
| 系统管理员、项目负责人、成员和访客权限混在一起        | 分离系统级与项目级 RBAC，并支持只读画布                                  |
| 不知道哪个项目、成员和模型消耗了多少预算              | 按模型、成员和项目聚合调用、用量与历史成本                               |
| 创意方法依赖个人经验，难以复制给整个团队              | 用节点、实体、预设和分镜把方法沉淀为可复用流程                           |

## 一条完整的创意生产链路

```text
想法 / 剧本 / 提示词
        ↓
角色 · 场景 · 道具 · 项目上下文
        ↓
结构化分镜与节点工作流
        ↓
文本 · 图像 · 视频 · 音频生成任务
        ↓
企业自有资产库与可追踪交付
```

XG Canvas 面向品牌、营销、影视、短剧、广告、电商内容和创意技术团队。它不是单纯的模型调用界面，而是用于组织整个创意生产过程的团队工作台。

它希望站在两类产品之间：比面向个人和技术用户的节点引擎更适合团队日常生产；比封闭的通用创作 SaaS 更可控、更可定制，也更接近企业实际承担的模型成本。

## 企业功能清单

状态说明：

- ✅ **已实现**：主要前后端链路已经落地，但仍属于整体 Beta。
- 🧪 **Beta / 验证中**：已有实现，仍需真实厂商、规模或生产环境验证。
- 🗺️ **规划中**：已进入产品方向或技术路线，尚不能作为现有能力使用。

### 项目、画布与内容生产

| 状态 | 功能                                                                       |
| ---- | -------------------------------------------------------------------------- |
| ✅   | 项目创建、编辑、归档、检索与项目成员管理                                   |
| ✅   | React Flow 无限画布，支持节点、连线、复制、删除与自动保存                  |
| ✅   | 画布快照、历史版本和恢复                                                   |
| ✅   | 节点输入输出类型校验与连接约束                                             |
| 🧪   | 公开画布当前开放素材上传、图像生成和视频生成；实际能力取决于模型与 Adapter |
| 🗺️   | 文本 / 音频生成及脚本、角色、场景、道具、分镜等入口分批恢复                |
| 🗺️   | 分镜表格批量编辑、批量生成与审核体验                                       |
| 🗺️   | 在提示词中通过 `@` 引用节点、实体和资产上下文                              |
| 🗺️   | 团队工作流模板、版本发布、审批和复用市场                                   |

### 身份、成员与 RBAC

| 状态 | 功能                                                                    |
| ---- | ----------------------------------------------------------------------- |
| ✅   | 本地账户注册、密码登录、退出、会话续期与当前用户查询                    |
| ✅   | 登录设备查看与指定会话撤销                                              |
| ✅   | 单租户多用户 Workspace                                                  |
| ✅   | 系统级 + 项目级 RBAC                                                    |
| ✅   | IT 超管、系统管理员、项目管理员、项目成员和游客五种内置角色             |
| ✅   | 组件级权限控制、只读画布和最后一个超级管理员保护                        |
| 🧪   | 邮箱验证码、Magic Link、手机号及 OAuth 身份流程；生产使用需配置对应渠道 |
| 🗺️   | 自定义角色管理界面                                                      |
| 🗺️   | OIDC、SAML、LDAP 企业 SSO 与 SCIM 用户同步                              |
| 🗺️   | 多组织、多 Workspace 与多租户治理                                       |

### Provider、模型与凭证治理

| 状态 | 功能                                                      |
| ---- | --------------------------------------------------------- |
| ✅   | Provider / Channel / Credential / Model 统一数据模型      |
| ✅   | AES-GCM 凭证加密、版本化密钥和重新加密                    |
| ✅   | YAML 预置模型 + 数据库手动模型的双源注册表                |
| 🧪   | `/settings` 管理 Provider、渠道、凭证、模型和功能模型配置 |
| 🧪   | 凭证验证、余额查询、厂商模型发现与导入                    |
| 🧪   | 模型输入契约、动态参数、参考素材插槽和候选通道故障切换    |
| 🧪   | OpenAI Compatible、百炼 / DashScope、豆包和即梦 CLI 接缝  |
| 🗺️   | 基于成本、延迟、健康度和业务优先级的企业模型路由          |
| 🗺️   | Vault、KMS 与企业 Secrets Manager 接入                    |

### 任务、资产与生产可靠性

| 状态 | 功能                                                                 |
| ---- | -------------------------------------------------------------------- |
| ✅   | 持久化异步任务，刷新页面后仍可继续追踪                               |
| ✅   | `pending / queued / running / succeeded / failed / cancelled` 状态机 |
| ✅   | 用户取消、失败重试、退避和多 Worker 安全取单                         |
| ✅   | 项目资产库与 Workspace 资产库                                        |
| ✅   | S3 / R2 兼容对象存储和预签名访问 URL                                 |
| ✅   | 素材预签名直传、缩略图、可见性、收藏，以及人物 / 音色 / 风格资源库   |
| ✅   | 第三方生成结果下载、大小限制、SHA-256 与自有存储归档                 |
| 🗺️   | 厂商训练音色、授权人像等 Provider 资源绑定与验证 UI                  |
| 🗺️   | 资产生命周期、去重、冷归档与清理策略                                 |
| 🗺️   | 独立 Worker、分布式队列和弹性扩缩容                                  |

### 成本、日志与运营治理

| 状态 | 功能                                                  |
| ---- | ----------------------------------------------------- |
| ✅   | 按 Provider、模型、通道和凭证记录请求结果、错误与用量 |
| ✅   | 请求发生时冻结历史费率，后续改价不回写历史成本        |
| ✅   | 按模型、成员和项目聚合成本                            |
| ✅   | 日志查看、清理和权限隔离                              |
| 🧪   | 脱敏请求 / 响应摘要与 AI 辅助失败诊断                 |
| 🗺️   | 用户、项目和模型预算，软提醒、硬阻断与异常告警        |
| 🗺️   | 审计日志查询、导出、留存策略及 SIEM 集成              |

### Agent、协作与交付

| 状态 | 功能                                               |
| ---- | -------------------------------------------------- |
| 🧪   | 持久化 AI 对话与 SSE 流式回复                      |
| 🧪   | 基于画布上下文生成一次性结构化 Patch，辅助修改节点 |
| 🗺️   | Agent 工具调用循环、任务执行和结果回填画布         |
| 🗺️   | 多人实时协作、在线状态、光标与冲突处理             |
| 🗺️   | 评论、批注、审核流和交付确认                       |
| 🗺️   | 企业内部节点、Provider、数据源和业务系统集成模板   |

### 私有化部署与运维

| 状态 | 功能                                                  |
| ---- | ----------------------------------------------------- |
| ✅   | 模块化单体，降低初期部署和运维复杂度                  |
| ✅   | PostgreSQL、Redis 和 S3 / R2 均可使用企业自有基础设施 |
| ✅   | 服务健康检查和外部数据库 / Redis 接入                 |
| 🧪   | Docker Compose 私有部署                               |
| 🗺️   | Kubernetes / Helm、高可用和滚动升级                   |
| 🗺️   | 备份恢复、灾备手册和无停机迁移治理                    |
| 🗺️   | Prometheus、OpenTelemetry 和企业可观测性              |

## 架构概览

```text
canvas-web (React + React Flow + /settings)
        │
        │ REST / SSE
        ▼
canvas-api (NestJS 模块化单体)
        ├── 账户、身份与 RBAC
        ├── 项目、画布、任务与资产
        ├── Provider、凭证、模型注册表与 Adapter
        ├── 请求日志、成本与 Agent
        ├── PostgreSQL
        ├── Redis
        └── 企业自有 S3 / R2 兼容对象存储
```

扩展面包括 Adapter、模型 YAML、节点契约、输入输出类型、Prompt Preset 和 Agent 工具规范。详细设计见 [`docs/`](./docs/)。

## 技术栈

| 层次       | 主要技术                                                |
| ---------- | ------------------------------------------------------- |
| Web        | React 18、TypeScript、Vite、React Flow                  |
| API        | NestJS、TypeORM                                         |
| 数据与存储 | PostgreSQL 18、Redis 8、S3 / R2 兼容对象存储            |
| 工程与部署 | Node.js 22、pnpm workspaces、Docker Compose、Nginx、CNB |
| 官网与文档 | Astro、Starlight                                        |

## 本地启动

### 环境要求

- Node.js `>= 22.12`
- pnpm `>= 9`
- Docker 与 Docker Compose

### 开发模式

可从任一公开仓库获取源码。

GitHub：

```bash
git clone https://github.com/liuxiaogang-com/xg-canvas.git
cd xg-canvas
```

中国大陆网络环境也可以使用 CNB：

```bash
git clone https://cnb.cool/liuxiaogang/xg-canvas.git
cd xg-canvas
```

获取源码后启动开发栈：

```bash
docker compose -f docker-compose.dev.yml up --build
```

开发编排无需 `.env`，会启动 PostgreSQL、Redis、自动迁移、API 与 Web，并在独立持久卷中
自动生成加密根密钥。首次打开 `http://localhost:5180` 会进入 `/setup` 创建首位管理员；
对象存储和 Provider 凭证随后在后台配置。

### 发布镜像部署

正式编排无需 `.env`，默认从 CNB 公开制品库拉取以下应用镜像，并在同一项目网络中启动
PostgreSQL 18、Redis 8、数据库迁移、API 与 Web：

```text
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-api:latest
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-web:latest
```

这些镜像由 [CNB 仓库](https://cnb.cool/liuxiaogang/xg-canvas)的 `main` 构建流水线生成；公开部署
目前统一使用持续更新的 `latest` 标签。当前只构建 `linux/amd64`，ARM 设备尚未完成兼容验证。
首次部署或更新时执行：

```bash
docker compose pull
docker compose up -d
```

宿主机只暴露 `http://localhost:5180`；数据库、Redis 与 API 不占用宿主机端口。首次打开同样会
进入 `/setup`。Compose 已对应用镜像设置 `pull_policy: always`，重新部署时会检查并拉取最新
制品。Beta 阶段升级前仍应备份 PostgreSQL、对象存储和 `encryption-data` 卷。

对象存储和 Provider 凭证随后在后台配置。请阅读：

- [架构说明](./docs/architecture.md)
- [API 约定](./docs/api-conventions.md)
- [Adapter 扩展指南](./docs/adapter-guide.md)
- [节点规范](./docs/node-spec.md)
- [任务生命周期](./docs/task-lifecycle.md)

## Roadmap

> 以下是产品方向，不承诺具体版本或日期；完成状态以
> [完整 Roadmap](./docs/roadmap.md) 为准。暂未开放的 UI 入口见
> [开源首发暂隐清单](./docs/open-source-deferred.md)。

公开 Beta：

- 跑通百炼 / DashScope、豆包等真实图像和视频生成链路。
- 完成生产镜像、安装升级、备份恢复和故障排查验证。
- 补齐首个工作流、对象存储 CORS 和 Provider 配置文档。
- 建立稳定的 CI、集成测试和发布追溯能力。

团队生产：

- 工作流模板、版本、发布、审批和团队复用。
- 项目 / 成员 / 模型预算，以及基于成本和健康度的模型路由。
- WebSocket 任务进度、剧本导入和完整的 Agent 工具调用循环。
- 人物、音色、风格等资源的版本、绑定和跨项目复用。

企业规模化与开放生态：

- OIDC、SAML、LDAP、SCIM、多 Workspace 与组织目录同步。
- 实时多人协作、评论、审核流和交付确认。
- 标准化 Node / Adapter 扩展包、示例工程与契约一致性测试。
- 外部密钥系统、独立 Worker、高可用、监控告警与灾备。
- 企业内部系统、数据源和模型平台集成。

## 开源致谢与产品灵感

XG Canvas 的产品形态受到 [ComfyUI](https://github.com/comfy-org/comfyui)、
[Dify](https://github.com/langgenius/dify) 与 [TapNow](https://tapnow.ai) 的启发。这里仅表达对其
产品与社区工作的尊重，不代表存在官方关联或背书。

项目建立在众多优秀的开源软件之上，特别感谢 [React](https://react.dev)、
[React Flow / xyflow](https://reactflow.dev)、[NestJS](https://nestjs.com)、
[TypeORM](https://typeorm.io)、[PostgreSQL](https://www.postgresql.org)、
[Redis](https://redis.io)、[Vite](https://vite.dev)，以及用于官网与文档的
[Astro](https://astro.build) / [Starlight](https://starlight.astro.build)。

## 开源与商业授权

XG Canvas 的完整 Beta 代码采用 [GNU AGPL v3](./LICENSE)（`AGPL-3.0-only`）发布。AGPL 允许个人和企业使用、修改与商业部署；分发修改版或通过网络向用户提供修改后的程序时，需要遵守许可证规定的相应源码提供义务。

项目不拆分功能受限的“社区版”。公开项目与商业交付基于同一套产品代码：

- 遵守 AGPL 的团队可以自行部署、研究、修改和扩展。
- 需要保留专有修改、进行闭源集成、交付客户私有分支，或获得部署、维护与技术支持的组织，可以申请单独的商业许可证。
- 客户专属工作流、内部节点、Provider 和业务系统集成可以通过私有分支交付。

商业授权、企业定制与合作请联系
[git@liuxiaogang.com](mailto:git@liuxiaogang.com)。

## 贡献

项目当前由作者个人主导开发，暂时不接受外部代码或文档 PR，只接受 Issue、问题反馈和产品建议。未经事先确认提交的 PR 暂不评审或合并。

欢迎通过 [GitHub Issues](https://github.com/liuxiaogang-com/xg-canvas/issues) 或
[CNB Issues](https://cnb.cool/liuxiaogang/xg-canvas/-/issues) 提交使用问题、需求场景、模型适配
建议和企业工作流设想。未来开放外部贡献前，项目会先发布经法律复核的贡献协议与接受流程。

## 内测、交流与支持

### 内测微信群

项目计划分批开展内测。微信群二维码有有效期，不保证 README 中的入口长期有效；群二维码
过期、暂未展示或无法加入时，可以添加个人微信 `CN-LXG`，备注 `XG Canvas 内测`，并简单
说明你的使用场景，申请或了解后续内测群。

产品问题、Bug 和可公开讨论的需求请提交到
[GitHub Issues](https://github.com/liuxiaogang-com/xg-canvas/issues) 或
[CNB Issues](https://cnb.cool/liuxiaogang/xg-canvas/-/issues)，便于长期追踪。

### 支持项目

如果 XG Canvas 对你有帮助，可以自愿支持项目的持续开发。赞助不附带功能优先级、技术支持、
商业授权或其他对价；企业服务与商业合作请通过邮箱单独联系。

<img src="https://static.liuxiaogang.com/xg-canvas/readme-img/wx-zanshang.jpg" alt="微信赞赏码" width="180" />

### 联系方式

- 内测与微信交流：`CN-LXG`
- 商务合作、商业授权与企业定制：[git@liuxiaogang.com](mailto:git@liuxiaogang.com)
- 公开问题与产品建议：[GitHub Issues](https://github.com/liuxiaogang-com/xg-canvas/issues) / [CNB Issues](https://cnb.cool/liuxiaogang/xg-canvas/-/issues)
- 作者网站：[liuxiaogang.com](https://liuxiaogang.com)

## 作者与品牌

Created by [Liu Xiaogang / 刘小刚](https://liuxiaogang.com).

项目由 LXG 维护，并在 Claude Code 与 OpenAI Codex 辅助下开发；架构决策、代码审查、测试与
最终发布责任由维护者承担。

**XG Canvas**、**西瓜画布**及相关 Logo 是项目品牌标识。软件许可证不自动授予商标或品牌使用权。
