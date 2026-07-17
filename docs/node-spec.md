# XG Canvas — 节点规范

> 节点清单、IO 类型、连接规则、前端拆分模板。
> **节点新增 / 修改前必须先改本文档,再写代码。**

> **v0.4（2026-06）变更摘要：** 节点交互范式从 v0.3「节点无内嵌表单、参数全在底部 pill」调整为**节点内联表单（inline node form）**。生成类节点选中后，在媒体下方浮出内联生成表单（模式 tab / 引用槽 / @提及 prompt / 模型选择 / 参数 chips / 批量 / 实时成本 / 生成键）；底部 pill 降级为「加节点 + 全局画布操作」；节点上方保留类型化工具条。详见 §4。

## 1. IO 类型(12 种)

| 类型 | 说明 | 携带数据 |
|---|---|---|
| `text` | 纯文本/Prompt | string |
| `image` | 单张图片 | `{ asset_id, url, width, height }` |
| `image_list` | 多张图片有序列表 | `image[]` |
| `grid` | 宫格(可拆/合/排序) | `{ rows, cols, cells: image[] }` |
| `video` | 视频 | `{ asset_id, url, duration_ms, width, height }` |
| `audio` | 音频 | `{ asset_id, url, duration_ms }` |
| `json` | 结构化数据(脚本提取结果等) | `unknown` |
| `reference` | 多模态参考(图+权重+用途标签) | `{ asset_id, weight, role }` |
| `mask` | 蒙版(配合重绘) | `{ asset_id, mode }` |
| `style_token` | 风格 token(预设产物) | `{ token_id, label }` |
| `entity_ref` | 实体引用(角色/场景/物品/分镜) | `{ entity_id, kind, name }` |
| `library_ref` | 统一资源库条目引用(人物/音色/风格) | `{ library_entry_id, kind }` |

`entity_ref` 在 schema 上带 `kind: 'character' \| 'scene' \| 'prop' \| 'storyboard'`,前端校验时用 kind 子类型做精确匹配。

`library_ref` 带 `kind: 'character' \| 'voice' \| 'style'`,边上存 `library_ref:<kind>`。当前主要经
**统一资源选择器(ResourcePicker)的「从库选择」tab** 进入生成引用
(`GenerationReference { slot, type: 'library_ref', library_entry_id }`),暂无节点输出该类型端口;
连接规则表暂不含 `library_ref` 边。解析语义见 [task-lifecycle.md](./task-lifecycle.md) 与
[adapter-guide.md](./adapter-guide.md):任务执行器把库条目展开为素材 URL 引用 +
`metadata.library.provider_refs`(厂商绑定)。

端口色板见 [design-tokens.md](./design-tokens.md) §2.5(`--c-port-*`)。**v0.4 起边(edge)也按 `data_type` 上色**(原 v0.3 只给端口点上色、边为灰)。

## 2. 连接规则表(前端 React Flow `isValidConnection` 用)

> 实现在 `packages/shared-types/src/connection-rules.ts`(`isConnectionAllowed`),前端 `CanvasView.isValidConnection` 经 `port-lookup.ts` 解析端口类型后调用。

| 源 → 目标 | 用途 | 允许 |
|---|---|---|
| `text` → 图片/视频/音频节点 prompt 端口 | 提示词输入 | ✓ |
| `image` → 图片节点 reference 端口 | 参考图/底图 | ✓ |
| `image` / `image_list` → 视频节点 reference | 首尾帧/多图参考 | ✓ |
| `audio` → 视频节点 audio_ref | 参考音频 | ✓ |
| `entity_ref<character>` → 分镜节点 characters | 角色绑定 | ✓ |
| `entity_ref<scene>` → 分镜节点 scene | 场景绑定 | ✓ |
| `entity_ref<prop>` → 分镜节点 props | 物品绑定 | ✓ |
| `entity_ref<storyboard>` → 视频/图片节点 | 引用分镜进入生成 | ✓ |
| `grid` → 图片/视频(取整组或一格) | 批量喂入 | ✓ |
| `json` → 脚本节点 import / 分镜节点 batch_import | 结构化导入 | ✓ |
| `mask` → 图片节点 mask 端口 | 重绘蒙版 | ✓ |
| `style_token` → 图片/视频节点 style 端口 | 风格统一 | ✓ |
| 其他反向(如 `video` → `text`) | — | ✗ |

