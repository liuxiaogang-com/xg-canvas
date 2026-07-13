---
title: 项目与资产
description: 理解 Workspace、Project、Canvas 和 Asset 的关系。
sidebar:
  order: 1
---

## Workspace

Workspace 是用户、项目和全局资产的上层范围。当前版本采用单租户多用户模型。

## Project

Project 聚合一项创意工作的画布、成员、任务和资产。项目成员可以拥有管理员、成员或只读角色。

## Canvas

Canvas 保存节点、连线与快照。画布编辑会持久化，刷新页面后可从后端恢复。

## Asset

图片、视频及其他生成结果会登记为资产。前端只读取 XG Canvas 对象存储返回的 URL，不直接依赖厂商临时 CDN 地址。

资产可以属于工作区，也可以归属具体项目。项目资产更适合保存与当前创作相关的生成结果和参考素材。
