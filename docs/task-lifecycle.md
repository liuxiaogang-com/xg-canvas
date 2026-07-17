# Task Lifecycle

所有长任务都先落 `canvas.tasks`，刷新页面不丢。画布节点产物以任务终态写回为准，前端轮询只负责实时 UI。

## 1. 状态机

```text
pending -> queued -> running -> succeeded
                         |       failed
                         |       cancelled
failed/cancelled --retry allowed--> queued
```

状态枚举统一为：

```text
pending | queued | running | succeeded | failed | cancelled
```

代码、数据库和文档统一使用 `cancelled`。

## 2. 调用链

```text
canvas-api TaskPoller
  -> TaskExecutorService
  -> AccountInvokeClient
  -> account InvokeService
  -> Adapter
```

业务模块只经过 `account-client` seam 调用 account 子系统，不直接 import account 内部实现。

### 2.1 Model/Rate Card Revision Pin

公共 Task DTO 不接受 Catalog Pin。`TaskService` 在统一可用性校验后由
`AccountModelsClient.resolveTaskPin` 写入：

```text
model_resource_uid
model_revision_id
rate_card_revision_id        无 Rate Card 时为 null
catalog_epoch
```

`TaskExecutorService`、`TaskPollerService` 和 `TaskTerminalService` 都通过
`requireTaskModelPin` 读取同一组字段；Invoke/Poll/Cancel 使用
`RegistryService.requirePinnedEntry` 解析不可变 Revision。Retry 保留原 Pin，不切换到当前新模型。
系统只执行真实厂商调用，创建任务前必须通过 Revision、Runtime Settings、allowed Channel、Adapter
契约和启用 Credential 门禁。Pin 缺失或 Revision 已不可执行时返回永久错误
`CATALOG_REVISION_MISSING`。

Model Revision 固定 Adapter、上游模型 ID、Param/Input Contract 和能力；Rate Card Revision 固定
价格。真实调用前，Task 先保存 `invoke_logical_request_id + invoke_prepared_at`；Invoke 再从该 Model
明确允许且支持其 `adapter_key` 的 Channel 中选路，并把精确路由写入分发前的物理 Request Log。
Adapter 返回成功或已接受的异步任务后，Task 再保存：

```text
invoke_request_id             已接受异步任务时为对应物理 request id
channel_resource_uid
channel_revision_id
channel_route                 分发时的 endpoint/request 配置快照
credential_id
external_task_id              异步任务被接受后存在
```

因此 Model/Rate Card 在创建 Task 时固定，Channel Revision/Route/Credential 在每次真实物理分发日志中
精确固定，并在 Task 成功或异步作业被接受时写回 Task。
异步 Poll、Cancel、崩溃恢复都使用已保存的精确路由；即使后台随后禁用 Channel/Credential 或目录 Head
变化，也不会给已接受的厂商任务重新选路。只有在上一物理尝试已明确终结、准备新执行尝试时才清除
旧路由。

`channel_route` 只允许保存非密 Endpoint 与 request 配置；`base_url` 和 `request_config` 在 Catalog
作者、本地 Revision、Runtime override 与 Snapshot 边界统一拒绝 Secret，生成 Task/Request Log
快照时再深度脱敏兜底。Credential payload 永远不进入路由快照。

`retired` 不允许新任务，但此前固定的 active/deprecated Revision 仍可继续；`revoked` 阻断该资源
全部历史 Revision。Task 表从基线创建时就要求完整 Pin，执行链路不会按 `model_id` 猜测 Revision。

### 2.2 Logical Invoke 与物理 Attempt

一次 Task 执行尝试先生成稳定 `invoke_logical_request_id`。同一个逻辑调用可能因“明确未被厂商接受”
而在其他 Channel/Credential 上产生多个物理 attempt；每次物理调用都有自己的
`ops.request_logs.id` 与从 1 递增的 `attempt_no`。Registry/参数等分发前失败使用
`attempt_no=null`，不算厂商物理调用。