**端口形态(v0.4):**
- 输入端口在节点左侧(按类型上色),输出端口在右侧
- **同一类型可有多个端口**(如分镜的 characters/scene/props)—— 保留 XG Canvas 的多类型端口,不退化为 LibTV 的单进单出
- 悬停 / 选中节点时,端口渲染一个 `+` 连接点(LibTV 交互手感);拖动时**实时高亮兼容端口**,非法落点直接拒绝
- **从端口拖到空白画布** → 弹出兼容节点候选 → 选中即「建节点 + 自动连线」(drag-to-create)

**边的完整性约束(后端 `EdgeService.create` + `canvas_edges` 约束):**
- **去重**:同一对端点之间不可重复连线(`uk_edge_endpoints` 唯一约束 + 服务层 409);前端连线失败会 toast 原因。
- **无环**:新边若会形成环路(`A→B→C→A` 或自连)直接拒绝(`assertNoCycle`,409 `CYCLE`)—— 依赖图保持 DAG。
- undo/redo 的全量 `replace()` 入库前会过滤悬空边(端点已删)和重复边,不绕过上述约束。

**编辑快捷键**:⌘C/⌘V/⌘D 复制/粘贴/副本(多选 + 内部边随之复制,新节点新 id 偏移 +48);⌘Z/⌘⇧Z 撤销/重做;Del 删除;⌘G/⌘⇧G 打组/拆组;⌘S 快照;⌘F 资源库。Group 节点选中后可拖角缩放(尺寸持久化)。

**画布文件导入:** 粘贴或拖拽图片/视频/音频到画布空白处 → 自动上传并创建 `asset_input` 素材节点(多文件交错偏移)。Ctrl/⌘+V 时若剪贴板含媒体文件则优先建素材节点,否则才粘贴已复制的画布节点。

## 3. 节点清单

> 每个生成类节点的「内联表单」字段见 §4.2 与 §6 的 `form` 描述符。下面只列节点的语义、端口、衍生操作与 task 类型。

### 3.1 入口/编辑类

#### 素材节点(`asset_input`)
- **用途:** 本地上传的图片 / 视频 / 音频素材，**只作展示与参考**，与 `gen_image` / `gen_video` / `gen_audio` 等生成节点本质不同——无内联生成表单、无 task、不可「生成」
- **数据:** `{ media_type: 'image'|'video'|'audio'|null, output_asset_id?, asset_name?, media_width?, media_height?, duration_ms?, title? }`
- **节点内联:** media 区按 `media_type` 渲染 `<img>` / `<video>` / `<audio>`；图/视频 `aspect-ratio` 跟 `media_width:media_height`；音频为扁平条；已有素材时可「替换」
- **默认标题:** 按类型为「图片素材 / 视频素材 / 音频素材」（可双击重命名）
- **输入端口:** 无 · **输出端口:** 动态——随 `media_type` 变为 `image` / `video` / `audio`（空态兜底 `image`），可连线喂给下游生成节点的参考槽
- **创建入口:**
  1. 加节点面板 / 右键菜单「上传素材」→ **立刻弹出系统文件选择器**；选定后按文件建节点；**取消则不建节点**
  2. **画布粘贴**（Ctrl/⌘+V）：系统剪贴板含图片/视频/音频文件（含截图）时，优先上传并建素材节点；否则走节点剪贴板粘贴
  3. **画布拖拽**：把本地文件拖到画布空白处，多文件交错偏移建多个素材节点
