# model-providers Codex Guide

本目录是预置模型 YAML，属于开源扩展面。改这里时同时遵守根目录 `AGENTS.md` 和 `docs/adapter-guide.md`。

## YAML 规则

- 每个生成模型必须声明 `input_contract`，说明支持的 `mode` 和需要的素材 `slot`。
- `param_schema` 只放真实生成参数，例如尺寸、比例、时长、seed、风格等。
- 参考图、首尾帧、参考音频、源视频等结构性输入放在 `input_contract`，不要放回 `param_schema`。
- `task_types` 和 `capabilities` 必须使用 `packages/shared-types/src/model-vocabulary.ts` 中的规范值。
- provider 的 adapter key 要能在后端 adapter registry 中找到。

## Preset / Manual

- preset YAML 可社区 PR 扩展；manual 模型走 DB。
- preset reload 可以刷新 DB 中 `source=preset` 行；不得覆盖 `source=manual` 行。
- 凭证向导只启用用户勾选的 preset，不做 provider 全量自动启用。

## 检查

- 改 YAML 后检查 YAML 语法和 registry validator。
- 改新增字段时同步 `apps/canvas-api/src/account/config-sync/config-sync.types.ts`、manifest validator、docs。
- 改供应商能力时同步对应 adapter 请求构造和测试。

