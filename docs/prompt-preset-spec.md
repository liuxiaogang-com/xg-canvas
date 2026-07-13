# XG Canvas — 提示词预设规范

## 1. 范围(两层)

- **system**:全局内置,所有用户可用,只读(只能管理员经 canvas-web /settings 编辑)
- **user**:登录用户私有,可增删改

> 不做"项目级"——项目内的差异化通过节点本地的 prompt 字段实现,不沉淀为预设。
> 不做"团队共享"——MVP 单租户多用户,共享需求用"复制到我的预设"完成。

## 2. 数据结构(`canvas.prompt_presets`)

| 字段 | 说明 |
|---|---|
| `id` UUID | |
| `scope` | `system` \| `user` |
| `owner_id` | 当 scope=user 时必填,system 时为 NULL |
| `task_type` | 关联任务类型(`text_generation`/`image_generation`/`video_generation`/`audio_generation`),NULL 表示通用 |
| `category` | 分类 tag(如 `电影感` / `卡通` / `广告文案`),用于前端面板分组 |
| `title` | 预设名 |
| `content` JSONB | 预设内容,见 §3 |
| `cover_asset_id` | 可选效果图,展示用 |
| `sort_order` INT | |
| `created_at` / `updated_at` |

## 3. `content` 形态

预设可以注入到不同字段,因此用 JSONB 描述"该预设要往哪些字段填什么":

```json
{
  "fields": {
    "prompt": { "mode": "append", "value": "电影感打光,虚化背景,胶片颗粒" },
    "aspect_ratio": { "mode": "set", "value": "16:9" },
    "camera_control": { "mode": "set", "value": { "type": "film", "focal": 35 } }
  }
}
```

注入模式 `mode`:
- `set`:直接覆盖
- `append`:字符串追加(prompt)/ 数组追加(inputs.references)
- `prepend`:同上但插前
- `merge`:对象浅合并

## 4. UI

### 4.1 节点内"提示词预设"按钮
- 弹出面板,展示该 task_type 的 system + 自己的 user 预设
- 分类 tab(category),搜索框
- 每条预设带 cover 缩略图、title、效果说明
- 点击 → 注入到节点对应字段(若多字段就按 `content.fields` 全部注入)
- 注入后字段标记"来自预设 X",可一键还原

### 4.2 用户预设管理页
- 列表 / 创建 / 编辑 / 删除
- 创建时可选择"从当前节点参数生成预设":把节点当前所有非默认字段抓出来
- 收藏 system 预设 → 自动 fork 一份到 user 名下

## 5. 注入点

- 提示词预设是**前端注入**,不在后端拦截
- 这样后端的 task params 就是注入后的最终值,符合"参数即真相"
- 节点 schema 可以在 `params_top.prompt_preset` zone 显式声明此节点支持哪些 category 过滤

## 6. 风格预设(style preset)与提示词预设的关系

- 风格预设是 `style_token`(一种 IO 类型),由厂商或我们预生成的"风格指纹"
- 提示词预设是文本/参数级别的填空模板
- 二者**独立**,可同时使用
- M2 只做提示词预设,风格预设(M3+)按需追加

## 7. 内置 system 预设(M2 提供 ≥ 20 条)

由 seed migration 写入,清单暂存于 `database/migrations/canvas/seeds/prompt-presets.sql`。

按 task_type 分桶,每桶覆盖几个常见类别:
- `text_generation`:剧本润色 / 文案改写 / 翻译 / SEO 文案 / ...
- `image_generation`:电影感 / 二次元 / 厚涂 / 摄影 / 海报 / ...
- `video_generation`:运镜推进 / 慢动作 / 切镜节奏 / ...
- `audio_generation`:朗读 / 配音 / BGM 类型 / ...

## 8. 编辑/审核

- system 预设的修改通过 canvas-web /settings 管理页(M2 末由 canvas-api 提供专用 admin route,经 AdminGuard 鉴权)
- user 预设由用户自己管,无审核
