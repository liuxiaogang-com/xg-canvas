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

## 3. 取单

Task runner / poller 使用 `SELECT ... FOR UPDATE SKIP LOCKED` 抢占任务。每次领取都写入
`lease_token + lease_expires_at`，后续状态变更必须同时匹配任务 id 与租约 token（CAS）：

1. **pending / 可重投 queued**：claim 后标为 `queued`，由 executor 领取执行。
2. executor 标为 `running` 并调用 adapter。
3. 同步成功直接 `succeeded`。
4. 异步返回 `external_task_id` 后保持 `running` 并设置 `next_poll_at`。
5. **到期 poll**：poller 领取时同样持有租约；invoke 与 poll 共用 `TASK_CONCURRENCY` 的硬上限；
   执行期间 runner 每 5–10 秒续租（不超过 `TASK_LEASE_MS / 3`）。
   续租。租约丢失会中止本地请求，迟到的成功/失败结果因 token 不匹配而不能覆盖当前状态。
6. 同步 invoke 在租约过期后由其他实例恢复时沿用当前 `attempt_no` 的幂等键；显式或自动重试
   会产生新的 attempt，避免同一次尝试被厂商重复计费。

## 4. 输入解析

公开任务 API 只接受声明过的结构字段（`mode/prompt/prompt_doc/negative_prompt/references/audio_url/json`），
最多 32 条 reference。客户端不能提交 `url`、`mime_type`、本地路径或 adapter/library 内部 metadata：

- `inputs.references[]` 必须且只能带 `asset_id` 或 `library_entry_id` 之一。
- `inputs.audio_url` 是历史字段名，公开值必须是 asset UUID；服务端解析后才成为内部 URL。
- canvas-api 在可见性校验通过后，把 `asset_id` 解析为短期 presigned URL，并保留
  `slot/type/order/weight`。只有解析后的内部 `ResolvedGenerationReference` 能跨过 account-client seam。

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

`mode` 与 `slot` 必须满足所选模型 YAML/DB 中的 `input_contract`。`param_schema` 只描述真正的生成参数（比例、尺寸、时长、seed 等），不再承载参考图、首尾帧、参考音频这类结构性输入。

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

重新调用厂商时 `retry_count++` 并回到 `queued`，同时清空旧的 `external_task_id/channel_id/credential_id`、
输出、错误、进度、起止时间和租约。下一次领取递增 `attempt_no`，调用厂商的幂等键为
`task:{task_id}:attempt:{attempt_no}`。

若厂商任务已经成功、只是在把结果摄取到 S3/R2 时发生 `ASSET_DOWNLOAD_FAILED`，则保持
`external_task_id/channel_id/credential_id` 与当前 attempt，只延后 poll/download；不得重新付费生成。
用户显式 retry 前重新校验当前 workspace membership、`project.task.run`，有源节点时还要重新校验
`project.canvas.node.edit` 与节点归属。

## 8. 取消

`POST /api/v1/tasks/:id/cancel`

- `pending/queued`：事务内直接标 `cancelled` 并清除租约
- `running` 且已有外部任务：本地状态先提交，再 best-effort 调用 `adapter.cancel(external_task_id)`
- `running` 同步调用：本地标 `cancelled`；迟到结果的 CAS 失败，若此时才拿到外部任务 id，
  executor 会立即 best-effort 取消厂商任务

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

统一错误码来自 `@xgcanvas/shared-types`：

- `VALIDATION_FAILED`
- `CONSTRAINT_VIOLATION`
- `MODEL_NOT_FOUND`
- `MODEL_DISABLED`
- `CHANNEL_UNAVAILABLE`
- `CREDENTIAL_INVALID`
- `RATE_LIMITED`
- `VENDOR_TIMEOUT`
- `VENDOR_REJECTED`
- `VENDOR_CONTENT_FILTERED`
- `VENDOR_UNAVAILABLE`
- `ASSET_DOWNLOAD_FAILED`
- `ASSET_TOO_LARGE`
- `STORAGE_UNAVAILABLE`
- `INTERNAL_ERROR`

request-id 全链路记录到 `ops.request_logs`，并在错误响应中用于排查。
