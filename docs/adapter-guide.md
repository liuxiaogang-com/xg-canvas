# XG Canvas — Adapter & Model 配置手册

模型注册表默认读取仓库内的 `config/`；部署环境需要外置配置时，可通过
`XGCANVAS_CONFIG_ROOT` 指向包含 `model-providers/` 与 schema 模板的配置根目录。
YAML 只声明 Provider、Channel 与 Model，不声明或读取凭证。所有厂商凭证统一由管理员在
`/settings` 写入数据库并加密存储。

> **新增厂商 / 新增模型必读**。本文是给 AI 与人共同使用的"操作手册"。

## 1. 三层结构

```
┌─────────────────────────────────────────────────────────┐
│ Adapter(代码,稀有更新)                                 │
│   apps/canvas-api/src/account/adapters/<adapter-key>/  │
│     ├── adapter.ts          实现 ProviderAdapter 接口  │
│     ├── client.ts           HTTP/CLI 客户端封装        │
│     ├── request-builder.ts  统一请求 → 厂商请求        │
│     ├── response-parser.ts  厂商响应 → UnifiedResponse │
│     └── types.ts            厂商专有类型                │
├─────────────────────────────────────────────────────────┤
│ Model Manifest(YAML,高频更新)                         │
│   config/model-providers/<provider>/                   │
│     ├── _provider.yaml      provider 元信息             │
│     ├── text.yaml           文本模型(可多个)          │
│     ├── image.yaml          图片模型                    │
│     └── video.yaml          视频模型                    │
├─────────────────────────────────────────────────────────┤
│ 运营层(DB,Admin UI 可改)                              │
│   account.channels(账号池)                             │
│   account.credentials(具体账号,加密)                  │
│   account.model_channel_mappings(模型路由)             │
│   model_definitions 的 enabled/quota/visible_to        │
└─────────────────────────────────────────────────────────┘
```

## 2. 何时改哪一层

| 场景                                         | 改动位置                                               |
| -------------------------------------------- | ------------------------------------------------------ |
| 同协议厂商新增一个模型                       | 仅改 YAML(增加一条)                                    |
| 同厂商新增一个模型但参数依赖不同             | YAML(增加 constraints)                                 |
| 厂商加了一个新参数                           | YAML(在对应模型的 paramSchema 加字段)                  |
| 厂商协议本身不变,只是新增模型类别            | YAML(新建 `<provider>/<新category>.yaml`)              |
| 新增一个厂商,协议与现有 `openai-compat` 兼容 | YAML(adapter 字段填 `openai-compat`)+ `_provider.yaml` |
| 新增一个厂商,协议独特(异步/CLI/特殊鉴权)     | 新建 Adapter 代码 + YAML                               |
| 改运营策略(谁能用、限额、停用某模型)         | DB(Admin UI 操作)                                      |

> **两种来源,一个注册表**:表中"仅改 YAML"指**预置模型**(进 git、可社区 PR 扩展);运营者也可在 canvas-web `/settings` **后台新增私有厂商/模型**(`source=manual`,引用家族模板 `extends: templates/*` + 少量 override + capabilities),写入 DB、reload 不覆盖。**运行时注册表 = 预置 ∪ 手动**,后台新增即时生效、不重启。

## 3. Adapter 代码模板

```ts
// apps/canvas-api/src/account/adapters/<key>/adapter.ts
import {
  ProviderAdapter,
  UnifiedRequest,
  UnifiedResponse,
  InvokeCtx,
} from '@xgcanvas/adapters-contract';
import { Client } from './client';
import { buildRequest } from './request-builder';
import { parseResponse } from './response-parser';

export class XxxAdapter implements ProviderAdapter {
  readonly key = 'xxx';
  readonly capabilities = ['image_generation'] as const;
  readonly invocationMode = 'async';

  constructor(private readonly client: Client) {}

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    const upstreamReq = buildRequest(req);
    const upstreamRes = await this.client.create(upstreamReq, ctx.credential);
    return parseResponse(upstreamRes);
  }

  async poll(externalTaskId: string, ctx: InvokeCtx) {
    const r = await this.client.query(externalTaskId, ctx.credential);
    return {
      status: r.state === 'done' ? 'succeeded' : r.state === 'failed' ? 'failed' : 'running',
      assets: r.urls?.map((u) => ({ origin_url: u, mime: 'image/png' })),
      error: r.error,
    };
  }

  async cancel(externalTaskId: string, ctx: InvokeCtx) {
    await this.client.cancel(externalTaskId, ctx.credential);
  }
}
```

