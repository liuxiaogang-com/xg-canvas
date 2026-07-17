# model-providers Codex Guide

本目录是 XG Canvas 官方 Model Catalog 的构建期作者文件，不是运行时配置。改这里时同时遵守
根目录 `AGENTS.md`、`docs/model-catalog.md` 和 `docs/adapter-guide.md`。

## 文件与身份

- `config/model-catalog.yaml` 管理官方 Source 和 Release。
- `model-providers/<provider>/provider.yaml`、`channels.yaml`、`models/*.yaml` 可递归加载。
- 按模型家族或输入模式拆分；每个作者 YAML 强制不超过 200 行。
- Provider、Channel、Model 和 Rate Card 必须使用稳定 `resource_uid` 与从 1 递增的 `revision`。
- 资源改内容必须递增 Revision；同一 Revision 不得对应不同内容。
- `slug` 与公开 `model_id` 创建后不可修改；需要新标识时创建新的 `resource_uid`，并为原资源发布 `retired` Revision。
- 发布内容变化时更新 `release_id`、递增 `sequence` 并更新 `published_at`。

## 契约

- 每个生成模型必须声明有效的 `input_contract`，说明 mode 和素材 slot。
- 真实生成参数放 `param_schema`；结构性素材放 `input_contract`；联动规则放 `param_constraints`。
- `task_types`、`capabilities` 只能使用 shared-types 规范值，不接受历史拼写或同义值。
- `adapter_key` 必须存在于内置 Adapter capability manifest，且支持模型的 task type/调用模式。
- `param_schema` 只接受规范紧凑 Schema；不得添加扁平字段兼容转换。
- inline `pricing` 也是独立 Rate Card，必须有自己的 `resource_uid` 和 `revision`，且只接受 `{ currency, components[] }`。
- Credential、Secret 和部署实际账号永远不能写入作者 YAML 或 Bundle。

## 生命周期与启用

- `active/deprecated` 可接新任务；`retired` 不接新任务但保留历史固定 Revision；`revoked` 阻断历史执行。
- 删除官方资源必须发布稳定 UUID 的 `retired/revoked` Revision，不能从下一 Release 静默遗漏。
- 新官方 Provider、Channel 与 Model 的 Runtime Settings 都默认关闭；凭证向导只启用用户勾选的
  模型及其明确允许的精确 Channel。
- 部署者自定义资源属于 Local Source，不写回本目录。

## 检查

- 修改后运行 `pnpm catalog:check`。
- 需要本地生成 Bundle 时运行 `pnpm catalog:build`；Bundle 是忽略的构建产物，不手工编辑。
- 改供应商能力时同步 Adapter 请求构造、响应解析、契约测试和相关文档。
