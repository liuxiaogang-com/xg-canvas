---
title: 安装 XG Canvas
description: 使用开发栈或发布镜像启动 XG Canvas。
sidebar:
  order: 2
---

## 本地开发

需要 Docker 与 Docker Compose。可从 GitHub 获取源码：

```bash
git clone https://github.com/liuxiaogang-com/xg-canvas.git
cd xg-canvas
```

中国大陆网络环境也可以使用 CNB：

```bash
git clone https://cnb.cool/liuxiaogang/xg-canvas
cd xg-canvas
```

获取源码后启动开发栈：

```bash
docker compose -f docker-compose.dev.yml up --build
```

开发编排不要求 `.env`，包含 PostgreSQL、Redis、数据库迁移、持久化加密 keyring、API 与
Web 热加载。默认地址：

- 产品端：`http://localhost:5180`
- API：`http://localhost:5181`

首次打开产品会自动进入 `/setup`。填写管理员名称、邮箱和密码后，系统会原子创建首位
Owner、超级管理员权限和个人 Workspace，并直接登录，无需 Token 或重启服务。

## 使用发布镜像部署

只下载仓库中的 `docker-compose.yml` 即可启动，不要求 `.env`：

```bash
docker compose up -d
```

Compose 会从 [CNB 公开制品库](https://cnb.cool/liuxiaogang/xg-canvas)拉取
`canvas-api:latest` 与 `canvas-web:latest`，启动 PostgreSQL 18、Redis 8，先执行数据库迁移，
再启动 API 与 Web。只有 Web 的 `5180` 映射到宿主机，因此不会与已有 PostgreSQL、Redis 或
API 端口冲突。加密根密钥在首次启动时自动生成到 `encryption-data` 持久卷；Provider 与
对象存储凭证在 `/settings` 中配置。

请先在可信网络中完成 `/setup`，再开放公网入口：无 Token 初始化采用“首个成功请求成为
Owner”的机制，完成后入口永久关闭。不要预置默认管理员账号。

备份时必须同时保存 PostgreSQL、对象存储与 `encryption-data` 卷；只恢复数据库而丢失
keyring，会导致已加密的 Provider/S3 Secret 无法解密。

当前 CNB 镜像只构建 `linux/amd64`，正式部署统一使用持续更新的 `latest` 标签。ARM NAS 尚未
完成兼容验证。升级前先备份，再执行：

```bash
docker compose pull
docker compose up -d
```

PostgreSQL 16 的数据卷不能直接用于 PostgreSQL 18，已有部署应通过 dump/restore 迁移。
