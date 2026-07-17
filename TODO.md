# XG Canvas 工程 TODO

这里只记录近期可执行的工程任务。产品方向以 [`docs/roadmap.md`](./docs/roadmap.md)
为准；公开版暂隐入口以 [`docs/open-source-deferred.md`](./docs/open-source-deferred.md)
为准。

## 公开 Beta 发布验证

- [ ] 确认 CNB `main` push 在 clean runner 通过 lint、test、max-lines、全仓 build 和双镜像发布。
- [ ] 使用 CNB 构建的镜像完成一次空环境 `docker compose up -d` 冷启动 smoke。
- [ ] 在新的 PostgreSQL 数据卷回放全部迁移，并验证旧 Beta 结构会 fail closed。
- [ ] 跑通百炼 / DashScope 的真实生图、生视频、失败重试、资产归档和请求日志。
- [ ] 验证主流 S3 / R2 兼容桶的浏览器 CORS、源文件直传和视频缩略图降级。
- [ ] 演练 PostgreSQL、对象存储和 `encryption-data` 卷的备份与恢复。

## 产品链路收口

- [ ] 将 `/settings/mail` 保存的 SMTP 配置接入真实发信；环境变量只保留兼容回退。
- [ ] 统一生成 / 画布提交失败时的「缺能力」提示，并链接管理员配置指引。
- [ ] 完善凭证向导的 modality deep-link 和供应商自动筛选。
- [ ] 恢复人物 / 音色 / 风格的厂商资源绑定 UI，并做 credential-scoped 验证。
- [ ] 按 readiness 与公开能力门禁恢复音频、文本和工具型节点入口。
- [ ] 增加找回密码、成员邀请通知等依赖 `mail` ready 的完整流程。

## 测试与文档

- [ ] 增加上传、资源库、任务恢复和参考素材插槽的浏览器 E2E。
- [ ] 增加任务 lease 超时、Worker 崩溃恢复和对象存储补偿删除的集成测试。
- [ ] 补齐安装、Provider 配置、首个工作流、升级备份和故障排查文档。
- [ ] 建立正式版本发布、变更日志和升级失败后的恢复流程。

## 约束

- `/setup` 只负责认领实例与创建首位管理员，不扩展为配置向导。
- 免费可测的集成必须真实验证后才算 ready；会消耗模型额度的能力只要求存在可用模型。
- TODO 完成后直接删除，不在这里积累历史实施记录。
