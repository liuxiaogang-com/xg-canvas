---
title: 环境变量
description: XG Canvas 关键环境变量速查。
sidebar:
  order: 1
---

本地开发与发布编排都无需 `.env`。发布编排内置数据库、Redis 和公开 CNB 镜像地址；以下
变量只用于可选覆盖：

| 变量                                    | 用途                                                             |
| --------------------------------------- | ---------------------------------------------------------------- |
| `PUBLIC_BASE_URL`                       | 启用 Magic Link / OAuth 时必填的产品外部地址；密码登录不需要     |
| `DEMO_MODE`                             | 是否启用模拟任务，默认 `false`；复用当前已启用模型且不要求凭证   |
| `CANVAS_WEB_PORT`                       | Web 宿主机端口，默认 `5180`                                      |
| `CANVAS_API_IMAGE` / `CANVAS_WEB_IMAGE` | 覆盖公开 CNB `latest` 应用镜像地址，例如切换镜像代理或自建镜像源 |
| `POSTGRES_IMAGE` / `REDIS_IMAGE`        | 覆盖默认的 Docker Hub PostgreSQL 18 / Redis 8 官方镜像           |
| `CORS_ORIGIN`                           | 确有跨域前端时的显式 Origin 白名单；生产默认同源                 |
| `DREAMINA_CLI_PATH`                     | 仅本机开发覆盖；容器内路径固定                                   |

加密根密钥默认自动生成到 `encryption-data` 持久卷，不需要 `SETUP_TOKEN` 或密钥 env。
已有部署仍可提供 `ENCRYPTION_KEY_V1...Vn` 和 `ENCRYPTION_KEY_CURRENT`；服务会校验后导入
keyring，同一 key ID 内容冲突时拒绝启动。

修改覆盖项后需重建对应容器，例如 `docker compose up -d --force-recreate`。直接运行 API
源码时仍需提供 `DATABASE_URL` 与 `REDIS_URL`，但它们不是标准 Docker 部署的配置项。不要
提交包含真实连接信息或密钥的 `.env`。Provider 凭证与对象存储均在 `/settings` 配置。