**铁律:**

- adapter.ts ≤ 200 行,只做编排
- 实际 HTTP 调用全部进 `client.ts`
- 请求构造全部进 `request-builder.ts`,纯函数易测
- 响应解析全部进 `response-parser.ts`,纯函数易测
- 错误必须经 `_shared/error-mapper.ts` 转成统一错误码

## 4. YAML 模型清单模板

`config/model-providers/<provider>/_provider.yaml`:

```yaml
slug: doubao
display_name: 火山方舟(豆包)
homepage_url: https://www.volcengine.com/product/doubao
auth_method: api_key # api_key | oauth2 | cookie | cli_token
default_invocation_method: http # http | cli | sdk
adapters: # 该 provider 支持的 adapter key
  - openai-compat # 文本走 OpenAI 兼容
  - doubao-image
  - doubao-video
```

`config/model-providers/<provider>/<category>.yaml`:

```yaml
provider: doubao
adapter: doubao-image               # 路由到哪个 Adapter 实现

models:
  - id: doubao:seedream-3.0-image
    display: 即梦 Seedream 3.0(豆包代理)
    task_type: image_generation
    invocation_mode: async
    poll_policy: { interval_ms: 3000, max_attempts: 200, backoff: linear }
    capabilities: [image_gen, image_ref]
    input_contract:
      default_mode: text_to_image
      modes:
        - id: text_to_image
          label: 文生图
        - id: image_to_image
          label: 图生图
          required_slots:
            - { slot: source_image, type: image, min: 1, max: 4 }
          optional_slots:
            - { slot: mask, type: mask, max: 1 }
    param_schema:
      prompt:           { kind: text,        required: true,  zone: center }
      aspect_ratio:     { kind: enum, values: ['1:1','16:9','9:16','4:3'], default: '1:1', zone: bottom }
      resolution:       { kind: enum, values: ['1k','2k','4k'], default: '1k', zone: bottom }
      seed:             { kind: integer, optional: true, zone: advanced }
    constraints:
      - when: { resolution: '4k' }
        restrict: { aspect_ratio: ['1:1','16:9'] }
    pricing: { unit: image, cost: 0.05 }

  - id: doubao:seedream-3.0-image-pro
    display: 即梦 Seedream 3.0 Pro
    ... (同上)
```

## 5. `input_contract`: mode + slot

`input_contract` 描述模型支持哪些生成模式，以及每种模式需要哪些素材槽。它是结构性输入契约，不是运营可用性判断；“可用模型”仍只看 provider / channel / credential / model 是否 enabled。

前端快速生成页和画布节点内联表单也直接读取同一份契约:创作类型只决定 `task_type`,具体 mode 列表、参考图/首尾帧/参考视频/驱动音频等输入槽位,均由所选生成类型的 `input_contract.modes[]` 渲染。新增模型时不要在前端硬编码厂商参数或参考槽。

YAML reload、配置同步和后台手动模型写入共用同一套服务端运行时校验：`modes` 非空且 id 唯一，`default_mode` 必须命中已声明 mode，同一 mode 的 slot 不得重名，`min/max` 必须为非负整数且 `min <= max`，library 的 kinds/forms 必须非空且去重。`null` / `{}` 表示“不声明 input contract”；非空但非法的历史 DB 模型会 fail closed，不进入运行时注册表或公开模型列表。

注意区分两个 UI 概念:

- **生成类型/调用入口**:注册表里的 `model_id`,例如 `dreamina:text2image` / `dreamina:image2image` / `dreamina:multimodal2video`,决定走哪个 adapter 子命令和 input contract。
- **真实模型版本**:厂商参数里的 `model_version`,例如 `Seedream 5.0` / `Seedance 2.0 Fast`;若存在,前端应把它提升为第一个模型选择器,不要把它混在普通参数里。

公开任务输入与 adapter 内部输入是两个不同契约。客户端只能提交资产/资源库标识：