- **上传链路:** 复用预签名直传 `uploadAsset` → 写入 `canvas.assets`，节点只存 `output_asset_id`（前端经 `useAssetUrl` 取预签名 URL）

#### 脚本节点(`script_input`)
- **数据:** `{ raw_text, optimized_text, model_id }`
- **节点内联:** media 区直接是一个 `<textarea>` 编辑 `raw_text`(脚本节点是「输入型」,不走生成表单)
- **上方工具条:** 优化文本 / 提取角色 / 提取场景 / 提取物品 / 生成分镜
- **每个按钮 = 一次 task**,后端调 LLM(JSON mode)返回结构化结果,**副作用在后端写画布**(批量创建角色/场景/物品/分镜节点并自动连线)
- **输入端口:** `text`、`json`(批量导入) · **输出端口:** `text`、`json`
- **task 类型:** `script.optimize` / `script.extract_characters` / `script.extract_scenes` / `script.extract_props` / `script.generate_storyboard`

#### 角色节点(`entity_character`) / 场景节点(`entity_scene`) / 物品节点(`entity_prop`)
- 三种共享同一壳(`EntityNodeShell`),只是 `entity_kind` 不同
- **数据:** `{ name, description, ref_asset_ids, model_id }`
- **内联表单(精简):** 参考图槽(多张) + 名称/描述 + 模型选择 + 生成效果图
- **输出端口:** `entity_ref<kind>`(给分镜)、`image`(效果图直接用)

### 3.2 生成类(均带 §4.2 内联生成表单)

#### 文本生成节点(`gen_text`)
- **media:** 显示生成文本(可滚动)
- **内联表单:** prompt(@提及)· 模型选择 · temperature · max_tokens
- **输入端口:** `text`(上游 prompt)、`json`(系统提示) · **输出端口:** `text`

#### 图片节点(`gen_image`)
- **上方工具条:** 编辑/重绘 · 扩图 · 抠图 · 拆分图层 · 快速切分(宫格) · 视角 · 裁切 · 画质增强 · 下载 · 全屏 · 重新生成
- **内联表单:**
  - 模式 tab:文生图 / 图生图(`requires: reference`)
  - 引用槽:参考图(`reference`) · 蒙版(`mask`,advanced) · 风格(`style_token`,advanced)
  - prompt(支持 `@` 艾特素材/角色/物品)
  - 模型选择 · 比例(16:9/4:3/1:1…)· 分辨率(1k/2k/4k)· 批量 · 实时算力成本 · 生成键
- **节点 media 比例:** 优先读模型参数字段 `ratio`(如即梦),否则 `aspect_ratio`;与参数 chips 选择一致
- **输入端口:** `text`、`image`/`image_list`、`mask`、`style_token`、`entity_ref` · **输出端口:** `image`

#### 视频节点(`gen_video`)
- **上方工具条:** 切镜(识别剪切点拆段) · 截帧(派生图片节点) · 画质高清
- **内联表单:**
  - 模式 tab:文生视频 / 图生视频 / 首尾帧 / 全能参考
  - 引用槽:首帧 / 尾帧 / 参考图(`image`/`image_list`) · 参考音频(`audio`)
  - prompt(@提及)· 模型选择 · 秒数 · 比例 · 批量 · 实时算力成本 · 生成键
- **节点 media 比例:** 优先读模型参数字段 `ratio`,否则 `aspect_ratio`;与参数 chips 选择一致
- **输入端口:** `text`、`image`/`image_list`、`audio`、`entity_ref<storyboard>` · **输出端口:** `video`

#### 音频节点(`gen_audio`)
- **模式 tab:** 文本转语音 / 音乐生成
- **内联表单:** 模型 · 文本(@提及) · 时长 · 风格 · 成本 · 生成
- **输入端口:** `text` · **输出端口:** `audio`

### 3.3 编排类

