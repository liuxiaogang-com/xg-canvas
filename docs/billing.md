# XG Canvas — 计费(billing)规范

> 配套 [task-lifecycle.md](./task-lifecycle.md) / [architecture.md](./architecture.md) §4.3。
> 计费的真相源是 `ops.request_logs`(每次厂商调用一行),不是 `canvas.tasks`。

## 1. 原则:原生计量,不强行换算

不同厂商的计量单位不同 —— 有的按 **token**,有的按 **秒**(视频),有的按 **张**(图片),有的按 **次**。XG Canvas **不**把它们换算成统一的"点数",而是让每个模型用**自己的原生计量**计价、用**自己的币种**记账;聚合时**按币种分别求和**,不跨币种换算。

## 2. 费率卡:两种存储格式,统一归一化

模型费率存在 `account.model_definitions.pricing`(jsonb),历史上有两种形态,`CostService.normalizePricing` 把两者归一为 `{currency, components:[{meter, per, price}]}`:

| 形态 | 例子 | 归一化后的 component(s) |
|---|---|---|
| 组件式(DeepSeek) | `{currency, components:[{meter:input_tokens, per:1e6, price:0.14}, …]}` | 原样 |
| 扁平 token(OpenAI/豆包) | `{unit:token, input_price_per_1k, output_price_per_1k}` | `input_tokens`/`output_tokens`,`per:1000` |
| 扁平秒(视频) | `{unit:second, price_per_second}` | `seconds`,`per:1` |
| 扁平张(图片) | `{unit:image, price_per_image\|standard_price}` | `images`,`per:1` |
| 扁平次 | `{unit:request, price_per_request}` | `requests`,`per:1`(无 usage 也计 1) |

成本 = Σ over components of `usage[meter] / per × price`(`requests` 计量缺省记 1)。

## 3. 冻结成本(= 版本化)

成功请求在写 `request_logs` 时(`RequestLogService.record` → `CostService.computeCost`),按模型**当时**的费率算出 `cost` + `cost_currency` **冻结**到该行。改价只影响之后的请求,历史行不回写 —— 这就实现了"**新请求新价、旧价锁定**",无需单独的费率版本历史表。

- `CostService` 进程内缓存费率,TTL 60s;新导入/改价的模型在 TTL 后或显式 `invalidate()` 后生效。
- 无费率的模型(如手动导入未设 pricing)→ `cost=null`(不计费,不报错)。

## 4. 多维分析

`BillingService`(`/admin/billing/*`,AdminGuard)在 `ops.request_logs` 上聚合:

| 端点 | 维度 |
|---|---|
| `GET /admin/billing/overview` | 总请求/成功/失败、入/出 token、按币种成本 |
| `GET /admin/billing/by-model` | 按 model_id × 币种 |
| `GET /admin/billing/by-member` | 按 owner_id × 币种(join `canvas.users`) |
| `GET /admin/billing/by-project` | 按 project_id × 币种(join `canvas.projects`) |

前端在 `/settings/billing`(概览 + 按模型/成员/项目)。成本求和保留各币种独立(不混合)。

## 5. owner 归属

`owner_id` 经 `InvokeRequest` 从调用方(chat / 后续 task)传入并落到 `request_logs.owner_id`,用于按用户计费/用量;未带 owner 的请求归到"未知"。

## 6. 待办(依赖其它能力)

- **配额(quotas)**:按 项目/模型/用户 设上限 + 软提示放行 —— 依赖**用户体系 + RBAC**,排在其后。
- 显式费率版本历史表:目前"冻结"已满足旧价锁定;若需"查看某模型历史价格曲线"再引入 `rate_cards` 版本表。
- 缓存命中 token 拆分:DeepSeek 的 `cached_input_tokens` 当前未从 usage 拆出,缓存输入暂按 `input_tokens` 全价计(略高)。