```ts
inputs: {
  mode: 'text_to_image' | 'image_to_image' | 'text_to_video' | 'first_last_frame' | ...;
  prompt?: string;
  prompt_doc?: PromptDocument; // UI @引用文档; adapter 只消费 prompt/references,不直接消费它。
  references: Array<{
    slot: 'source_image' | 'reference_image' | 'mask' | 'first_frame' | 'last_frame' | 'driving_audio' | ...;
    type: 'image' | 'video' | 'audio' | 'mask' | 'style_token' | 'entity_ref' | 'library_ref' | 'json';
    asset_id?: string;
    library_entry_id?: string;
    weight?: number;
    order?: number;
    metadata?: ClientGenerationReferenceMetadata;
  }>;
}
```

`TaskExecutorService` 完成权限校验与解析后，才构造 account-client 内部的
`ResolvedGenerationReference { slot, type, url?, mime_type?, metadata? }`。公共 DTO 不接受 URL、
本地路径、`mime_type`、`metadata.library` 或厂商 id；adapter 也不得直接接收公共
`GenerationReference`。

prompt 编辑器里的 `@` 引用在提交前统一归一化:UI 把可复原的富文本结构保存到 `inputs.prompt_doc`,把给厂商看的纯文本写入
`inputs.prompt`,再按当前模型激活的 slot 把兼容的引用转换到 `inputs.references[]`。显式上传/选择的参考内容优先,`@` 引用只补兼容 slot,并遵守 slot `max`。

常用 mode:

| mode                                              | 用途                     |
| ------------------------------------------------- | ------------------------ |
| `text_to_image` / `image_to_image` / `image_edit` | 文生图、图生图、图片编辑 |
| `text_to_video` / `image_to_video`                | 文生视频、图生视频       |
| `first_last_frame`                                | 首尾帧视频               |
| `reference_to_video`                              | 多图/视频全能参考        |
| `audio_driven_video`                              | 带音频参考的视频生成     |
| `video_continue`                                  | 视频续写                 |
| `text_to_audio`                                   | 文本生成音频             |

Adapter 只做最后一公里翻译：例如 Bailian 把 `first_frame/last_frame/driving_audio` 转成 DashScope `media[]`，Dreamina CLI 把 `mode` 转成 `text2video/image2video/frames2video/multimodal2video` 子命令。

### 5.1 统一资源库引用（`library_ref`）

统一资源库(人物库/音色库/风格库)条目有两种可共存的绑定形态:

- **自有素材(material)**:我们对象存储里的参考图/参考音频,任何接受参考输入的厂商都能用。
- **厂商绑定(provider_refs[])**:厂商侧资源(火山训练音色 id、授权人像 id 等),且绑定到**精确的
  provider + channel + credential**，只有同一候选凭证下的 adapter 能原生消费。

任务执行器 `TaskExecutorService.resolveInputs` 在 invoke 前先展开库引用:material 资产展开为普通
`references[]`(随后解析成 presigned URL),条目的 `provider_refs` 挂到每条引用的
`metadata.library.provider_refs`。执行器只把 server-owned 且 `ready` 的绑定送入 adapter；旧格式、
`verifying/training/failed/revoked` 记录一律不可调用。adapter 无需感知库表结构,只面对归一化后的引用。

request-builder 的选择顺序(用 `_shared/library-ref.ts` 的 `pickProviderRef`):

1. 调用 `pickProviderRef(ref, { provider, channel_id, credential_id })`；只有三者精确匹配、
   `status='ready'` 且带 server `binding_id` 的绑定才可注入 `external_ref_id` 与 allowlist 后的
   `verified_params`。禁止消费旧 `params` 或只按 provider 猜绑定。
2. 否则回退到 material 的 presigned URL(与普通参考图一致)。
3. 两者都没有 → 校验报错(执行器在展开阶段对"既无素材又无已验证绑定"的条目直接
   `VALIDATION_FAILED`)。项目范围的条目也必须与 task.project_id 一致。