#### 宫格节点(`grid`)
- **数据:** `{ rows, cols, cells: image[] }`
- **交互:** 媒体区即宫格,拖拽排序 · 拆分(2x2 → 1x4)· 合并 · 单格替换
- **输入端口:** `image_list` · **输出端口:** `grid`、`image_list`(展平)

#### 分镜节点(`storyboard_shot`)
- **数据:** `{ shot_no, summary, dialogue, prompt, duration_sec, target:'image'|'video', model_id, count }`
- **内联表单:** 目标 tab(出图/出视频)· 角色/场景/物品(`entity_ref` 端口接入,显示为引用槽)· prompt · 模型 · 时长 · 生成
- **输入端口:** `entity_ref<character|scene|prop>`(多)、`image` · **输出端口:** `entity_ref<storyboard>`、`image` 或 `video`

### 3.4 视图类(非画布节点,是画布的「另一种视图模式」)

#### 故事板表格视图(`storyboard_table_view`)
- **不是节点**,是画布的切换视图;表格行 = 分镜节点(按 `shot_no` 排序)
- 列 = 镜号 / 角色 / 场景 / 文案 / 提示词 / 参考图 / 生成图 / 生成视频 / 时长;双向同步回写分镜节点 data

#### 队列视图(`task_queue_view`)
- 显示当前画布所有运行中/排队中的 task,支持取消/重试

## 4. 节点壳与画布交互(v0.4 内联表单架构 · LibTV 范式)

> **v0.4 起反转 v0.3:** 生成类节点选中后**在媒体下方浮出内联生成表单**;参数回到节点身边,而非全塞进底部 pill。
> 该范式是 XG Canvas 当前确定的画布交互设计，公开规范以本节为准。

### 4.1 节点壳

> 节点壳的**视觉样式**(外框 / 圆角 / 标题位置 / 状态呈现 / 选中态 / 配色)**不在本文档固化,以用户实时指示为准**。
> 当前实现:`packages/ui-kit/src/node-shell/NodeShell.tsx` + `apps/canvas-web/src/canvas/canvas-flow.css`。
> 结构上节点壳只负责渲染:标题 + media 区 + 状态;连接点为单端口(每侧一个 `in`/`out`)。

### 4.2 选中态:节点上方工具条 + 节点下方内联表单

```
   ╭─ 上方浮动工具条(类型化 AI 衍生操作)──────────╮
   │  重绘 · 扩图 · 抠图 · 高清 · …  | ⧉ 复制 ⬇ 下载 │   ← schema.toolbarActions
   ╰──────────────────────────────────────────────╯
        ┌─────────────────┐
        │   media area    │   ← 生成结果在这里
        └─────────────────┘
   ╭─ 下方内联生成表单(仅生成类节点)─────────────╮
   │  ⊕首帧  ⊕尾帧  ⊕参考音频                  ⤢ 展开 │   ← 参考内容区(input_contract slots)
   │  输入画面想法或上传参考，@引用素材…             │   ← prompt(@提及)
   │  ◈Seedance 2.0 Fast ▾  即梦首尾帧 ▾ 16:9 ▾ ⚡120 [生成]│ ← 模型/生成类型/参数
   ╰──────────────────────────────────────────────╯
```

**上方工具条(`NodeToolbar`,已存在):** 屏幕坐标锚定在节点上方 ~12px,跟随平移缩放。内容 = `schema.toolbarActions`(按节点类型变化的衍生操作)。`primary` 项用 accent。

