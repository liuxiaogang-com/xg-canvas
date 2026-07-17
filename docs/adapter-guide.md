# XG Canvas — Adapter 与 Model Catalog 扩展手册

本文说明如何增加 Provider、Channel、Model 和 Adapter。目录身份、修订、生命周期与热加载的完整
语义见 [model-catalog.md](./model-catalog.md)。

> 作者 YAML 是构建期输入，不是运行时配置。运行时 `XGCANVAS_CONFIG_ROOT` 只需要包含已生成的
> `model-catalog.bundle.json`；API 进程不会扫描 `model-providers/**/*.yaml`。

## 1. 三层结构

```text
Adapter（代码，协议行为）
  apps/canvas-api/src/account/adapters/<adapter-key>/
        ↓
Model Catalog（声明式定义）
  config/model-catalog.yaml
  config/model-providers/**/*.yaml
  config/schema-templates/**/*.yaml
        ↓ pnpm catalog:build
  config/model-catalog.bundle.json
        ↓
运营层（数据库与 /settings）
  provider_installations / channel_installations / model_settings
  credentials / Local Resource Revisions
```

- Adapter 负责鉴权、请求构造、同步/流式/异步调用、轮询、取消和响应解析。
- Catalog 声明 Provider、模型能力、参数/输入契约、允许 Channel 和费率。
- 运营层保存 Credential、实际 Endpoint、启停、可见性和本地自定义资源。

## 2. 何时改哪一层

| 场景                           | 改动位置                                            |
| ------------------------------ | --------------------------------------------------- |
| 已有协议下增加官方模型         | 增加/修改模型作者 YAML，发布新 Revision/Release     |
| 同模型参数、输入模式或费率变化 | 修改 YAML，递增对应 Model/Rate Card Revision        |
| 新 Provider 复用现有协议       | Provider/Channel/Model YAML，引用现有 `adapter_key` |
| 厂商协议、鉴权或轮询方式不同   | 新建 Adapter 代码，再增加 Catalog 定义              |
| 部署者增加私有 Provider/Model  | `/settings` 创建 Local Resource，不改官方 YAML      |
| 修改启停、Endpoint 或凭证       | `/settings` 更新本地 Settings/Credential            |
| 修改官方模型结构               | Fork 为本地 Model；官方 Revision 只读               |

运行时真相是 `Active Official Revisions + Local Heads + Settings/Credential`。Catalog Revision 是
唯一结构真相，不存在 `providers/channels/model_definitions` 镜像，也不使用
`source=preset/manual` 或 YAML/DB 双源 reload 语义。

## 3. 作者目录与 Release

```text
config/
  model-catalog.yaml
  model-providers/
    bailian/
      provider.yaml
      channels.yaml
      models/
        qwen-text.yaml
        qwen-image.yaml
        wan-text-to-video.yaml
  schema-templates/
    text-generation.yaml
    image-generation.yaml
    video-generation.yaml
```

目录递归加载；按家族或输入模式拆分，每个作者 YAML 最多 200 行。

`config/model-catalog.yaml`：

```yaml
format: xgcanvas.catalog.authoring
schema_version: '1'
source:
  source_id: 69c582b1-ed5d-4ee9-b4dd-412f913f20db
  namespace: xgcanvas.official
  kind: official
release:
  release_id: <new-uuid-for-this-release>
  sequence: 4
  published_at: '2026-07-15T00:00:00Z'
  min_runtime_version: '0.1.0'
```

内容变化时必须使用新 `release_id`、递增 `sequence` 并更新发布时间。同一 Sequence 不得改变
Digest。Release 不得静默遗漏旧资源；删除能力要提交原 UUID 的 `retired` 或 `revoked` Revision。

## 4. Provider 与 Channel 作者格式

`provider.yaml`：

```yaml
version: '1.0'
provider:
  resource_uid: <stable-provider-uuid>
  revision: 1
  slug: example
  display_name: Example AI
  auth_method: api_key
  base_url: https://api.example.com/v1
  adapter_keys: [openai-compat]
  invocation_methods: [http]
  supported_regions: [global]
```

`channels.yaml`：