每条 server-owned binding 的最小字段为
`binding_id/provider/channel_id/credential_id/external_ref_id/status`；`provider/channel` 必须从
credential 关系推导，`ready` 只能由真实厂商 verifier 写入。普通 Library create/update DTO 永远
拒绝 `provider_refs`。当前仓库尚无真实 verifier + adapter consumer 的完整垂直切片，因此不开放
手工“标 ready”接口；旧绑定由 migration 015 降为 `failed/LEGACY_BINDING_UNVERIFIED`。未来首个
Provider 接入必须同时交付验证 API、精确凭证匹配和一个真实消费 adapter，不能只做绑定表单。

生成模型若要声明消费能力,在 `input_contract` 的 slot 上加 `library`:

```yaml
input_contract:
  modes:
    - id: text_to_speech
      required_slots:
        - slot: voice
          type: audio
          library:
            kinds: [voice]
            forms: [provider_ref, material] # 仅当两种后端链路都真实实现
```

`forms` 列出该 slot 能消费的形态;`kinds` 限制可接的库类型。前后端都按该声明校验。
当前 ResourcePicker 只展示包含 `material` 的契约；`provider_ref`-only 在 verifier/consumer
落地前保持隐藏。material 会展开为条目的全部 `asset_ids`，展开后的数量仍必须满足 slot.max。

## 6. `param_schema` 字段 kind 枚举

| kind          | UI 控件                  | 数据类型           |
| ------------- | ------------------------ | ------------------ |
| `text`        | 多行文本/`@`艾特         | string             |
| `string`      | 单行输入                 | string             |
| `integer`     | 数字步进                 | number             |
| `number`      | 浮点滑杆                 | number             |
| `boolean`     | 开关                     | bool               |
| `enum`        | 单选(values 列举)        | string             |
| `multi_enum`  | 多选                     | string[]           |
| `image`       | 图片上传/选择            | asset_id           |
| `image_list`  | 多图(可指定 max)         | asset_id[]         |
| `audio`       | 音频上传                 | asset_id           |
| `mask`        | 蒙版编辑                 | asset_id           |
| `style_token` | 预设风格选择             | token_id           |
| `messages`    | 对话消息列表(LLM)        | `{role,content}[]` |
| `entity_ref`  | 选择项目内角色/场景/物品 | entity_id          |

每个字段还可加:

- `required: true|false`
- `default: <value>`
- `zone: top|center|bottom|advanced|toolbar`(决定塞到节点哪个 Layout Zone)
- `help: "..."`(悬停提示)
- `visible_when: { <field>: <value> }`(条件显示)

## 7. `constraints` DSL

数组形式,按顺序应用,**喂给 `@xgcanvas/constraint-engine`**:

```yaml
constraints:
  # 单条件限制
  - when: { resolution: '4k' }
    restrict: { aspect_ratio: ['1:1', '16:9'] }

  # 多条件 AND
  - when:
      and:
        - { model_variant: 'lite' }
        - { duration_sec: { gt: 5 } }
    restrict: { resolution: ['720p'] }

  # 按参数设默认
  - when: { resolution: '1080P' }
    set_default: { prompt_extend: true }

  # 校验失败给提示；结构性素材数量优先放 input_contract
  - when: { duration: { gt: 10 } }
    error: '该模型最长只支持 10 秒'
```

谓词:`eq`(默认) / `ne` / `gt` / `gte` / `lt` / `lte` / `in` / `length` / `and` / `or` / `not`。
动作:`restrict`(限定可选值) / `set_default` / `error` / `force`(强制覆盖)。

## 8. 加新 Provider 的 PR Checklist

- [ ] `_provider.yaml` 写好
- [ ] 至少一个 model YAML 写好，生成模型必须声明 `input_contract`
- [ ] 若需新 adapter:在 `adapters/<key>/` 按模板建好 4 个文件
- [ ] adapter 注册到 `adapters/registry.ts`
- [ ] 写一个 `__tests__/` 单测覆盖 request-builder + response-parser
- [ ] `config/model-providers/<provider>/_provider.yaml` 中的 `auth_method` 与 admin UI 凭证表单对齐
- [ ] 在 `docs/adapter-guide.md` 末尾"已支持厂商列表"追加一行

## 9. 已支持的 Adapter Keys(随实现更新)

