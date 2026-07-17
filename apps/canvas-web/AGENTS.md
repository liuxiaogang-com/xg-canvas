# canvas-web Codex Guide

本目录是 Vite + React 18 + TypeScript 前端，包含画布和 `/settings` 管理页。改这里时同时遵守根目录 `AGENTS.md`。

## 必读路由

- 改节点定义、IO、表单：先读 `docs/node-spec.md`。
- 改视觉 token、颜色、间距：先读 `docs/design-tokens.md`。
- 改 preset 交互：先读 `docs/prompt-preset-spec.md`。
- 改 settings 中模型/凭证/供应商：同时读 `docs/model-catalog.md` 和 `docs/adapter-guide.md`。

## 前端边界

- 前端只使用我们后端返回的资产 URL / 预签名 URL，不直接展示第三方 CDN。
- 节点执行时结构性素材使用 `inputs.references[]`，不要恢复旧的 `reference_images` 输入结构。
- 模型模式 tab 使用 `input_contract.modes[].id` 的规范 mode。
- 参数控件来自所选模型 `param_schema + param_constraints` 推导，不按节点类型硬编码厂商参数。
- 管理页属于 `/settings`，不要恢复独立 account-admin。

## UI 约定

- 操作按钮优先使用清晰图标或 icon+text，不做纯装饰卡片。
- 工具型界面保持密度、可扫描和稳定布局，避免营销页式 hero。
- 文本必须在移动端和桌面端都不溢出、不互相遮挡。
- 改 UI 行为时同步 docs；除非用户明确要求，不改 `.pen`。

## 验证

- 前端改动后跑：`pnpm --filter @xgcanvas/canvas-web build`。
- 类型或节点契约改动后确认 `apps/canvas-web/src/api/model.ts` 与后端 schema 返回一致。

