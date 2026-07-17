# XG Canvas — 计费规范

配套 [model-catalog.md](./model-catalog.md) 与 [task-lifecycle.md](./task-lifecycle.md)。每次厂商调用的
计费真相源是 `ops.request_logs`，不是 `canvas.tasks`。

## 1. 计费单位：物理 Invoke Attempt

Billing 只统计 `source='invoke' AND attempt_no IS NOT NULL` 的物理厂商调用。一个
`logical_request_id` 是一次逻辑 Invoke；Channel/Credential failover 产生新的 Request Log `id` 和递增
`attempt_no`，每一条都是真实物理 attempt。Registry、参数校验等分发前失败使用
`attempt_no=null`，Poll/Cancel/Chat/Admin 日志使用其他 `source`，均不进入调用计费统计。

物理 attempt 必须在请求发送前先以 `pending` 落库。只有 `success` 会根据用量冻结成本；
`pending/error/timeout/cancelled` 的 `cost/cost_currency` 保持 `null`，即使错误响应携带不完整 usage 也
不推测费用。异步调用从 submit 到最终 Poll 共用同一 Invoke attempt 账本；Poll 不是第二次生成计费。

这里的 `success` 表示厂商物理调用已经成功产出，而不等同于本地 Task 一定成功。同步生成在厂商已
返回产物和 usage 后若资产下载或 S3 写入失败，attempt 仍以 `success` 冻结真实用量与成本，并可同时
记录 `ASSET_DOWNLOAD_FAILED` 供排障；Task 明确失败且不得通过 failover 或自动 retry 再次付费生成。

## 2. 原则：原生计量与币种

XG Canvas 不把 token、秒、图片或请求次数换算为统一点数。每个 Rate Card 使用自己的原生 meter
和币种；聚合按币种分别求和，不做隐式汇率转换。

Catalog 支持的 meter：

```text
input_tokens
cached_input_tokens
output_tokens
duration_seconds
image_count
requests
```

## 3. 不可变 Rate Card Revision

Model 可关联独立的 `rate_card` Catalog Resource。Task 创建时固定
`rate_card_revision_id`；每次请求把它与 `model_resource_uid/model_revision_id/catalog_epoch` 一并写入
Request Log 上下文。

`CostService` 只通过 `AccountModelsClient.getRateCardPricing(revisionId)` 读取 Registry Snapshot 中的
不可变 Rate Card Revision。不存在另一张当前价格表或短时价格缓存；历史请求永远不按当前
Revision 重新定价。UI 估算读取当前 Catalog Revision，不能作为请求日志的结算依据。

无 Rate Card 或没有匹配 meter 时 `cost=null`，不因为缺少价格让真实调用失败。固定 Revision 不存在
属于目录完整性问题，任务链路返回 `CATALOG_REVISION_MISSING`，不能改用当前价格。

Local Model 的 `pricing: null` 只会追加 Model Revision 并解除后续 Task 的 Rate Card 关联；历史
Rate Card Revision 与已经固定它的 Task/Request Log 仍保留，历史成本不会因此消失或重新计算。

## 4. 价格格式与归一化

Rate Card 只接受组件式格式：

```yaml
pricing:
  resource_uid: <rate-card-uuid>
  revision: 1
  currency: USD
  components:
    - { meter: input_tokens, per: 1000000, price: 0.14 }
    - { meter: cached_input_tokens, per: 1000000, price: 0.0028 }
    - { meter: output_tokens, per: 1000000, price: 0.28 }
```

`normalizeCatalogPricing` 只校验并返回规范 `{ currency, components[] }`。Compiler、导入层和运行时
都不会转换其他价格形态。成本为：

```text
Σ usage[meter] / component.per × component.price
```

`requests` 缺省按 1 次计算。价格和 `per` 必须为有限正数，未知字段或 meter 会在 Catalog 编译时被
拒绝；同一 Rate Card 中不得重复声明同一个 meter。

## 5. Cached token

`normalizeOpenAIUsage` 将缓存命中从 prompt token 中扣除：普通输入写入 `input_tokens`，缓存部分写入
`cached_input_tokens`，避免同一 token 同时按普通价和缓存价重复计费。OpenAI-compatible 与
DeepSeek 返回的兼容字段都走同一归一化逻辑。

## 6. 成本冻结与分析

成功物理 attempt 终结时，`RequestLogService` 用该请求固定的 Rate Card Revision 计算并冻结
`cost/cost_currency`。后续目录改价只影响新 Task/新请求，历史日志不回写。

`BillingService` 在 `ops.request_logs` 上提供：

| 端点                            | 维度                               |
| ------------------------------- | ---------------------------------- |
| `GET /admin/billing/overview`   | 总请求/成功/失败、用量、按币种成本 |
| `GET /admin/billing/by-model`   | model_id × 币种                    |
| `GET /admin/billing/by-member`  | owner_id × 币种                    |
| `GET /admin/billing/by-project` | project_id × 币种                  |

Overview 的请求数/成功/失败统计覆盖全部物理 Invoke attempt；按模型、成员、项目的明细只聚合
`status=success` 的物理 attempt。所有成本聚合都按 `cost_currency` 分组，不能把不同币种相加成一个
“总成本”。

`owner_id` 由调用方通过 Invoke 上下文传入，用于用户维度汇总；缺失时归入未知。配额和预算门禁仍是
后续能力，不应与已有的不可变计费历史混为一谈。

`/stats/*` 只统计当前 Workspace 的 Task 数量与状态，不返回 `estimated_cost`，也不按“成功任务数 ×
固定单价”推算费用。Overview/Usage 若不读取上述 Billing 聚合，就必须省略费用；任何界面都不能把
不同币种相加为单个总额。