| key             | 协议                             | 调用类型      | 覆盖厂商示例                            |
| --------------- | -------------------------------- | ------------- | --------------------------------------- |
| `openai-compat` | OpenAI Chat Completions / Images | sync / stream | OpenAI / DeepSeek / 豆包文本 / 千问文本 |
| `doubao-image`  | 火山方舟图片(异步任务)           | async         | 豆包 Seedream                           |
| `doubao-video`  | 火山方舟视频(异步任务)           | async         | 豆包 Seedance                           |
| `dreamina-cli`  | `DreaminaCliRunner` direct spawn | async         | 即梦 CLI                                |

> **即梦 CLI 媒体输入：** CLI 的 `--images` / `--image` / `--first` / `--last` / `--video` / `--audio`
> 只接受**本地文件路径**（官方 help: `local input image paths`）。Adapter 在 invoke 前把
> `inputs.references[].url`（executor 鉴权后签发的预签名 URL）下载到随机临时目录再传给 CLI；
> 下载限制 3 并发、同源重定向、60 秒总超时与 64 MiB 流式上限，submit 返回后清理。
> adapter 会把候选 URL 与当前对象存储生成的 read URL origin、路径前缀及 SigV4 签名参数比对；
> 客户端 URL、本地路径和非当前对象存储 URL 都必须拒绝。
> 不要把 HTTP URL 直接塞进这些 flag，否则任务可能拿到 `submit_id` 后长期停在 `querying`。

> M1 仅落地:`openai-compat` / `doubao-image` / `doubao-video` / `dreamina-cli`。
> 其余在 M2/M3 按需补齐。

## 10. 模型词表:`task_types` 与 `capabilities`(规范值,校验强制)

单一来源:[`packages/shared-types/src/model-vocabulary.ts`](../packages/shared-types/src/model-vocabulary.ts)。`manifest-validator` 在加载 YAML 时**强制**:`task_types ⊆ TaskType`、`capabilities ⊆ Capability`(先按别名归一,未知值直接报错、拒绝启动)。`registry` 与 `config-sync` 写 DB 也用同一归一,保证内存注册表与 DB 一致。

**`task_types`** = 这个模型服务哪个**节点/管线槽位**,用 `TaskType` 规范值:`gen.text` / `gen.image` / `gen.video` / `gen.audio` / `image.*` / `video.*` / `script.*` …(完整见 `shared-types/src/task.ts`)。

- 可写可读别名,会自动归一:`text_generation→gen.text`、`image_generation→gen.image`、`video_generation→gen.video`。
- **别把能力塞进 `task_types`**:旧写法里的 `text_multimodal` / `structured_output` 是**能力**,应放进 `capabilities`(对应 `vision` / `structured_output`)。

**`capabilities`** = 特性位,用来 **gate 节点 UI / request-builder / constraint-engine**(如没 `json_mode` 就隐藏 JSON 开关,没 `tool_use` 就不发 tools 字段)。闭合枚举:

| 能力                                   | 含义                                |
| -------------------------------------- | ----------------------------------- |
| `text_chat`                            | 对话文本                            |
| `vision`                               | 图片输入理解                        |
| `json_mode`                            | 保证合法 JSON(不保证 schema)        |
| `structured_output`                    | 原生 json-schema / 严格结构化输出   |
| `tool_use`                             | 工具/函数调用(别名 `function_call`) |
| `streaming`                            | 流式输出                            |
| `reasoning`                            | 推理增强(如 R1)                     |
| `embeddings`                           | 向量                                |
| `image_gen` / `image_ref`              | 生图 / 图生图(参考图)               |
| `first_last_frame` / `multi_reference` | 视频首尾帧 / 多参考                 |
| `tts` / `asr`                          | 语音合成 / 识别                     |

> 加新能力 = 往 `CAPABILITIES` 加一项(别在别处内联裸字符串)。`task_types` 决定"能不能接到这个节点",`capabilities` 决定"这个节点上哪些控件/选项亮起"。

## 11. 契约扩展蓝图:工具调用 / 流式 / 结构化输出(规划,scaffold 阶段实现)

