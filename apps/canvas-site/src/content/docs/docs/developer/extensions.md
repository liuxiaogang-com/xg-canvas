---
title: 扩展 XG Canvas
description: 了解 Adapter、Model Catalog 和节点契约的扩展入口。
sidebar:
  order: 1
---

XG Canvas 为模型厂商、模型定义、节点和 Agent 工具保留了扩展边界。

## 添加 Provider 或模型

官方 Provider、Channel、Model 与 Rate Card 在 `config/model-providers/` 中按 YAML 维护，
构建时编译成确定性的 Catalog Bundle。运行时由 Active Official Revisions、Local Heads、三张
Runtime Settings 与 Credential 合成不可变 Snapshot；API 进程不会直接扫描 YAML。

添加厂商时必须同步实现对应 Adapter，并显式声明 Provider/Channel 支持的 `adapter_keys`、
Model 使用的 `adapter_key` 和非空允许 Channel。不要从模型名称猜测能力或调用协议。

## 实现 Adapter

Adapter 契约位于 `@xgcanvas/adapters-contract`。业务模块不会直接调用厂商实现，而是通过
`account-client` 接缝执行。Adapter 只处理协议；Catalog Revision 才是结构与能力真相。

厂商返回的图片或视频必须先下载到部署者自己的 S3/R2 兼容存储，再向前端提供资产 URL。

## 添加节点

节点输入输出遵循统一类型系统和连接规则。增加节点或修改 IO 类型前，请阅读仓库中的 `docs/node-spec.md`。

## 开发规范

详细架构、Adapter、任务生命周期和 API 规范目前保存在主仓库的 `docs/` 中。这些文档是开发契约，公开使用文档不会替代它们。