每个物理 attempt 必须先以 `status=pending` 写入账本，再调用 Adapter；账本写失败时禁止发送厂商
请求。分发结果分三类：

- `definitely_rejected`：确定没有产生厂商作业，允许按重试策略尝试下一个候选。
- `outcome_unknown`：超时、断线等情况下可能已被厂商接受；保持账本 `pending`，停止 failover，
  不自动重放。
- `accepted`：厂商已返回结果/外部任务，但本地持久化失败；按已接受处理，禁止重放并执行补偿。

通用 HTTP 客户端只默认重试 GET。POST/PUT/DELETE 等写请求默认 `retry=never`；只有调用方能证明
操作幂等时才能显式标为 safe。Task 的 idempotency key 是厂商支持时的附加保护，不是重放依据。
这套边界保证未知结果按 at-most-once 处理，优先避免重复生成和重复计费。

## 3. 取单

Task runner / poller 使用 `SELECT ... FOR UPDATE SKIP LOCKED` 抢占任务。每次领取都写入
`lease_token + lease_expires_at`，后续状态变更必须同时匹配任务 id 与租约 token（CAS）：

1. **pending / 可重投 queued**：claim 后标为 `queued`，由 executor 领取执行。
2. executor 标为 `running` 并调用 adapter。
3. 同步成功直接 `succeeded`。
4. 异步返回 `external_task_id` 后保持 `running` 并设置 `next_poll_at`。
5. **到期 poll**：poller 领取时同样持有租约；invoke 与 poll 共用 `TASK_CONCURRENCY` 的硬上限；
   执行期间 runner 每 5–10 秒续租（不超过 `TASK_LEASE_MS / 3`）。
   租约丢失会中止本地请求，迟到的成功/失败结果因 token 不匹配而不能覆盖当前状态。
6. 同步 invoke 在租约过期后由其他实例恢复时沿用当前 `attempt_no` 的幂等键；显式或自动重试
   会产生新的 attempt，避免同一次尝试被厂商重复计费。

## 4. 输入解析

公开任务 API 只接受声明过的结构字段（`mode/prompt/prompt_doc/negative_prompt/references/json`），
最多 32 条 reference。客户端不能提交 `url`、`mime_type`、本地路径或 adapter/library 内部 metadata：

- `inputs.references[]` 必须且只能带 `asset_id` 或 `library_entry_id` 之一。
- `inputs.references[].type` 必填，且必须是规范 reference type；不能从文件名或 MIME 猜类型。
- 音频与其他素材一样通过 `inputs.references[]` 提交，并显式声明 `type=audio` 与所属 slot。
- canvas-api 在可见性校验通过后，把 `asset_id` 解析为短期 presigned URL，并保留
  `slot/type/order/weight`。签名前还会校验数据库中的权威 Asset `type` 与 `mime_type`：图像类
  reference 只能引用 image Asset，video/audio/json 同理。只有解析后的内部
  `ResolvedGenerationReference` 能跨过 account-client seam。

类型映射固定为：`image/image_list/mask/style_token/entity_ref -> image`，`video -> video`，
`audio -> audio`，`json -> json`（MIME 必须包含 `json`）。`library_ref` 只能配
`library_entry_id`，Asset 引用不能声明为 `library_ref`。

生成类任务的结构性输入统一为：

```json
{
  "mode": "first_last_frame",
  "prompt": "camera slowly pushes in",
  "prompt_doc": {
    "version": 1,
    "text": "camera slowly pushes in",
    "mentions": [],
    "segments": [{ "type": "text", "text": "camera slowly pushes in" }]
  },
  "references": [
    { "slot": "first_frame", "type": "image", "asset_id": "asset_a", "order": 0 },
    { "slot": "last_frame", "type": "image", "asset_id": "asset_b", "order": 1 },
    { "slot": "driving_audio", "type": "audio", "asset_id": "asset_c", "order": 2 }
  ]
}
```