**下方内联表单(`NodeInlineForm`,v0.4):** 锚定在节点下方,跟随节点。由 `schema.form` 描述符 + 当前模型 `input_contract` 共同驱动,采用参考平台的“参考内容 → prompt → 模型/参数”顺序:
1. **参考内容区**:只以当前 Model Revision 的 `input_contract.modes[].required_slots/optional_slots` 决定可提交的 mode、slot、类型与数量；`schema.form.referenceSlots` 只补充节点端口映射和展示标签，不能定义模型能力。提交时统一写入 `inputs.references[].slot/type/order`
   - **三源合一:** (a) 上游连线自动填充——按入边 `data_type` 与当前槽位类型匹配,多条连线支持多个参考;切换节点类型/模式时仍从 edges 实时解析,不丢上游信息;源节点尚未产出 `output_asset_id` 时槽位显示「待生成」占位。(b) 手动选取——槽位未满时可点开 **ResourcePicker**(选择资产 / 从库选择 / 上传),写入 `node.data.manual_references`;**上游连线与手动选取共存**,按槽位 `max` 合计计数。(c) Prompt `@` 提及——写入 `prompt_references`,提交时与显式参考合并。
   - **ResourcePicker 浮层:** 通过 `createPortal` 挂到 `document.body`,`position: fixed` 锚定触发按钮,默认在按钮**上方**展开,上方空间不足时翻转到下方;不占 DOM 流,不被画布/`overflow`/底栏裁切。工作区资产固定查询 `project_id=global`；项目库候选只合并当前项目 + global。网格批量签 thumb，视频无封面时显示占位，不加载完整视频。只有 slot 的 `input_contract.library` 明确包含 `material` 时显示库 tab，并按 kinds 与展开后的 slot.max 过滤。
2. **prompt 输入**(`form.prompt`):多行,支持 `@` 引用上游节点 / 实体 / 素材。提交时保存 `inputs.prompt_doc` 用于 UI 复原与审计,同时把可匹配当前 `input_contract` slot 的引用转换为 `inputs.references[]`;显式参考区内容优先,`@` 引用只补匹配 slot。
3. **底部模型/参数区**:先显示真实模型版本(如 `Seedream 5.0` / `Seedance 2.0 Fast`,来自 `param_schema.model_version`),再显示生成类型/调用入口(`modelApi.list(task_type)` 返回的 `model_id`,如即梦文生图/图生图/全能参考视频),然后显示当前入口支持的 mode 切换(`input_contract.modes[].id`)、其它参数 chips、成本和生成键。模型相关下拉在画布内联表单中向上展开,菜单宽度可大于触发器;真实模型版本选项使用两行结构,第一行小字显示供应商/来源,第二行显示模型名。生成类型选项只显示生成类型名称,不混入供应商或 tag。
4. **参数 chips**:**选项/范围由所选 Model Revision 的规范紧凑 `param_schema` + `param_constraints` 经 `@xgcanvas/constraint-engine` 实时推导**,不再按节点类型硬编码；参考图、首尾帧、音频参考等结构性输入不放在 `param_schema`,统一由模型 `input_contract` 声明
5. **⤢ 展开**:把内联表单放大为居中大编辑器(复用并改造原 `NodeDetailPanel` 模态,作为「放大编辑」而非主入口)

快速生成页也使用同一套生成输入契约:创作类型只决定 `task_type`,具体生成 mode 与参考 slot 由所选生成类型的 `input_contract` 决定；提交结构与画布节点一致,均为 `inputs.mode` + `inputs.references[]` + `params`。参考槽同样打开共享 ResourcePicker 浮层(锚定在参考按钮上方)。当厂商把真实模型版本放在 `model_version` 参数里(如即梦 CLI 的 Seedream/Seedance),前端必须把它提升为第一选择器,而不是混在普通参数弹层里。

节点 schema、快速生成页和 Agent 工具都不得硬编码兜底 `model_id`。模型来自用户明确选择或
Feature Config 的有序 `model_resource_uid` 绑定；没有可用选择时禁用提交并显示配置入口。

快速生成页的轻会话与 URL 联动:`/generate` 打开默认会话,`/generate/:conversationId` 直接打开对应本地会话；切换、创建、删除会话时必须同步浏览器 URL。会话标题可在左侧会话列表内重命名,标题与 taskId -> conversationId 的归属关系都保存在前端本地存储中,不改变任务 API 的持久化语义。

