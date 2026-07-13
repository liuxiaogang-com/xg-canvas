# XG Canvas 品牌与命名规范

本文规定 XG Canvas 在产品、文档、代码、仓库和发布物中的统一写法。

## 1. 标准名称

| 场景          | 标准写法                                |
| ------------- | --------------------------------------- |
| 英文产品名    | **XG Canvas**                           |
| 中文产品名    | **西瓜画布**                            |
| 中英文并列    | **XG Canvas｜西瓜画布**                 |
| GitHub 用户名 | `liuxiaogang-com`                       |
| GitHub 仓库名 | `xg-canvas`                             |
| GitHub 地址   | `github.com/liuxiaogang-com/xg-canvas`  |
| CNB 地址      | `cnb.cool/liuxiaogang/xg-canvas`        |
| CNB 镜像空间  | `docker.cnb.cool/liuxiaogang/xg-canvas` |
| 本地项目目录  | `xg-canvas`                             |
| npm 包作用域  | `@xgcanvas`                             |
| 个人网站      | `liuxiaogang.com`                       |
| 产品网站      | `canvas.liuxiaogang.com`                |
| 作者署名      | **Liu Xiaogang / 刘小刚**               |
| 个人微信      | `CN-LXG`                                |
| 商务邮箱      | `git@liuxiaogang.com`                   |

核心原则：面向人使用 **XG Canvas**；仓库、目录和发布物使用 `xg-canvas`；npm workspace 包统一使用 `@xgcanvas/*`。

## 2. 面向用户的写法

Logo、官网标题、产品界面、README 标题、文章、演示文稿和发布标题统一写作：

```text
XG Canvas
```

中文语境统一写作：

```text
西瓜画布
```

第一次同时介绍中英文名称时使用：

```text
XG Canvas（西瓜画布）
```

标题或横向品牌展示可以使用：

```text
XG Canvas｜西瓜画布
```

推荐的首页标题：

```text
XG Canvas
西瓜画布
面向企业创意团队的开源、自托管 AI 创意生产平台
```

## 3. 技术标识的写法

仓库名、目录名、URL slug、命令行程序、容器镜像和发布文件统一使用小写加连字符：

```text
xg-canvas
```

示例：

```text
https://github.com/liuxiaogang-com/xg-canvas
https://cnb.cool/liuxiaogang/xg-canvas
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-api:latest
docker.cnb.cool/liuxiaogang/xg-canvas/canvas-web:latest
xg-canvas-v0.1.0.zip
```

npm scope 不使用仓库名的连字符形式，统一写作：

```text
@xgcanvas
```

workspace 包名使用 `@xgcanvas/<package-name>`：

```text
@xgcanvas/canvas-web
@xgcanvas/canvas-api
@xgcanvas/canvas-site
@xgcanvas/shared-types
@xgcanvas/adapters-contract
@xgcanvas/constraint-engine
@xgcanvas/ui-kit
```

这里的 `xgcanvas` 是 npm 包作用域，不是产品展示名，也不用于仓库或本地项目目录。不要因为包名使用 `@xgcanvas`，就把项目目录写成 `XGCanvas` 或 `xgcanvas`。

域名保持简短，不使用连字符：

```text
https://canvas.liuxiaogang.com
```

## 4. 代码命名

代码标识符遵循对应语言的命名习惯：

```ts
class XgCanvas {}

const xgCanvas = {};
const XG_CANVAS_VERSION = '0.1.0';
```

环境变量统一使用 `XG_CANVAS_` 前缀：

```text
XG_CANVAS_API_URL
XG_CANVAS_STORAGE_PATH
```

文件名和目录名使用 kebab-case：

```text
xg-canvas.config.ts
xg-canvas/
```

代码中的 `XgCanvas` 只是编程语言标识符；任何展示给用户的文字仍须写作 **XG Canvas**。

## 5. 版本与发布物

面向用户的版本名称：

```text
XG Canvas v0.1.0
XG Canvas Beta
```

机器可读的发布文件：

```text
xg-canvas-v0.1.0.zip
xg-canvas-v0.1.0-windows-x64.zip
```

## 6. 禁止写法

除代码标识符外，不使用以下变体：

```text
XGCanvas
XG-Canvas
Xg Canvas
xg Canvas
xg canvas
西瓜 Canvas
西瓜Canvas
XG 画布
```

不再引入 `LXG Canvas`、`Xigua Canvas`、`XG Studio` 或“西西瓜瓜”作为本项目的并列品牌名，避免名称层级和搜索结果分散。

## 7. README 推荐开头

```md
# XG Canvas

西瓜画布是一个面向企业创意团队的开源、自托管 AI 创意生产与画布平台。

Created by [Liu Xiaogang](https://liuxiaogang.com).
```

## 8. 授权版本的写法

项目不使用“社区版 / 企业版”区分功能，不写 `Community Edition` 或
`Enterprise Edition`。公开项目与商业交付基于同一套完整产品代码。

公开授权写作：

```text
AGPL-3.0-only
```

需要描述商业合作时使用：

```text
商业授权与企业定制
Commercial licensing and enterprise customization
```

标准说明：

```text
XG Canvas 的完整 Beta 代码以 AGPL-3.0-only 发布；如需保留专有修改、
进行闭源集成、交付客户私有分支或获得企业支持，可申请单独的商业授权。
```

## 9. 公开入口与联系方式

公开文档统一使用以下入口：

- GitHub 仓库：`https://github.com/liuxiaogang-com/xg-canvas`
- CNB 仓库与构建制品：`https://cnb.cool/liuxiaogang/xg-canvas`
- GitHub 问题与产品建议：`https://github.com/liuxiaogang-com/xg-canvas/issues`
- CNB 问题与产品建议：`https://cnb.cool/liuxiaogang/xg-canvas/-/issues`
- 内测与微信交流：`CN-LXG`
- 商业授权、企业定制与商务合作：`git@liuxiaogang.com`

微信群二维码有有效期，不能作为唯一或永久入口。群二维码失效时，统一引导用户添加微信
`CN-LXG`，备注 `XG Canvas 内测`。个人微信二维码后续可以替代纯微信号，但必须保留可复制的
微信号作为无障碍与失效兜底。

微信赞赏码使用外部 HTTPS 图片 URL，不把二维码图片提交到公开仓库。赞助文案只表述自愿
支持项目，不承诺功能优先级、技术支持、商业授权或其他对价。

## 10. 快速检查

提交涉及品牌名称的改动前，确认：

- 用户看到的是 **XG Canvas** 或 **西瓜画布**。
- 仓库、目录和发布文件使用 `xg-canvas`。
- workspace 包使用 `@xgcanvas/*`。
- GitHub 地址使用 `liuxiaogang-com/xg-canvas`。
- CNB 地址使用 `liuxiaogang/xg-canvas`，应用镜像使用 `docker.cnb.cool/liuxiaogang/xg-canvas/*`。
- 官网地址使用 `canvas.liuxiaogang.com`。
- 商务邮箱使用 `git@liuxiaogang.com`，内测微信使用 `CN-LXG`。
- 没有混入其他大小写、空格或连字符变体。
