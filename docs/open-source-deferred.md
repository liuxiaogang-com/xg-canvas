# 开源暂隐功能待办

> 为公开 Beta / 开源首发，避免用户看到未完成能力，以下功能在 UI 中**暂时隐藏**。
> 代码与 schema **保留，禁止删除**；恢复时按「恢复入口」操作，并同步本清单勾选状态。
>
> 最后更新：2026-07-13

## 原则

1. **UI 只暴露已可用能力**；规划写在 roadmap / 本清单，不在产品面上挂「开发中」假按钮。
2. `NODE_REGISTRY`、各节点 `schema.pillActions`、Mention / DetailPanel 实现均保留，只做入口门禁。
3. 衍生工具（扩图、抠图、切镜等）恢复前，需先有**设置页可配置对应模型 / 是否已配置**，再接线独立 task，而不是复用普通「重新生成」。

---

## 1. 加节点菜单（Palette）

**现状可见：** 上传素材、图片生成、视频生成

**门禁：** [`apps/canvas-web/src/nodes/registry.ts`](../apps/canvas-web/src/nodes/registry.ts) → `PALETTE_TYPES` / `isPaletteType`

**关联：** 拖线新建候选（`connect-helpers.ts`）、快捷键（见下）

| 状态 | 类型               | 说明                                       | 恢复方式                  |
| ---- | ------------------ | ------------------------------------------ | ------------------------- |
| [ ]  | `gen_text`         | 文本生成交互与结果链路未理顺，暂不开放新建 | 取消 `PALETTE_TYPES` 注释 |
| [ ]  | `gen_audio`        | 音频生成交互与模型能力未收口               | 同上                      |
| [ ]  | `audio_transcribe` | 语音识别链路未完成                         | 同上                      |
| [ ]  | `script_input`     | 脚本提取 / 分镜流水线未完成                | 同上                      |
| [ ]  | `entity_character` | 角色实体依赖脚本流水线                     | 同上                      |
| [ ]  | `entity_scene`     | 场景实体依赖脚本流水线                     | 同上                      |
| [ ]  | `entity_prop`      | 物品实体依赖脚本流水线                     | 同上                      |
| [ ]  | `storyboard_shot`  | 分镜节点与表格视图未完成                   | 同上                      |
| [ ]  | `grid`             | 宫格编排交互未完成                         | 同上                      |

**快捷键一并隐藏：** [`CanvasView.tsx`](../apps/canvas-web/src/canvas/CanvasView.tsx)

| 状态 | 快捷键                           | 目标              |
| ---- | -------------------------------- | ----------------- |
| [ ]  | `create.text` → `gen_text`       | 恢复 handler 注释 |
| [ ]  | `create.audio` → `gen_audio`     | 恢复 handler 注释 |
| [ ]  | `create.script` → `script_input` | 恢复 handler 注释 |

---

## 2. 节点工具条 / BottomPill 衍生操作

**现状可见：** 仅 `regenerate`（重新生成）

**门禁：**

- [`NodeToolbar.tsx`](../apps/canvas-web/src/canvas/node-toolbar/NodeToolbar.tsx) → `VISIBLE_PILL_ACTION_IDS`
- [`BottomPill.tsx`](../apps/canvas-web/src/canvas/bottom-pill/BottomPill.tsx) → 同名白名单（需与 Toolbar 保持同步）

**说明：** schema 里仍声明完整 `pillActions`；当前点击非 regenerate 项原先会误走普通 `runner.submit`，故开源时不展示。

### 2.1 图片生成 `gen_image`

| 状态 | id           | 标签      | 恢复前提（摘要）                             |
| ---- | ------------ | --------- | -------------------------------------------- |
| [x]  | `regenerate` | 重新生成  | 已开放                                       |
| [ ]  | `outpaint`   | 扩图      | 设置页绑定扩图模型 + 独立 task               |
| [ ]  | `bg_remove`  | 抠图      | 设置页绑定抠图模型 + 独立 task               |
| [ ]  | `upscale`    | 高清化    | 设置页绑定超分模型 + 独立 task               |
| [ ]  | `edit`       | 编辑/重绘 | 重绘工作流 + 模型配置（非 DetailPanel 占位） |

### 2.2 视频生成 `gen_video`

| 状态 | id              | 标签     | 恢复前提（摘要）               |
| ---- | --------------- | -------- | ------------------------------ |
| [x]  | `regenerate`    | 重新生成 | 已开放                         |
| [ ]  | `split_shots`   | 切镜     | 切镜算法 / 服务 + 结果写回画布 |
| [ ]  | `frame_capture` | 截帧     | 截帧派生图片节点链路           |
| [ ]  | `upscale`       | 高清化   | 视频超分模型配置 + 独立 task   |

### 2.3 文本生成 `gen_text`（节点本身也在菜单隐藏）

