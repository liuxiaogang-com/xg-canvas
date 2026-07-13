---
title: XG Canvas 文档
description: 安装、配置并开始使用 XG Canvas（西瓜画布）。
sidebar:
  hidden: true
---

XG Canvas（西瓜画布）是一个面向企业创意团队的开源、自托管 AI 创意生产平台。它把项目、画布、节点、生成任务和资产组织在同一个工作空间中，并提供团队权限、模型凭证、调用日志与成本治理能力。

> XG Canvas 当前处于 Beta。核心结构、配置格式和扩展接口仍可能调整，生产部署前请先阅读版本说明并做好数据备份。

## 从这里开始

1. [了解产品边界](/docs/getting-started/overview/)
2. [安装 XG Canvas](/docs/getting-started/install/)
3. [创建第一张画布](/docs/getting-started/first-canvas/)

## 按角色阅读

- **创作者**：从[项目与资产](/docs/user-guide/projects-and-assets/)和[画布与节点](/docs/user-guide/canvas-and-nodes/)开始。
- **管理员**：阅读[生产部署](/docs/admin/deployment/)和[模型与凭证](/docs/admin/models-and-credentials/)。
- **开发者**：阅读[扩展 XG Canvas](/docs/developer/extensions/)以及仓库中的架构规范。

## 当前状态

已经具备账户与会话、单租户多用户 Workspace、系统级与项目级 RBAC、节点画布、文本/图像/视频模型接缝、剧本与分镜 Beta、持久任务与企业自有资产、模型凭证治理，以及调用和成本观测。

企业 SSO、自定义角色界面、预算配额、音频与转写 Adapter、实时协作、Agent 工具循环、多租户和生产级高可用仍在 Roadmap 中。

## 授权方式

完整 Beta 代码采用 `AGPL-3.0-only` 发布。遵守 AGPL 的组织可以自行部署、修改和扩展；如需保留专有修改、闭源集成、交付客户私有分支，或需要部署、维护和技术支持，可申请单独的商业授权。项目不按功能拆分社区版与企业版。
