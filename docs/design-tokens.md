# XG Canvas — 设计主题语言

> 所有色彩 / 圆角 / 间距 / 字体 / 状态色都从此处取。
> 设计约束由本文、`apps/canvas-web` 的 CSS 变量和 `packages/ui-kit` 的共享组件共同维护。
> 改动主题 ⇒ 先更新本文语义 token ⇒ 同步 CSS 变量与共享组件。

## 1. 主题策略

- **canvas-web** 默认 **暗色主题**(`dark`),沉浸的画布工作环境。背景近黑、强调色冷紫蓝青、玻璃浮层。
- canvas-web 同时支持 **浅色主题**(`light`),由用户全局切换(`system/light/dark`,默认 dark;见 `apps/canvas-web/src/store/theme.ts`)。管控页(原 account-admin)已并入 canvas-web 的 `/settings`,跟随同一主题,不再是独立的浅色后台。
- 两种主题共用同一组语义 token(primary/text-on-accent/success/warning/...),仅 surface/text 取值不同。

CSS 变量:dark 挂在 `:root`,light 用 `html[data-theme='light']` 覆盖(dark 为默认)。Tailwind 通过 `darkMode: 'class'` 切换。

## 2. 色彩 Tokens

### 2.1 Brand · 强调色(双主题共用)

```css
--c-accent: #14b8a6; /* 主青绿 */
--c-accent-hover: #2dd4bf;
--c-accent-soft: #0b3432; /* 暗色主题下使用 */
--c-cyan: #22d3ee; /* canvas 选中环 */
--c-pink: #f471b5;
--gradient-aurora: linear-gradient(90deg, #14b8a6 0%, #38bdf8 100%); /* 提交 / "+" */
```

### 2.2 Canvas(暗色主题)

```css
--c-bg-canvas: #05060a; /* 画布最深底 */
--c-bg-app: #0e1014; /* 创作端默认 app 背景 */
--c-canvas-card: #101321; /* 节点 / 卡片 */
--c-canvas-panel: #161b2e; /* 右栏 / 浮层 */
--c-canvas-panel-2: #1a2138; /* 输入框内 */
--c-canvas-border: #242840;
--c-canvas-border-soft: #1a1f33;

/* glass 浮层(top dock / 命令栏 / 工具栏) */
--c-glass: rgba(14, 19, 34, 0.93); /* 0E1322EE */
--c-glass-stroke: rgba(255, 255, 255, 0.12);

/* 文本 4 级 */
--c-text-on-dark-1: #ffffff;
--c-text-on-dark-2: rgba(255, 255, 255, 0.7);
--c-text-on-dark-3: rgba(255, 255, 255, 0.44);
--c-text-on-dark-4: rgba(255, 255, 255, 0.25);
```

### 2.3 Light(浅色主题)

```css
--c-bg-light: #f7f8fa;
--c-bg-light-surface: #ffffff;
--c-bg-light-input: #f1f3f5;
--c-bg-light-hover: #edeff3;
--c-border-light: #e5e7eb;
--c-text-light-1: #1a1f29;
--c-text-light-2: #5b6473;
--c-text-light-3: #8c95a4;
--c-text-light-4: #b5bbc6;
--c-text-on-accent: #ffffff;
```

### 2.4 状态色(共用)

```css
--c-success:        #22C55E;    --c-success-soft:  #0F2A1A; /* dark */ #DCFCE7 /* light */
--c-warning:        #F59E0B;    --c-warning-soft:  #3A2710 / #FEF3C7
--c-danger:         #EF4444;    --c-danger-soft:   #3A1414 / #FEE2E2
--c-info:           #38BDF8;    --c-info-soft:     #0F2233 / #DBEAFE
```

### 2.5 IO 端口色(节点连线/角标)

每种 IO 类型一个颜色,与 `docs/node-spec.md §1` 对齐:

```css
--c-port-text: #60a5fa; /* 文本 */
--c-port-image: #34d399; /* 图片 */
--c-port-image-list: #34d399;
--c-port-grid: #34d399;
--c-port-video: #f472b6; /* 视频 */
--c-port-audio: #fbbf24; /* 音频 */
--c-port-json: #94a3b8;
--c-port-reference: #fb7185;
--c-port-mask: #fb7185;
--c-port-style: #2dd4bf;
--c-port-entity: #22d3ee; /* 角色/场景/物品/分镜 */
--c-port-library: #a78bfa; /* 素材库引用 */
```

### 2.6 固定深色媒体舞台

视频、音频和全屏浮层播放器始终使用固定深色舞台，不随应用明暗主题反转；这样可避免媒体画面、进度条和控制按钮在浅色主题下失去对比。组件只使用以下语义 token，不在局部 CSS 重复硬编码黑白色：

```css
--color-media-surface: #07080c;
--color-media-scrim: rgba(5, 6, 10, 0.72);
--color-media-control: rgba(5, 6, 10, 0.55);
--color-media-control-hover: rgba(255, 255, 255, 0.1);
--color-media-chrome: #ffffff;
--color-media-chrome-soft: rgba(255, 255, 255, 0.82);
--color-media-track: rgba(255, 255, 255, 0.22);
--color-media-tooltip: rgba(10, 12, 18, 0.9);
--gradient-media-controls: linear-gradient(
  180deg,
  rgba(5, 6, 10, 0) 0%,
  rgba(5, 6, 10, 0.5) 40%,
  rgba(5, 6, 10, 0.86) 100%
);
--shadow-media-control: 0 0 0 1px rgba(255, 255, 255, 0.12);
--shadow-media-floating: 0 24px 80px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.06);
```

