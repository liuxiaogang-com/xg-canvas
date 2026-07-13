---
title: 模型与凭证
description: 管理 Provider、渠道、凭证和模型注册表。
sidebar:
  order: 2
---

## 层级关系

```text
Provider
└── Channel
    ├── Credential
    └── Model mapping
```

## 可用模型

当前运行时把“可用模型”定义为：模型和 Provider 已启用，并且 Provider 下存在已启用的渠道与凭证。

凭证验证结果用于运营提示，不直接作为模型可用性的门禁。实际调用是否成功仍取决于厂商、网络、额度和凭证状态。

## 双源注册表

- **Preset**：来自 `config/model-providers/` 中的 YAML。
- **Manual**：通过后台创建或从厂商模型列表导入。

两类模型合并到同一个运行时注册表。重新加载预设不会覆盖手动模型。

## 安全建议

- 不在文档、截图或 Issue 中暴露真实凭证。
- 定期轮换加密密钥与厂商密钥。
- 只给需要的管理员授予凭证管理权限。