```yaml
version: '1.0'
provider_slug: example
channels:
  - resource_uid: <stable-channel-uuid>
    revision: 1
    slug: example-openai-compatible
    display_name: Example OpenAI Compatible API
    invocation_method: http
    adapter_keys: [openai-compat]
    base_url: https://api.example.com/v1
```

Provider 与 Channel 的 `adapter_keys` 都必须非空且去重，Channel 只能声明所属 Provider 已声明的 Adapter。一个 Provider 可有多个协议 Channel；Model 必须通过单个显式 `adapter_key` 和非空 `allowed_channel_slugs` 指出兼容 Channel，且每个 Channel 都必须支持该 Adapter。空数组不会被解释为“全部 Channel”；不要让 OpenAI-compatible Adapter 路由到厂商原生异步 Endpoint。

`base_url` 是携带 Credential 的出站地址，只允许绝对 HTTPS URL；不得包含 userinfo、fragment，或
`api_key/token/password/cookie/signature` 等密钥 query。Provider `auth_config` 与 Channel
`request_config` 只放非密协议参数，嵌套对象和数组中同样禁止
`authorization/api_key/*_token/*_password/*_secret/*_cookie` 等键。Secret 只能进入
Credential payload。已绑定启用 Credential 的 Channel 若要切换到新 URL origin，除
`system.model.manage` 外还必须具有 `system.credential.manage`；同 origin 的路径调整不升级权限。
运行时会校验域名的全部 DNS 结果并把连接固定到已校验的公网 IP；带 Credential 的请求禁止跟随
重定向。通用 JSON、错误体和 SSE 都有流式读取上限，Adapter 不得绕过统一出站传输直接使用裸
`fetch`。

## 5. Model 与 Rate Card 作者格式

```yaml
version: '1.0'
provider_slug: example
models:
  - resource_uid: <stable-model-uuid>
    revision: 1
    model_id: example:chat-pro
    provider_model_id: chat-pro
    display_name: Chat Pro
    task_types: [gen.text]
    capabilities: [text_chat, streaming]
    invocation_mode: stream
    supports_streaming: true
    adapter_key: openai-compat
    allowed_channel_slugs: [example-openai-compatible]
    param_schema:
      extends: templates/text-generation
    limits:
      max_input_tokens: 128000
    pricing:
      resource_uid: <stable-rate-card-uuid>
      revision: 1
      currency: USD
      components:
        - { meter: input_tokens, per: 1000000, price: 1.0 }
        - { meter: output_tokens, per: 1000000, price: 3.0 }
```

`model_id` 是创建后不可修改的公开稳定键；内部身份是 `resource_uid`。需要新的公开标识时创建新
Resource，并把旧 Resource 发布为 `retired`。展示名称和上游 `provider_model_id` 可以在新 Revision
中更新。

Model 和 inline Rate Card 是两个独立 Resource，各自维护 UUID、Revision 和生命周期。支持的计量
meter 为 `input_tokens`、`cached_input_tokens`、`output_tokens`、`duration_seconds`、
`image_count`、`requests`；同一 Rate Card 内 meter 不得重复。后台更新 Local Model 时，省略
`pricing` 表示不改价格，提交对象表示追加/创建 Rate Card Revision。提交 `pricing: null` 时必须同时
提交精确 `expected_rate_revision`；系统先追加 retired Rate Card Revision，再追加解除价格关联的
Model Revision。历史 Revision 不会被删除。

## 6. `input_contract`：mode 与素材 slot

生成模型用 `input_contract` 声明结构性输入：

```yaml
input_contract:
  default_mode: text_to_image
  modes:
    - id: text_to_image
      label: 文生图
    - id: image_to_image
      label: 图生图
      required_slots:
        - slot: source_image
          type: image
          min: 1
          max: 4
          library:
            kinds: [character, style]
            forms: [material]
```

Input Contract V1 是 strict 契约：`input_contract` 只能省略，不能用 `null` 或 `{}` 表示空；存在时 `modes` 至少一项，`default_mode` 必须引用已声明 mode。mode、slot、library kind/form 不得重复，未知字段直接失败。`required_slots` 的 `min` 省略时按 1，且不能显式为 0；`optional_slots` 的 `min` 省略时按 0，若填写也只能为 0。Slot 不再接受 `required` 字段。

