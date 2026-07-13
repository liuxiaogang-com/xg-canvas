---
title: 故障排查
description: 排查安装、模型、任务和资产链路中的常见问题。
sidebar:
  order: 2
---

## API 无法启动

部署版先运行 `docker compose ps`，再检查 `postgres`、`redis`、`migrate` 和 `canvas-api` 日志。
标准编排不依赖外部 `DATABASE_URL` 或 `REDIS_URL`。若日志提示 keyring 缺失且数据库已有密文，
必须恢复 `encryption-data` 卷或旧 `ENCRYPTION_KEY_V*`，不要删除凭证或反复重建卷。
对象存储未配置不会阻止 API 启动。

## 日志提示 `INSTANCE_SETUP_RECOVERY_REQUIRED`

这表示旧数据库已有用户，却没有可用的 Owner/超管。服务会拒绝开放匿名初始化。先备份数据库，
再选择一个现有邮箱执行离线恢复：

```bash
docker compose run --rm --no-deps canvas-api \
  pnpm recover:instance-owner -- owner@example.com --confirm
docker compose up -d
```

该命令只接受已存在、状态正常且未合并的本地邮箱身份，并会转移唯一的 instance owner 标记。

## 模型没有出现在节点中

确认以下项目均已启用：

1. Model
2. Provider
3. Channel
4. Credential

模型可见并不表示厂商调用一定成功。还需要确认网络、额度、模型名称与凭证权限。

## 任务一直等待

确认 `canvas-api` 的任务运行器仍在运行，并检查数据库中的任务状态和后台请求日志。异步视频模型还需要等待厂商轮询完成。

## 生成成功但看不到资产

在 `/settings/object-storage` 测试 S3/R2 连接，并检查桶权限和公开访问主机。前端只使用 XG Canvas 返回的对象存储 URL，不直接使用厂商临时 URL。

## 搜索在文档开发模式中不可用

Starlight 的 Pagefind 索引在生产构建阶段生成。请先执行站点构建，再运行预览：

```bash
pnpm --filter @xgcanvas/canvas-site build
pnpm --filter @xgcanvas/canvas-site preview
```