> 这是给 `@xgcanvas/adapters-contract` 加的"接缝"。Adapter 只做"最后一公里翻译",抽象保持厂商无关。配套见 [agent-spec.md](./agent-spec.md)。
>
> **现状(已落地一部分)**:`openai-compat.stream()` 已是**真流式**(SSE fetch + 解析 `content` / `reasoning_content` / 最终 usage),不再是占位。`StreamChunk` 已加 `reasoning_delta`,并打通 `adapter.stream()` → `InvokeService.stream()`(meta/delta/done/error 事件) → chat 控制器 SSE(data: …\n\n,以 [DONE] 收尾) → 浏览器 fetch reader；含 reader 在 finally 取消、浏览器断开经 `AbortController` 串到 `ctx.signal` 中止厂商流。**仍待做**:下面 §11.1 工具调用 + §11.2 完整 `StreamEvent` 联合体(`tool_call_*`)+ §11.3 结构化输出四态。

### 11.1 统一工具调用(`UnifiedTool` 抽象)

三家(OpenAI / Claude / Gemini)是**同三原语、不同信封**,内部只认一套:

```ts
ToolDef    { name; description; parameters_jsonschema }      // 声明
ToolCall   { id; name; args: object }                        // 模型要调用(内部一律 object)
ToolResult { tool_call_id; name; content }                   // 执行结果回喂
ToolChoice = 'auto' | 'required' | 'none' | { name }         // 强制策略
```

- `UnifiedRequest` 增 `tools?: ToolDef[]`、`tool_choice?: ToolChoice`、`output_schema?: JSONSchema`。
- `UnifiedResponse` 增 `tool_calls?: ToolCall[]`、`finish_reason?: 'stop'|'tool_calls'|'length'|'content_filter'`。
- 各 Adapter 的 `request-builder.ts` 下转成厂商信封,`response-parser.ts` 上转回来。注意:**OpenAI 的 `arguments` 是 JSON 字符串要 parse;Gemini 没有 call id 要合成 `name+index`**。
- 工具循环住在 canvas-api(不在 Adapter),按 `tool_use` capability 门控。

### 11.2 流式事件(`StreamEvent` 联合体,替换薄 `StreamChunk`)

业界有**三套互不兼容的 SSE**(OpenAI 增量 delta / Claude 命名事件状态机 / Gemini 整快照),内部归一成一个 tagged union,**这是性价比最高的一处归一化**(前端打字机 + 工具卡片都靠它):

```ts
StreamEvent =
  | { type:'text_delta', text }
  | { type:'tool_call_start', index, id, name }
  | { type:'tool_call_delta', index, args_json_fragment }
  | { type:'tool_call_end', index }
  | { type:'thinking_delta', text }
  | { type:'usage', ... } | { type:'progress', value }
  | { type:'done', response } | { type:'error', error }
```

各 Adapter 的 `stream()` 把自家协议翻成这套事件;canvas-api 再用**一套自家 SSE** 透给浏览器,前端永不见厂商差异。

### 11.3 结构化输出:四态,不是布尔

模型对"结构化输出"的支持是**四态**,YAML 里按模型声明:

```yaml
structured_output:
  mode: none | json_object | json_schema_strict | tool_forced
```

`InvokeService` 据此选策略:

- `json_schema_strict` → 原生(OpenAI `response_format.json_schema` / Claude `output_format` / Gemini `responseSchema`,Adapter 把**同一份内部 JSONSchema** 映射到各家字段);
- 否则有工具能力 → **`tool_forced` 兜底**(塞一个隐藏的 `structured_response` 工具,强制 `tool_choice`,读 args)—— 到处都能用的最低公分母;
- 否则 `json_object` → 设 JSON 模式 + 用 `constraint-engine` 后校验 + 重试;
- 都不支持 → prompt 工程 + 校验 + 重试。

> 这样节点可以一直对外"支持结构化输出",哪怕模型本身不原生支持(总有降级路径)。能力位 `json_mode` / `structured_output` / `tool_use` 见 §10。

### 11.4 哪些 per-vendor 不可避免(别硬抽)

每家的 HTTP 信封/鉴权/base_url 怪癖、三套 SSE、工具信封上下转、结构化字段位置、以及**图/视频的全部 request 构造 + 状态枚举映射 + 结果 URL 提取 + S3/R2 下载**。可共享的是:`openai-compat` 一个 Adapter 服务 doubao/qwen/glm/kimi/deepseek(只差 YAML 的 base_url+auth)、异步任务机器、工具循环、`constraint-engine` 校验。