参考图、首尾帧、源视频、驱动音频和资源库引用放在 slot；温度、尺寸、时长、seed 等厂商生成参数
放在 `param_schema`。前端根据同一份 contract 渲染 mode 和素材控件，不硬编码厂商模型。

公开 Task DTO 只接受标识符：

```ts
inputs: {
  mode: string;
  prompt?: string;
  references: Array<{
    slot: string;
    type: string; // 必填；必须是规范 reference type
    asset_id?: string;
    library_entry_id?: string;
    weight?: number;
    order?: number;
  }>;
}
```

客户端不能提交 URL、本地路径、mime type、Credential 或服务端 `metadata.library`。任务执行器完成权限校验后才解析为预签名 URL 和精确 Provider/Channel/Credential 绑定。`type` 必填；Asset 引用在签名 URL 生成前还会对照数据库中的权威 `asset.type` 和 `mime_type`：图像类 reference 只能使用 image Asset，video/audio/json 同理。声明类型与真实素材不一致时直接 `VALIDATION_FAILED`。

### 6.1 `library_ref`

资源库条目可以包含：

- `material`：我们对象存储里的素材。
- `provider_ref`：绑定到精确 Provider + Channel + Credential 的厂商资源。

只有 `status=ready` 且带 server `binding_id` 的精确绑定可注入 Adapter；旧格式或
`verifying/training/failed/revoked` 记录 fail closed。普通 Library API 不接受客户端写
`provider_refs`，也不返回 Credential ID 或 verified params。当前 Picker 只展示 contract 包含
`material` 的资源；Provider verifier/consumer 未落地前，不宣传 provider-ref-only 能力。

## 7. `param_schema` 与约束

推荐复用模板：

```yaml
param_schema:
  extends: templates/image-generation
  override:
    properties:
      seed:
        max: 2147483647
```

编译后的规范结构为：

```text
version: "1.0"
groups[]: { id, label, fields[], ui_zone? }
properties: { <field>: { type, label, ... } }
required[]
defaults: {}
```

合法 `type`：`string | number | integer | boolean | enum | multi_enum | file | file_list | text |
color | slider | aspect_ratio`。枚举使用 `enum_options`。作者文件必须直接使用上述规范结构，Compiler
不会接受旧 `{ field: { kind, values, zone... } }` 扁平格式。

Param Contract V1 不做宽松补全：省略 `param_schema` 才会生成规范空 Schema；直接定义必须完整提供 `version: "1.0"`、`groups`、`properties`、`required`、`defaults`。模板引用只能包含 `extends` 和可选 `override`，其中 `override` 只允许 `groups/properties/required/defaults`；合并结果再次经过完整 strict Schema 校验。任一层的未知键、缺失字段或引用不存在的参数都会让 Catalog 构建失败。

参数联动使用 `param_constraints`：

```yaml
param_constraints:
  - id: high-res-duration
    when: { field: resolution, op: eq, value: 4k }
    actions:
      - { type: set_range, target: duration, max: 5 }
```

条件支持比较以及 `and/or/not`；动作支持 `restrict_options`、`set_value`、`set_range`、`disable`、
`show`、`hide`、`set_required`。Compiler 会检查字段引用和 Schema/Constraint 一致性。

## 8. Adapter 实现

Adapter 通过 `ProviderAdapter` 接收 `UnifiedRequest` 并返回 `UnifiedResponse`：

```ts
export class ExampleAdapter implements ProviderAdapter {
  readonly key = 'example';
  readonly capabilities = ['gen.image'] as const;
  readonly invocationMode = 'async';

  async invoke(req: UnifiedRequest, ctx: InvokeCtx): Promise<UnifiedResponse> {
    // 构造厂商请求并返回统一结果
  }

  async poll(externalTaskId: string, ctx: InvokeCtx): Promise<UnifiedResponse> {
    // 查询异步任务
  }
}
```

约束：

- Adapter 编排保持小而清晰；HTTP/CLI、request builder、response parser 分离。
- 第三方资产必须经 `AssetDownloaderService` 下载到我们的 S3/R2 桶。
- 新 Adapter Key 同步加入 `BUILTIN_ADAPTER_CAPABILITIES` 和 `AdapterRegistry`。
- Catalog task type 必须是 Adapter capability 子集；stream/async 还必须真的实现 `stream`/`poll`。