## 3. 圆角 Tokens

```css
--r-xs: 4px; /* tag, dot */
--r-sm: 6px; /* button, input */
--r-md: 10px; /* card, panel */
--r-lg: 14px; /* modal, big card */
--r-xl: 20px; /* node media, hero card */
--r-2xl: 24px; /* command bar */
--r-full: 9999px; /* pill, avatar */
```

## 4. 间距 Tokens(8 倍数 + 4 微调)

```css
--s-1: 4px;
--s-2: 8px;
--s-3: 12px;
--s-4: 16px; /* 默认 padding */
--s-5: 20px;
--s-6: 24px; /* 区块外 padding */
--s-8: 32px; /* 板块间 */
--s-10: 40px;
--s-12: 48px; /* hero / 大区块 */
```

## 5. 字体 Tokens

```css
--font-sans: 'Inter', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
--font-mono: 'JetBrains Mono', 'SF Mono', Menlo, monospace;
--font-display: 'Inter', sans-serif; /* 与 sans 同字族,加重字重区分 */
```

字号阶梯:

```
--text-2xs: 10px / 1.4    label, hint
--text-xs:  11px / 1.4    badge, micro
--text-sm:  12px / 1.5    secondary
--text-base:13px / 1.5    body
--text-md:  14px / 1.5    button, emphasized body
--text-lg:  16px / 1.4    h6
--text-xl:  18px / 1.3    h5 (admin page title)
--text-2xl: 22px / 1.3    h4
--text-3xl: 24px / 1.25   h3 (auth heading)
--text-4xl: 28px / 1.2    h2 (KPI)
--text-5xl: 32px / 1.2    h1 (landing pitch)
```

字重:`400 / 500 / 600 / 700`(只用这 4 档)。

## 6. 阴影

```css
--shadow-sm: 0 2px 6px rgba(0, 0, 0, 0.08);
--shadow-md: 0 6px 18px rgba(0, 0, 0, 0.18);
--shadow-lg: 0 14px 36px rgba(0, 0, 0, 0.32);
--shadow-glow-accent: 0 0 32px rgba(20, 184, 166, 0.42);
--shadow-glow-cyan: 0 0 28px rgba(34, 211, 238, 0.4); /* 选中态 */
```

## 7. 节点壳布局(Layout Zone)

- 节点 **没有外框**;由"chip 标题 / 媒体 / chip 状态"三件套自由组合
- chip:`background: var(--c-glass); padding: 4px 10px; border-radius: var(--r-full); font-size: var(--text-xs);`
- 媒体:`border-radius: var(--r-lg);`
- 选中态:在媒体外加 `box-shadow: var(--shadow-glow-cyan); outline: 1.5px solid var(--c-cyan);`

## 8. 通用浮层(canvas)

```
top dock / left dock / zoom bar / 命令栏 / 工具栏 / 节点工具
└─ 共享:
    background: var(--c-glass);
    border: 1px solid var(--c-glass-stroke);
    border-radius: var(--r-full);
    backdrop-filter: blur(12px);
    box-shadow: var(--shadow-md);
```

## 9. 不许出现的事情

- ❌ 写死颜色十六进制(例外:画板内 mock 渐变示意)
- ❌ 间距用 7px / 13px 之类非 token 值
- ❌ 直接用 #000 / #FFF(用 `--c-text-on-dark-1` / `--c-text-light-1` 等语义)
- ❌ 节点用普通 `border: 1px solid` 卡片包起来(已在 v0.2 弃用)
- ❌ 局部硬切主题(主题由 `html[data-theme]` 全局切换,画布与 `/settings` 跟随同一主题,不得给某个区域单独写死 dark/light)

## 10. 实现指引

### 10.1 canvas-web(CSS 变量)

token 定义在 `apps/canvas-web/src/styles/tokens.css`:

```css
@import '@xgcanvas/ui-kit/tokens.css'; /* 全部 token 定义 */

:root {
  /* 默认 dark */
  color-scheme: dark;
}

html[data-theme='light'] {
  /* 浅色主题全局切换(画布与 /settings 共用) */
  color-scheme: light;
}
```

### 10.2 Tailwind(packages/ui-kit/tailwind.config.ts)

```ts
export default {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: 'var(--c-accent)',
        canvas: { card: 'var(--c-canvas-card)', panel: 'var(--c-canvas-panel)' /* ... */ },
        port: { text: 'var(--c-port-text)', image: 'var(--c-port-image)' /* ... */ },
      },
      borderRadius: {
        xs: 'var(--r-xs)',
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        '2xl': 'var(--r-2xl)',
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        glow: 'var(--shadow-glow-accent)',
        'glow-cyan': 'var(--shadow-glow-cyan)',
      },
    },
  },
};
```

### 10.3 同步要求

界面实现不得绕过语义 token 写死主题颜色。新增或修改视觉变量时，应同步本文、
`apps/canvas-web/src/styles/tokens.css` 与 `packages/ui-kit` 中使用该变量的组件。

## 11. 版本

| 版本 | 日期       | 变更           |
| ---- | ---------- | -------------- |
| v0.1 | 2026-05-07 | 初版设计 token |