`mode` 与 `slot` 必须满足 Task 固定 Model Revision 中的 `input_contract`。`param_schema` 只描述真正的生成参数（比例、尺寸、时长、seed 等），不再承载参考图、首尾帧、参考音频这类结构性输入。

Input Contract V1 不接受隐式 slot：客户端引用未在当前 mode 的 required/optional 集合中声明的 slot
会失败。required slot 的有效 `min` 至少为 1；optional slot 的有效 `min` 固定为 0。缺少必填 slot、
超出 `max`、reference type 不一致或 Asset 类型/MIME 不一致均在进入 Adapter 前失败。

adapter 收到的输入必须是服务端解析出的厂商可访问 URL 或普通结构化字段。即梦 CLI 媒体 flag
只接受本地路径：adapter 将 URL 的 origin、对象路径前缀和 SigV4 签名参数与当前对象存储生成的
预签名 URL 比对，不信任开放 metadata 标记；下载限制同源重定向、超时、并发数与
64 MiB 流式大小，然后在 submit 后清理随机临时目录；任何客户端 URL/本地路径都在此前拒绝。
全能参考（`multimodal2video`）若无 `--image` / `--video` 必须立即 `CONSTRAINT_VIOLATION`，
不得带着空参考拿到 `submit_id` 后长期 `querying`。

`prompt_doc` 是 `@` 引用的编辑器/审计结构,随任务一起持久化,用于 UI 重新打开时恢复带颜色的资源 chip。adapter 仍然只消费
`prompt` 与归一化后的 `references[]`。

## 5. Adapter 结果

Adapter 返回 `UnifiedResponse`：

- `succeeded`：包含已经下载到 S3/R2 的 `assets`
- `running`：包含 `external_task_id`
- `failed`：包含统一错误码和 message

Adapter 拿到第三方临时 URL 后必须通过 `ctx.downloader.download()` 下载到我们的远程 S3/R2 bucket。
downloader 把响应流经大小限制和 SHA-256 计算写入临时文件，再以已知 Content-Length 上传，避免把
最大 512 MiB 结果整体留在 Node 堆内；任务租约丢失时 AbortSignal 会中断下载。若终态 CAS 失败或
数据库事务回滚，服务端 best-effort 删除本次已上传对象，避免取消/抢租产生孤儿文件。

同步生成必须区分“厂商尚未接受”与“厂商已经产出、仅本地资产摄取失败”。后者通过
`dispatch_outcome=accepted` 和厂商完成用量回传给 Invoke 账本：物理 attempt 按厂商成功结算并保留
`ASSET_DOWNLOAD_FAILED` 等摄取错误，Task 明确失败且不得切换 Channel/Credential 或自动重新生成。
若进程在账本结算后、Task 终结前崩溃，恢复器只根据该终态账本失败 Task，不重放厂商请求。

## 6. Polling

异步任务由 `TaskPoller` 扫描 `running|queued` 且带 `external_task_id`、`next_poll_at <= now()` 的任务：

```text
TaskPoller -> AccountInvokeClient.poll -> account PollService -> adapter.poll
```

adapter.poll 返回：

- `running`：更新下一次轮询时间
- `succeeded`：在一个数据库事务内持久化资产、完成任务并写回源节点（见 §6.1）
- `failed`：按重试策略处理

**运行超时：** 自 `started_at` 起超过 `TASK_RUNNING_TIMEOUT_MS`（默认 45 分钟）仍未终态 → `failed`（`VENDOR_TIMEOUT`），避免 UI 一直「正在生成」。

**不可恢复 poll 错误**（如 `CONSTRAINT_VIOLATION`、`record not found`、反复 `query_result` 解析失败）→ 直接 `failed`；短暂错误累计超过阈值后同样失败，不得无限 `next_poll_at + 5s`。

