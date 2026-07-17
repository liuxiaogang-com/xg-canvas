---
title: 模型与凭证
description: 管理 Provider、渠道、凭证和模型注册表。
sidebar:
  order: 2
---

## 层级关系

```text
Provider
├── Channel ── Credential
└── Model Offering ── allowed Channel(s)
                    └── Rate Card Revision
```

## 可用模型

Live 与 Demo 都要求当前 Model、Provider 和允许的 Channel Revision 可用于新任务，并且三类运行时
设置已启用。Live 还要求候选 Channel 下存在启用凭证；Demo 只豁免凭证要求。公开模型列表按当前
实例模式使用同一门禁，并额外要求 `visibility=public`。

Live 下的凭证验证结果用于运营提示，不直接作为模型可用性的门禁。实际调用是否成功仍取决于厂商、网络、额度和凭证状态。

## 官方与本地资源

- **Official Revision**：由项目作者的 YAML 在构建期编译进 Catalog Bundle，再按 Release 激活。
- **Local Revision**：部署者通过后台创建、派生或从厂商模型列表导入。

两类 Revision 与运行时设置、凭证共同生成一个不可变 Snapshot。`resource_uid` 是稳定身份，
结构修改只会追加 Revision；运行时不会直接重读 YAML，也不存在 Provider/Model 结构镜像表。

凭证必须绑定一个明确的 Channel。接入向导会在一个事务中启用 Provider/Channel、保存凭证、
导入用户勾选的厂商模型，并只启用用户勾选且允许该精确 Channel 的官方模型；任一步失败都会
全部回滚。

## 安全建议

- 不在文档、截图或 Issue 中暴露真实凭证。
- 定期轮换加密密钥与厂商密钥。
- 只给需要的管理员授予凭证管理权限。