当前内置 Adapter：

| key                 | 当前能力                 | 官方 Catalog 使用方        |
| ------------------- | ------------------------ | -------------------------- |
| `openai-compat`     | `gen.text`               | OpenAI、DeepSeek、百炼文本 |
| `bailian-dashscope` | `gen.image`, `gen.video` | 百炼原生图像/视频          |
| `dreamina-cli`      | `gen.image`, `gen.video` | Dreamina                   |

OpenAI-compatible Adapter 当前只承诺文本调用，不要因为 Provider `/models` 返回某个 ID 就猜测它
支持图像、工具或结构化输出。

## 9. 厂商 `/models` 导入

`GET /models` 通常只返回 ID，不能提供 Param Schema、能力和兼容 Endpoint。导入必须显式确认
`contract_profile=openai-text-chat-stream`；系统据此固定 `openai-compat` 与文本能力。Probe、List、Import
和新增凭证都必须同时提交一个已存在的精确 `channel_resource_uid`：该 Channel 必须属于目标
Provider，且 Provider/Channel 都明确声明 `openai-compat`。

系统不从官方模型样本推导 Channel，不把单一 Channel 当隐式默认，也不会在凭证向导里自动创建
Channel。部署者必须先通过 Model 管理面创建/选择正确 Channel。导入的每个 Local Model 固定
`adapter_key=openai-compat`、`allowed_channel_uids=[所选 Channel UID]`；更换协议或 Channel 需显式
追加新的 Local Revision，不能靠名称猜路由。

凭证向导的最终保存是单次 `RegistryBootstrapService.mutateLocal`：启用所选 Provider/Channel、写入
Credential、导入勾选的 Vendor Model Local Resource、启用与该 Channel 兼容的勾选官方 Model，均在
同一个数据库事务和候选 Snapshot 中完成。任一步失败则全部回滚，不能留下“凭证已保存但模型未
启用”或相反的半完成状态。

## 10. Feature Model Contract

Feature Config 保存按优先级排列的稳定 `model_resource_uid`，但功能需要的 task type 由代码中的
Feature Contract 决定，不能由管理请求改写。当前 `ai-analysis`、`agent`、`script-extract` 均要求
`gen.text`。读 API 返回 `required_task_type`；保存时拒绝未知 feature、缺失/非当前 Model 以及不支持
该 task type 的绑定，运行时也只会从兼容且当前可用的绑定中选择。设置页通过
`/admin/feature-configs/model-options` 的最小只读投影加载候选，不要求 `system.model.manage`。

## 11. 发布与验证 Checklist

- [ ] Resource 使用稳定 UUID；内容变化递增 Revision。
- [ ] `slug/model_id` 保持不可变；替换资源时新建 UUID，并把旧资源设为 retired/revoked。
- [ ] Provider/Channel 的 `adapter_keys` 非空且闭包一致；Model 明确 `adapter_key` 与非空
      `allowed_channel_slugs`，不使用空集合猜路由。
- [ ] Provider/Channel Endpoint 使用 HTTPS 且不含 URL Secret；`auth_config/request_config` 不含任何层级的密钥型键。
- [ ] Vendor `/models` Probe/List/Import 明确提交现有 `channel_resource_uid` 与契约 profile，不推断或
      自动创建 Channel。
- [ ] 生成模型声明有效 `input_contract`。
- [ ] `param_schema`、`param_constraints` 和 pricing 通过严格校验。
- [ ] 新 Adapter 已注册并有 request/response/stream/poll 测试。
- [ ] Release 使用新 UUID、递增 Sequence 和正确发布时间。
- [ ] 运行 `pnpm catalog:check`；需要 Bundle 时运行 `pnpm catalog:build`。
- [ ] 运行相关 API 测试和生产构建。

工具调用、Agent loop 与结构化输出的产品级契约见 [agent-spec.md](./agent-spec.md)。Catalog 当前
Authoring Schema 是 strict 的；未在 Schema 中正式定义的顶层字段会被拒绝，不能先写占位字段。