前端：

- 画布提交后对单任务 `GET /api/v1/tasks/:id` 轮询，加速节点 UI。
- 进入画布 hydrate 后调用 `GET /tasks?project_id=...&active=true`，只恢复未被更新提交取代的进行中任务。
- 所有画布入口共享一个轮询管理器；请求返回前后都校验 generation、task_id、project_id 与
  source_node_id。新提交会取消旧请求，网络故障只指数退避重连，不把业务任务伪标为 failed。
- 前端不得在终态再 PATCH 整份节点；成功/失败产物和持久化补写只由 §6.1 的服务端事务负责。
- 快速生成页先 `GET /api/v1/tasks?standalone=true&limit=80` 拉历史 feed，再对进行中任务按详情轮询。

### 6.1 源节点写回（权威）

创建带 `source_node_id` 的任务时，服务端要求同时提供 `project_id`，校验调用者具有
`project.canvas.node.edit`，并通过 node → canvas → project → workspace 关系确认节点归属。
任务进入终态后，`TaskNodeWritebackService` 在终态事务中更新对应 `canvas_nodes.data`：

- `succeeded`：写入 `output_asset_id`（取 `output_asset_ids[0]`）和/或 `output_text`；清除 `status` / `task_id` / `last_error`
- `failed`：写入 `last_error`（可读消息）；清除运行态字段
- `cancelled`：只清除运行态字段

同一节点若已创建更新的任务，旧任务即使更晚结束也不再回写；节点更新与 canvas version +1
同事务提交。节点预览以服务端写回为准；前端轮询失败或刷新页面后仍能看到产物。
`status` / `task_id` 仍是前端 transient，不作为持久真相。

## 7. 重试

只对可重试错误重投：

- rate limit
- vendor timeout
- vendor unavailable
- storage unavailable
- asset download failed

不可重试：

- 参数错误
- 内容审核拒绝
- 模型不存在/禁用
- 凭证缺失或厂商明确拒绝

重新调用厂商时 `retry_count++` 并回到 `queued`，同时清空旧的
`external_task_id/channel_resource_uid/channel_revision_id/channel_route/credential_id`、调用关联、
输出、错误、进度、起止时间和租约。下一次领取递增 `attempt_no`，调用厂商的幂等键为
`task:{task_id}:attempt:{attempt_no}`。

`outcome_unknown` 或 `accepted` 不能进入普通自动重投：恢复器会复用同一 logical invoke 查找已接受
外部任务并重新挂回 Task；在 `TASK_INVOKE_RECOVERY_TIMEOUT_MS` 内没有确定结果时，Task 以
`INVOKE_OUTCOME_UNKNOWN` 失败，但 pending 物理账本仍保留，用户 retry 会被
`INVOKE_ATTEMPT_UNRESOLVED` 阻止。只有经过更长的 `TASK_INVOKE_ABANDON_MS` 安全窗口且仍无
`external_task_id`，恢复器才把它终结为 `INVOKE_OUTCOME_ABANDONED`，之后才允许新尝试。

若厂商任务已经成功、只是在把结果摄取到 S3/R2 时发生 `ASSET_DOWNLOAD_FAILED`，则保持
`external_task_id/channel_resource_uid/credential_id` 与当前 attempt，只延后 poll/download；不得重新付费生成。
同步生成没有可轮询的 `external_task_id` 时，同类摄取失败直接终结 Task；已成功的物理 attempt 和
厂商 usage 仍保留并计费，自动重试不得重新调用生成接口。
用户显式 retry 前重新校验当前 workspace membership、`project.task.run`，有源节点时还要重新校验
`project.canvas.node.edit` 与节点归属。

## 8. 取消

`POST /api/v1/tasks/:id/cancel`

