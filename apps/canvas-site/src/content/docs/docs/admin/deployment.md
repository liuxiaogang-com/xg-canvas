---
title: 生产部署
description: 规划 XG Canvas 的 Web、API、数据库、Redis 和对象存储。
sidebar:
  order: 1
---

## 服务拓扑

```text
canvas-web → canvas-api → 厂商 HTTP API / Dreamina CLI
                       → PostgreSQL
                       → Redis
                       → 远程 S3/R2
```

主应用是模块化单体。部署编排只暴露 Web 端口，API 通过 Web 容器的同源代理访问。

## 生产前检查

- 先在可信网络中完成 `/setup`，再开放公网入口。
- 配置真实 SMTP，生产环境不要依赖开发验证码回显。
- 确认对象存储桶已存在且 API 可以访问。
- 同时备份 PostgreSQL、对象存储与 `encryption-data` keyring 卷。
- 在反向代理中启用 HTTPS，并限制数据库、Redis 和管理端口的公网访问。

## 使用发布镜像

仓库根目录的 `docker-compose.yml` 默认使用公开 CNB 应用镜像，并集成 PostgreSQL 18 与
Redis 8：

```text
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-api:latest
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-web:latest
```

无需创建 `.env`，首次部署或更新时运行：

```bash
docker compose pull
docker compose up -d
```

部署编排只暴露 Web 端口，会先等待数据库健康并执行追加式迁移，再启动 API 与 Web。根密钥
自动生成并持久化；对象存储和 Provider 凭证在首次登录后的 `/settings` 中配置。Compose 对
`latest` 应用镜像设置了 `pull_policy: always`，部署时仍建议显式执行上述 `pull` 命令。

[CNB 构建流水线](https://cnb.cool/liuxiaogang/xg-canvas)生成公开应用镜像，正式部署目前统一使用
持续更新的 `latest` 标签。当前只构建 `linux/amd64`，ARM 设备尚未完成兼容验证。

无 Token 初始化采用 TOFU：首个成功请求成为实例 Owner。因此未初始化实例不能先暴露到
不可信公网。完成后初始化状态永久落库，重启不会重新开放入口。

## 静态官网

`canvas-site` 是独立静态站点，不属于自托管产品的运行依赖。它可部署到任意静态托管或 CDN。

## 升级

Beta 阶段尚未承诺无损升级。升级前应阅读 Changelog，并同时备份数据库、对象存储和
keyring 卷，再在测试环境验证迁移。PostgreSQL 18 使用 `/var/lib/postgresql` volume；不要把
旧 PostgreSQL 16 数据卷直接复用到新容器，应通过 dump/restore 迁移。