| 状态 | id           | 标签     | 恢复前提（摘要）                              |
| ---- | ------------ | -------- | --------------------------------------------- |
| [ ]  | `regenerate` | 重新生成 | 随节点开放；先理顺文本结果展示与任务回写      |
| [ ]  | `rewrite`    | 改写     | 专用 prompt/mode 或独立 task，非裸 regenerate |
| [ ]  | `translate`  | 翻译     | 同上                                          |
| [ ]  | `summarize`  | 摘要     | 同上                                          |

### 2.4 音频生成 `gen_audio`（节点本身也在菜单隐藏）

| 状态 | id             | 标签                   |
| ---- | -------------- | ---------------------- |
| [ ]  | `regenerate`   | 重新生成（随节点开放） |
| [ ]  | `switch_voice` | 换嗓音                 |

### 2.5 脚本 / 分镜等（节点本身在菜单隐藏）

| 状态 | 节点              | id                                                 | 标签     |
| ---- | ----------------- | -------------------------------------------------- | -------- |
| [ ]  | `script_input`    | `optimize`                                         | 优化文本 |
| [ ]  | `script_input`    | `extract_characters`                               | 提取角色 |
| [ ]  | `script_input`    | `extract_scenes`                                   | 提取场景 |
| [ ]  | `script_input`    | `extract_props`                                    | 提取物品 |
| [ ]  | `script_input`    | `generate_storyboard`                              | 生成分镜 |
| [ ]  | `storyboard_shot` | `generate_image` / `generate_video` / `regenerate` | 分镜生成 |
| [ ]  | `grid`            | `split_2x2` / `split_3x3` / `clear`                | 宫格操作 |

### 2.6 设置页：衍生工具模型配置（尚未做）

| 状态 | 项                     | 说明                                                  |
| ---- | ---------------------- | ----------------------------------------------------- |
| [ ]  | 工具 ↔ 模型绑定        | 在 `/settings` 为扩图、抠图、超分、切镜等配置可用模型 |
| [ ]  | 「是否已配置」门禁     | 未配置时工具条不展示或明确不可用，避免空点            |
| [ ]  | Toolbar 按配置动态露出 | 白名单改为「已实现且已配置」而非写死只有 regenerate   |

---

## 3. Prompt：`@` 提及与占位文案

**门禁：** [`PromptField.tsx`](../apps/canvas-web/src/canvas/node-inline-form/PromptField.tsx)

```ts
const ENABLE_PROMPT_MENTION = false;
const ENABLE_PROMPT_PLACEHOLDER = false;
```

| 状态 | 项                                               | 恢复                                                            |
| ---- | ------------------------------------------------ | --------------------------------------------------------------- |
| [ ]  | `@` 提及（TipTap Mention + ResourcePicker 候选） | `ENABLE_PROMPT_MENTION = true`，恢复 `useNodeMentionCandidates` |
| [ ]  | Prompt placeholder 文案                          | `ENABLE_PROMPT_PLACEHOLDER = true`                              |

**保留勿删：** `MentionInput`、`createResourceMention`、各 schema `prompt.mention` / `placeholder`。

---

## 4. 节点详情大编辑弹层（NodeDetailPanel）

**门禁：** [`CanvasPage.tsx`](../apps/canvas-web/src/canvas/CanvasPage.tsx)、[`NodeInlineForm.tsx`](../apps/canvas-web/src/canvas/node-inline-form/NodeInlineForm.tsx)、[`NodeToolbar.tsx`](../apps/canvas-web/src/canvas/node-toolbar/NodeToolbar.tsx)

| 状态 | 入口                              | 说明                        |
| ---- | --------------------------------- | --------------------------- |
| [ ]  | 内联表单「放大编辑」`nif__expand` | 打开 `node-detail-backdrop` |
| [ ]  | 工具条 ✎「编辑提示词」            | 同上                        |
| [ ]  | 挂载 `<NodeDetailPanel>`          | 组件文件保留，页面暂不渲染  |

**恢复：** 恢复 `detailOpen` / `openDetail` / `onEdit` / `onExpand` 接线与 import（见 CanvasPage 注释块）。

---

## 5. 已开放（对照，勿误关）

| 能力                                                | 备注                                 |
| --------------------------------------------------- | ------------------------------------ |
| 画布新建：`asset_input` / `gen_image` / `gen_video` | Palette + 拖线候选                   |
| 素材粘贴 / 拖拽上传建节点                           | `asset-drop.ts`                      |
| 内联生成表单（模型 / 参数 / 参考槽 / 生成）         | 无 `@`、无 placeholder；文本节点暂隐 |
| 工具条「重新生成」                                  | 仅可见节点上的 `regenerate`          |
| 节点注册表中的隐藏类型                              | 旧画布仍可渲染，只是不能从菜单新建   |

---

## 相关文档

- 产品方向总览：[`roadmap.md`](./roadmap.md)
- 节点规范：[`node-spec.md`](./node-spec.md)（目标态仍描述完整节点；UI 门禁以本清单与代码为准）