- `pending/queued`：事务内直接标 `cancelled` 并清除租约
- `running` 且已有外部任务：本地状态先提交，再 best-effort 调用 `adapter.cancel(external_task_id)`
- `running` 同步调用：本地标 `cancelled`；迟到结果的 CAS 失败，若此时才拿到外部任务 id，
  executor 会立即 best-effort 取消厂商任务

厂商已接受异步作业、但 Task 路由或物理账本终态落库失败时，也必须用原 Model Pin + Channel
Revision/Route + Credential best-effort cancel。后台恢复器会扫描“账本已记录 external_task_id、Task
尚未关联”的孤儿：能安全挂回则恢复轮询，否则执行相同补偿取消并终结账本。补偿失败会保留记录
供后续重试，绝不通过再发一次生成请求来“确认”。

厂商取消接口若只支持部分状态，adapter 采用 best-effort。

## 9. 资产

前端永远通过资产 API 拿 URL：

```text
GET  /api/v1/assets/:id/url?variant=full|thumb
POST /api/v1/assets/urls        # 批量，优先 thumb，无权限的 id 静默省略
POST /api/v1/assets/:id/thumbnail-intent
POST /api/v1/assets/:id/thumbnail-complete
```

返回的是我们的 S3/R2 presigned URL，不返回第三方临时 CDN URL。签发前必须通过
可见性判定（`private | project | workspace`，见 `docs/architecture.md`）。
`variant=thumb` 在无封面时返回 `THUMB_NOT_FOUND`，不回退主对象。

资产来源有两类，最终都是同一张 `canvas.assets`：

- 任务产物：adapter 落桶后由 `persistProduced` 入库，`task_id` 非空；有项目时可见性为
  `project`，standalone 产物默认 `private`，避免在全工作区意外公开。生成视频通常无封面；
  普通 feed / 网格展示只请求已有 `thumb`，不得因组件挂载自动读取完整视频。用户显式播放或
  展开视频且无 `thumb_storage_key` 时，前端先调用 `thumbnail-intent` 完成写权限检查，再按有界
  并发读取视频首帧，经 `thumbnail-complete` 补写封面；无写权限、抽帧失败或补写失败只保留
  无封面状态，不影响视频读取与播放（见 `docs/api-conventions.md`）。
- 用户上传：`POST /assets/upload-intent` 预签名直传 + `POST /assets/uploads/:draftId/complete`
  核验入库，`task_id` 为空；默认可见性有项目为 `project`，否则为 `private`。
  图片/视频由客户端尽力生成 JPEG 缩略图一并上传；媒体探测、抽帧或缩略图 PUT 失败时仍以
  `has_thumbnail=false` 完成源对象，缩略图失败不得拖垮源文件上传。
  作为生成任务参考图时与任务产物同样走 `references[].asset_id` 解析。

## 10. 错误码

厂商与目录核心错误码来自 `@xgcanvas/shared-types`：

- `VALIDATION_FAILED`
- `CONSTRAINT_VIOLATION`
- `MODEL_NOT_FOUND`
- `MODEL_DISABLED`
- `CHANNEL_UNAVAILABLE`
- `CREDENTIAL_INVALID`
- `CATALOG_REVISION_MISSING`（永久错误，不得回退到当前模型）
- `INVOKE_OUTCOME_UNKNOWN`（可能已到达厂商，禁止自动重放）
- `RATE_LIMITED`
- `VENDOR_TIMEOUT`
- `VENDOR_REJECTED`
- `VENDOR_CONTENT_FILTERED`
- `VENDOR_UNAVAILABLE`
- `ASSET_DOWNLOAD_FAILED`
- `ASSET_TOO_LARGE`
- `STORAGE_UNAVAILABLE`
- `INTERNAL_ERROR`

Task API 还会返回 `INVOKE_ATTEMPT_UNRESOLVED`，表示上一物理尝试仍待恢复或安全放弃，当前不能
由用户 retry。

request-id 全链路记录到 `ops.request_logs`，并在错误响应中用于排查。
