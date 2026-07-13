# XG Canvas — Agent 子系统规范(内置工具 + 工具循环 + 会话)

> 规划/蓝图。配套 [adapter-guide.md §10](./adapter-guide.md)(工具/流式/结构化输出契约)、[task-lifecycle.md](./task-lifecycle.md)。
> **当前现状**:`apps/canvas-api/src/agent/agent.service.ts` 是"让模型吐一个 JSON patch"的一次性玩法,**不是真工具循环**;scaffold 阶段按本文重写,先留骨架,具体工具清单后续再定。

## 1. 定位

Agent 是**封装好的内置能力,用户只管用**(如"一句话生图")。当前阶段**工具是预置的、不开放用户自定义**;handler 是画布域动作(建任务 / 改节点 / 抽取),服务端执行、带 `owner_id` + `project_id` 作用域。

## 2. 两条道(别一刀切)

| 形态 | 持久化 | 说明 |
|---|---|---|
| **生成**(图/视频/长文) | **重 task**(`canvas.tasks` + `FOR UPDATE SKIP LOCKED` + 轮询,见 task-lifecycle) | 异步、可恢复、刷新不丢 |
| **对话**(Agent 聊天) | **轻会话**(`canvas.conversations` / `canvas.messages`) | 流式回显、可回看、可续聊 |

> **"一句话生图" = 一条会话消息(流式回显)+ Agent 调 `generate_image` 工具 → 产出一条 `gen.image` task。** 聊天是聊天、生成是任务,Agent 把两者缝起来:消息里挂上它触发的 `task_ids`,前端在对话流里渲染"任务卡片"并实时更新。

前端展示约定: assistant 文本内容按 GitHub Flavored Markdown 渲染(段落、列表、表格、代码块、任务列表等),但不解析或注入原始 HTML; user 消息仍按纯文本显示。

会话 URL 约定: `/chat` 表示新对话入口,`/chat/:conversationId` 表示打开指定会话; 侧边栏切换会话必须同步更新 URL,直接访问会话 URL 必须加载对应消息历史。

## 3. 内置工具注册表(canvas-api)

```ts
interface BuiltinTool {
  def: ToolDef;                                   // name + description + parameters_jsonschema(见 adapter-guide §10.1)
  handler(args: object, ctx: ToolCtx): Promise<ToolOutcome>;
}
interface ToolCtx { userId; workspaceId; projectId; conversationId; }
interface ToolOutcome { summary: string; task_ids?: string[]; node_ids?: string[]; data?: unknown; }
```

- 一个 `BuiltinToolRegistry`(name -> BuiltinTool),Agent 据 `tool_use` 能力把 `def[]` 喂给模型。
- handler **直接调已有 service**(`task.service` 建任务 / canvas 节点 CRUD / `script.llm-extract` 抽取),不重复实现。
- **示例工具(占位,后续定清单)**:`generate_image` / `generate_video` / `generate_text` / `create_node` / `edit_node` / `connect_nodes` / `extract_characters` …

## 4. Agent 循环(住 canvas-api,不在 Adapter)

```
1. 读会话历史(messages) + 系统提示 + 当前画布上下文
2. 带 tools 调 LLM(stream)            ── 经 account-client → InvokeService → Adapter.stream()
3. 模型 emit tool_calls?
     是 → 逐个执行 BuiltinTool.handler(可能建 task)→ 追加 role:'tool' 的 ToolResult → 回到 2
     否 → 结束,落 assistant 消息(含触发的 task_ids)
4. 全程把 StreamEvent(text_delta / tool_call_* / done)经自家 SSE 推前端
```

- 门控:整功能按模型 `capabilities` 的 `tool_use` + `streaming`;模型没 `tool_use` → 退回纯文本 / 旧的一次性 JSON patch 模式。
- 工具调用的厂商信封翻译在 Adapter 层(§10.1),循环本身厂商无关。

## 5. 数据模型(`canvas` schema 新增)

```
canvas.conversations  -- id, project_id, owner_id, title, model_id?,
                      --   created_at, updated_at
canvas.messages       -- id, conversation_id, role(system|user|assistant|tool),
                      --   content JSONB(文本/内容块), tool_calls JSONB?,
                      --   tool_call_id?, task_ids UUID[]?, usage JSONB?, created_at
```

> 迁移在 scaffold 阶段随这块代码一起加(见 architecture.md §4.2)。会话落库 = 刷新不丢 + 可回看 + 可续聊(已与用户确认)。

## 6. 边界

- 工具是**画布域动作**,不开放任意 HTTP 工具(当前阶段);要扩展先进 `BuiltinToolRegistry`。
- 不在 Agent 里 spawn CLI / 直连厂商：一律经 `account-client` 接缝 → account 子系统（铁律见根目录 `AGENTS.md`）。
- 资产仍走铁律#5(Adapter 落远程 S3/R2 再返回);Agent 只拿我们的 URL。