### 4.3 共享浮层(v0.4 职责调整)

| 浮层 | 位置 | 作用 |
|---|---|---|
| **顶栏 dock** | 上 | 项目面包屑 / 视图切换 / token / 成员 / 分享 |
| **底部 pill(降级)** | 底中 | **加节点面板 + 全局画布操作**(全部运行 / 适配 / 快照);无选中时显示「输入提示词,自动建节点」。**不再承载选中节点的参数**(已搬进节点内联表单) |
| **左侧 dock** | 左中 | 文件夹 / 库 / 历史 / 用户(加节点入口统一到底部 pill) |
| **缩放栏** | 左下 | 缩放 / 适配 / minimap / 网格吸附 / 整理画布 |
| **右侧 Agent 面板(次要)** | 右,固定 340w | AI 对话区:可选开关,**次要入口**(不再是唯一编辑入口)。上下文徽章 + 对话流 + 建议 chips + `@` 引用 |

### 4.4 取消/反转的设计

- ✅ **恢复:节点内联参数表单** —— v0.3 曾删除,v0.4 以 LibTV 范式重新引入(锚定节点、所见即所得)
- ❌ **取消:参数只在底部 pill** —— v0.3 的「关键参数当 pill chip + 弹层放更多参数」作废;参数回节点
- ❌ **取消:Agent 面板作为唯一编辑入口** —— 降级为次要可选surface
- ✅ 保留:上方类型化工具条、内联表单锚定节点

### 4.5 样式来源

节点壳与内联表单的**视觉样式以用户实时指示为准**,不在本文档(或 design-tokens)固化。实现上复用 canvas-web 既有 UI 原语 / CSS 变量,避免硬编码色值。

## 5. 前端节点强制拆分模板(v0.4)

> 每个节点文件 ≤ 200 行。节点壳只渲染 标题 + media + 状态(样式见实现);内联表单与工具条由共享组件按 `schema.form`/`schema.toolbarActions` 渲染(节点目录不再各写一套表单)。

```
apps/canvas-web/src/nodes/<node_type>/
├── index.ts                # export schema + component
├── <NodeType>Node.tsx      # 节点壳:标题 + media + 状态  (<120 行)
├── schema.ts               # IO + defaultData + toolbarActions + form 描述符 + agent* + buildTaskBody
├── media/                  # 该节点的媒体渲染(ImageMedia/VideoMedia/TextMedia…)
└── (无 actions/ 表单/ —— 交给共享组件)

apps/canvas-web/src/canvas/node-inline-form/   # v0.4 新建 · 共享内联表单
├── NodeInlineForm.tsx      # 容器(<150 行):按 schema.form 渲染,锚定选中节点下方
├── ModeTabs.tsx            # 模式 tab
├── ReferenceSlots.tsx      # 引用槽(缩略图 + 上传/选择)
├── PromptField.tsx         # prompt + @ 提及(MentionInput)
├── ModelPicker.tsx         # 模型选择(从 quick-gen 抽出,增强:图标/名称/能力 chip)
├── ParamChips.tsx          # 参数 chips(constraint-engine 驱动,按所选模型)
├── CostBadge.tsx           # 实时算力成本(estimate-cost)
└── SubmitButton.tsx        # 生成键(aurora)

apps/canvas-web/src/canvas/node-toolbar/        # 上方工具条(已存在,保留)
apps/canvas-web/src/canvas/bottom-pill/         # 降级为加节点 + 全局操作
apps/canvas-web/src/canvas/agent-panel/         # 次要可选
```

`schema.ts` 必须包含:`inputs`/`outputs`(端口)、`defaultData`、`toolbarActions`(上方工具条)、`form`(内联表单描述符,生成类必填)、`agentSuggestions`/`agentContext`、`buildTaskBody`。

## 6. 节点 schema 范式(`schema.ts`)

