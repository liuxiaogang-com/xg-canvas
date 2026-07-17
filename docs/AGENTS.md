# docs Codex Guide

本目录是项目规范，不是事后总结区。改这里时同时遵守根目录 `AGENTS.md`。

## 文档职责

- 行为规范写入对应 spec：架构写 `architecture.md`，Catalog 身份/Revision/热加载写
  `model-catalog.md`，Adapter 扩展写 `adapter-guide.md`，节点写 `node-spec.md`，任务写
  `task-lifecycle.md`，API 写 `api-conventions.md`。
- `roadmap.md` 记录当前状态和后续方向，不替代正式 spec。
- 开源首发暂隐能力与恢复清单写 `open-source-deferred.md`（与 roadmap 交叉引用）。
- 不主动新增 README 或中间总结文档，除非用户明确要求。

## 同步规则

- 改代码行为时同步相关 spec。
- 如果代码和文档冲突，先按问题询问用户；用户确认后可以直接改文档。
- 文档要描述当前目标状态，避免保留已删除服务、旧字段、旧拓扑。
- 不写“临时先这样”的口吻；Beta 阶段可以大改，但抽象和扩展面要讲清楚。

