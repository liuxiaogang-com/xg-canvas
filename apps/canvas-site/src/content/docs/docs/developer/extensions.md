---
title: 扩展 XG Canvas
description: 了解 Adapter、Provider、模型 YAML 和节点契约的扩展入口。
sidebar:
  order: 1
---

XG Canvas 为模型厂商、模型定义、节点和 Agent 工具保留了扩展边界。

## 添加 Provider 或模型

预置模型来自 `config/model-providers/` YAML，运行时再与数据库中的手动模型合并。添加厂商时，应同步实现对应 Adapter，并保持模型能力与 Adapter 能力一致。

## 实现 Adapter

Adapter 契约位于 `@xgcanvas/adapters-contract`。业务模块不会直接调用厂商实现，而是通过账户模块的调用接缝执行。

厂商返回的图片或视频必须先下载到部署者自己的 S3/R2 兼容存储，再向前端提供资产 URL。

## 添加节点

节点输入输出遵循统一类型系统和连接规则。增加节点或修改 IO 类型前，请阅读仓库中的 `docs/node-spec.md`。

## 开发规范

详细架构、Adapter、任务生命周期和 API 规范目前保存在主仓库的 `docs/` 中。这些文档是开发契约，公开使用文档不会替代它们。