```ts
export const genImageSchema: NodeSchema<GenImageData> = {
  type: 'gen_image',
  title: '图片生成',
  category: 'generation',

  inputs: [
    { id: 'prompt',    type: 'text' },
    { id: 'reference', type: 'image_list', label: '参考图' },
    { id: 'mask',      type: 'mask',  required: false },
    { id: 'style',     type: 'style_token', required: false },
  ],
  outputs: [{ id: 'out', type: 'image' }],
  defaultData: { mode: null, prompt: '', model_id: null, aspect_ratio: '1:1', resolution: '1k', batch: 1 },

  // 节点上方浮动工具条:类型化 AI 衍生操作
  toolbarActions: [
    { id: 'regenerate', label: '重新生成', icon: '↻', primary: true },
    { id: 'outpaint',   label: '扩图' },
    { id: 'bg_remove',  label: '抠图' },
    { id: 'upscale',    label: '高清' },
  ],

  // 节点下方内联生成表单(LibTV 范式)
  form: {
    referenceSlots: [
      { port: 'reference', slot: 'source_image', label: '参考图', accept: 'image_list' },
      { port: 'mask',      slot: 'mask', label: '蒙版', accept: 'mask', advanced: true },
    ],
    prompt: { field: 'prompt', mention: true, placeholder: '输入画面想法或上传参考，@引用素材' },
    modelPicker: { taskType: 'gen.image' },
    params: [
      { field: 'aspect_ratio', control: 'chips', label: '比例' },   // 选项 ← 所选模型 param_schema
      { field: 'resolution',   control: 'chips', label: '清晰度' },
    ],
    batch: { field: 'batch', default: 1, max: 4 },
    cost: true,                                   // POST /models/estimate-cost { model_id, params }
    submit: { label: '生成', taskType: 'gen.image' },
  },

  agentSuggestions: ['换成赛博朋克风格', '加一只猫', '改成竖屏 9:16'],
  agentContext: (data) => `这是一个图片生成节点。prompt: "${data.prompt}"，比例 ${data.aspect_ratio}。`,
  buildTaskBody: (data, upstream) => {
    if (!data.model_id || !data.mode) throw new Error('model and mode are required');
    return {
      task_type: 'gen.image',
      model_id: data.model_id,
      params: { aspect_ratio: data.aspect_ratio, resolution: data.resolution, batch: data.batch },
      inputs: {
        mode: data.mode,
        prompt: upstream.prompt ?? data.prompt,
        prompt_doc: data.prompt_doc,
        references: [
          { slot: 'source_image', type: 'image', asset_id: upstream.references?.[0]?.asset_id, order: 0 },
        ].filter((r) => r.asset_id),
      },
    };
  },
};
```

> `form.params[].control` 只声明控件类型与字段；**具体选项 / min-max / 显隐由所选 Model Revision 的 `param_schema` + `param_constraints` 在运行时经 `constraint-engine` 推导并 `reconcileParams`**。官方模型通过作者 YAML + Catalog Revision/Release 发布；部署者私有模型通过 Local Resource Revision 管理，不存在运行时 YAML reload。

## 7. 节点新增 / 改造清单(PR checklist)

- [ ] `docs/node-spec.md` 在对应分类追加/修订节点定义
- [ ] `apps/canvas-web/src/nodes/<type>/` 目录按模板创建(壳 + media)
- [ ] `schema.ts` 定义 `inputs`/`outputs` + `toolbarActions` + `form` 描述符
- [ ] 内联表单走共享 `canvas/node-inline-form/`(不在节点目录另写表单)
- [ ] `index.ts` 注册到 `nodes/registry.ts`(一行)
- [ ] 连接规则若有新增,改 `packages/shared-types/src/connection-rules.ts`
- [ ] IO 类型若有新增,改 `packages/shared-types/src/io-types.ts` 并通报后端
- [ ] 后端:`apps/canvas-api/src/canvas/node-spec.ts` 同步该类型;模型/参数能力经 `/models` 系列接口(list/schema/estimate-cost)透出
