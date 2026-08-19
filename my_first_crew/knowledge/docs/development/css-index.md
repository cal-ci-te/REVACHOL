# REVACHOL CSS 样式体系索引

> 版本：v1.18.0 | 生成日期：2026-08-05
> 用途：快速定位样式、理解设计系统、AI 生成新组件时复用现有样式

---

## 架构概览

```
css/
├── base/
│   ├── variables.css          ← 设计令牌（颜色/字体/间距/圆角/阴影/Z-index）
│   ├── reset.css               ← 重置 + body 基础字体
│   └── layout.css              ← 应用布局 + 工具栏 + 头像 + 首屏 + 视频背景
├── themes/
│   ├── dark.css (198行)        ← 暗色主题（变量 + 全部组件覆盖）
│   ├── light.css (285行)       ← 亮色主题
│   └── lofi.css (284行)        ← 低保真主题
├── components/
│   ├── sidebar.css             ← 侧边栏（固定定位 + 折叠/展开 + 搜索框）
│   ├── directory.css           ← 目录树（节点/缩进/拖拽状态）
│   ├── articles.css            ← 文章网格 + 卡片（左右交替布局）
│   ├── detail.css              ← 详情页（标签页 + 正文排版 + 浮动窗）
│   ├── admin.css               ← 管理员面板（可复用 .admin-panel 基础组件）
│   ├── login.css               ← 登录弹窗
│   ├── modal.css               ← 通用弹窗
│   ├── watermark.css           ← 水印
│   ├── mobile-controls.css     ← 移动端控件
│   ├── deco-resize.css         ← 贴纸编辑高亮 + 缩放控制点 + 底部工具栏
│   ├── sticker-float.css       ← 文章内贴纸文字绕排
│   ├── puzzle.css              ← 滑动拼图组件
│   ├── puzzle-customizer.css   ← 拼图自定义面板
│   ├── magic-box.css           ← 3D 魔法箱子
│   ├── health-indicator.css    ← 健康监控指示器
│   └── draft-history.css       ← 草稿历史面板
├── editor/
│   ├── article-editor.css      ← 文章编辑模式（全屏覆盖层）
│   └── sticker-editor.css      ← 贴纸编辑模式（覆盖层 + 控制台）
└── utilities/
    ├── animations.css           ← 通用动画（pulse/fadeOut/toast/cardGlow/fadeInUp/heartbeat）
    ├── scrollbar.css            ← 全局滚动条样式
    └── responsive/
        ├── mobile.css           ← 手机端断点（≤768px）
        ├── small-mobile.css     ← 超小屏断点（≤480px）
        └── tablet.css           ← 平板端断点
```

**加载顺序**：`style.css` 通过 `@import` 按 `base → components → utilities` 顺序加载（见 style.css L7-L25）。三套主题 CSS 由 `ThemeService` 在 HTML 中预加载为 `<link>` 标签，切换时仅 toggle `disabled` 属性，不用 `@import`。

**主题切换机制**：dark/light 主题在 `:root` 中定义变量（全局生效），lofi 主题锁定在 `html[data-theme="lofi"]` 选择器下（由 ThemeService 动态设置）。

---

## C1 - CSS 变量体系（设计令牌）

**文件**：`css/base/variables.css`
**行数**：~146 行
**职责**：定义所有设计令牌——颜色、字体、间距、圆角、阴影、过渡、Z-index 层级。主题 CSS 文件覆盖其中的颜色变量部分。

### 核心变量分类

#### 颜色系统（三套主题值对比）

| 变量 | 暗色 (dark) | 亮色 (light) | 低保真 (lofi) | 用途 |
| :--- | :--- | :--- | :--- | :--- |
| `--color-bg-primary` | `#1a1612` | `#f5f0e8` | `#f0ebe0` | 页面主背景 |
| `--color-bg-secondary` | `#1e1a15` | `#ebe5db` | `#e8dfd0` | 面板/侧边栏背景 |
| `--color-bg-tertiary` | `#2a231c` | `#e0d8cc` | `#dacfc0` | 面板头部/按钮背景 |
| `--color-bg-card` | `#2a231c` | `#faf7f0` | `#fff9f0` | 卡片/输入框背景 |
| `--color-bg-card-start` | `#332b22` | `#f5f0e8` | `#fffaf2` | 卡片渐变起 |
| `--color-bg-card-end` | `#231e18` | `#e8e0d4` | `#f5ede0` | 卡片渐变止 |
| `--color-bg-skeleton` | `#3a2a1a` | `#d8d0c4` | — | 骨架屏 |
| `--color-bg-overlay` | `rgba(30,26,21,0.95)` | `rgba(245,240,232,0.95)` | `rgba(240,235,224,0.92)` | 全屏覆盖层 |
| `--color-border` | `#5a3e2b` | `#c4b8a8` | `#c0b0a0` | 默认边框 |
| `--color-border-light` | `rgba(90,62,43,0.3)` | `rgba(180,160,140,0.3)` | `rgba(160,140,120,0.2)` | 浅边框 |
| `--color-border-dashed` | `rgba(196,122,68,0.2)` | `rgba(180,160,140,0.2)` | `rgba(180,120,80,0.15)` | 虚线边框 |
| `--color-border-highlight` | `#c47a44` | `#b08050` | `#b08050` | 高亮/选中边框 |
| `--color-text-primary` | `#d4c9b8` | `#3a322a` | `#8a7a6a` | 正文文字 |
| `--color-text-secondary` | `#c4b5a0` | `#5a4a38` | `#9a8a7a` | 次要文字 |
| `--color-text-muted` | `#7a6a58` | `#8a7a68` | `#b0a090` | 弱化文字 |
| `--color-text-heading` | `#e8c88a` | `#5a3e2b` | `#7a6a5a` | 标题文字 |
| `--color-text-light` | `#b8a992` | `#6a5a48` | `#c0b0a0` | 浅色文字 |
| `--color-text-accent` | `#e8d5b5` | `#4a3222` | `#6a5a4a` | 强调文字 |
| `--color-accent` | `#c47a44` | `#b08050` | `#b09070` | 主强调色 |
| `--color-accent-dark` | `#5a3e2b` | `#8a5a3a` | `#8a7a60` | 深强调色 |
| `--color-accent-light` | `#e8c88a` | `#d4a87a` | `#d0c0a8` | 浅强调色 |
| `--color-accent-gold` | `#ffd966` | `#c49a5a` | `#c8b898` | 金色强调 |
| `--color-folder-1` | `#e8c88a` | `#8a7a60` | `#b8a88a` | 文件夹层级1 |
| `--color-folder-2` | `#d4b88a` | `#9a8a70` | `#c8b898` | 文件夹层级2 |
| `--color-folder-3` | `#c4a87a` | `#aa9a80` | `#d8c8a8` | 文件夹层级3 |
| `--color-folder-4` | `#b8a080` | `#baaa90` | `#e8d8b8` | 文件夹层级4 |
| `--color-hover` | `rgba(90,62,43,0.4)` | `rgba(160,140,120,0.25)` | `rgba(180,120,80,0.1)` | 悬停背景 |
| `--color-active` | `rgba(196,122,68,0.25)` | `rgba(180,120,80,0.15)` | `rgba(200,100,50,0.08)` | 激活背景 |
| `--color-success` | `#3a5a2b` | `#4a7a3a` | `#6a8a4a` | 成功色 |
| `--color-success-hover` | `#4a7a3a` | `#5a8a4a` | — | 成功悬停 |
| `--color-danger` | `#3a2a1a` | `#5a3e2b` | — | 危险色背景 |
| `--color-danger-hover` | `#5a3e2b` | `#7a4a3a` | — | 危险悬停 |
| `--color-error` | `#c44a44` | `#b04030` | `#b04030` | 错误色 |

> **关键差异**：暗色主题所有文字为浅色（`#d4c9b8` 系），亮色为深色（`#3a322a` 系），低保真为中间色调（`#8a7a6a` 系）且颜色对比度较低。

#### 字体系统

| 变量 | 暗色/亮色 | 低保真 (lofi) | 用途 |
| :--- | :--- | :--- | :--- |
| `--font-family-serif` | `'IM Fell English', 'Georgia', ...` | `'Patrick Hand', 'Comic Sans MS', cursive` | 正文衬线 |
| `--font-family-display` | `'Special Elite', 'Courier New', monospace` | `'Press Start 2P', 'Courier New', monospace` | 标题/工具栏 |
| `--font-family-mono` | `'Courier New', monospace` | `'Press Start 2P', 'Courier New', monospace` | 等宽字体 |
| `--font-family-base` | `var(--font-family-sans), var(--font-family-display), var(--font-family-serif), monospace` | `'Patrick Hand', 'Comic Sans MS', cursive` | 基础字体 |

> **注意**：lofi 主题完全替换了四个字体变量，并且 `--font-family-base` 直接硬编码为 `'Patrick Hand', ...` 而非变量拼接。

#### 间距系统（`--spacing-*`）

| 变量 | 值 |
| :--- | :--- |
| `--spacing-xs` ~ `--spacing-5xl` | `4px, 6px, 8px, 10px, 12px, 14px, 16px, 20px, 22px, 24px, 28px, 30px, 32px, 40px` |

#### Z-index 层级

| 变量 | 值 | 使用者 |
| :--- | :--- | :--- |
| `--z-base` | `0` | 普通元素 |
| `--z-bg` | `1` | 背景层 |
| `--z-watermark` | `2` | 水印 |
| `--z-deco` | `99` | 贴纸元素 |
| `--z-sidebar` | `1000` | 侧边栏 |
| `--z-admin` | `1001` | 管理员面板 |
| `--z-login` | `1002` | 登录组件 |
| `--z-modal` | `2000` | 弹窗 |
| `--z-toast` | `2100` | Toast 提示 |
| `--z-detail` | `3000` | 详情页覆盖层 |

#### 阴影系统

| 变量 | 默认值 | 特征 |
| :--- | :--- | :--- |
| `--shadow-sm` | `4px 4px 0 rgba(0,0,0,0.35)` | 硬阴影（像素风外观） |
| `--shadow-md` | `6px 6px 0 rgba(0,0,0,0.35)` | 硬阴影 |
| `--shadow-lg` | `8px 8px 0 rgba(0,0,0,0.4)` | 硬阴影 |
| `--shadow-xl` | `4px 4px 20px rgba(0,0,0,0.6)` | 软阴影 |
| `--shadow-focus` | `0 0 12px rgba(196,122,68,0.15)` | 聚焦辉光 |
| `--shadow-glow` | `0 0 30px rgba(196,122,68,0.2)` | 辉光效果 |

> **复用指南**：`.admin-panel`、`.sidebar`、`.card` 均使用 `--shadow-md`（硬阴影风格）。新建固定定位面板应复用此变量。

### 复用指南

> **创建新组件时**：
> - 始终使用 `var(--color-*)` 引用颜色，不硬编码色值
> - 字体使用 `var(--font-family-base)` 或 `var(--font-family-mono)`
> - 内边距使用 `var(--spacing-*)` 系列
> - 圆角使用 `var(--radius-sm/md/lg)`
> - z-index 参照上表层级，不要随意设 9999
> - 硬阴影面板直接复用 `box-shadow: var(--shadow-md)`

---

## C2 - 主题系统

**文件**：`css/themes/dark.css`, `light.css`, `lofi.css`
**行数**：198 / 285 / 284 行
**职责**：三套完整视觉主题，每套覆盖变量 + 布局 + 内容 + 侧边栏 + 交互控件五大区域。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `:root` | 定义主题 CSS 变量（dark/light） | 见 C1 颜色表 |
| `html[data-theme="lofi"] body` | lofi 专属多图纹理背景 | 9 层 `radial-gradient` + `repeating-linear-gradient` 叠加 |
| `html[data-theme="lofi"] body::after` | lofi CRT 扫描线覆盖 | `repeating-linear-gradient` + `mix-blend-mode: overlay` |
| `html body` | 暗色/亮色 body 背景色 + 背景图 | 暗色纯色 `#1a1612`；亮色 45° 斜纹 |
| `.card` / `.card:hover` | 卡片样式（各主题差异大） | 暗色/亮色：标准边框+阴影 ； lofi：不规则 `clip-path` 6 种形状 + `perspective` 3D 旋转 |
| `.detail-container` / `.detail-topbar` / `.detail-tab` | 详情页 | 暗色/亮色：标准色；lofi：`border-radius: 2px`，Press Start 2P 字体 |
| `.sidebar` / `.sidebar-header` | 侧边栏 | lofi：`backdrop-filter: blur(2px)` |
| `.tree-node-content` / `.tree-node-content:hover` / `.active` | 目录树节点 | lofi hover：`transform: translateX(4px)` |
| `.admin-panel` / `.panel-header` / `.panel-content` | 管理面板 | lofi：`border-radius: 2px`，7 号字体 |
| `button, .btn, .theme-btn` | 按钮 | 暗色/亮色 hover 标准色；lofi：`font-family: 'Press Start 2P'`，`transform: translate(-2px,-2px)` hover |
| `input[type="text"], textarea` | 输入框 | lofi：`font-family: var(--font-family-mono)`，`letter-spacing: 2px` |
| `#directory-context-menu` / `#deco-context-menu` / `#magic-box-context-menu` | 右键菜单 | 三个主题各自覆盖 |
| `.toolbar` / `h1` / `.subtitle` / `.copyright-bar` | 主页面装饰元素 | |
| `.toast-message` / `.toast-message.error` / `.success` | Toast 提示 | |
| `::-webkit-scrollbar-*` | 滚动条 | |
| `.login-modal` / `.login-trigger` | 登录相关 | |

### 主题差异关键点

| 特性 | 暗色 (dark) | 亮色 (light) | 低保真 (lofi) |
| :--- | :--- | :--- | :--- |
| 选择器作用域 | `:root`（全局） | `:root`（全局） | `html[data-theme="lofi"]`（限定） |
| 背景 | 纯深色 `#1a1612` | 浅色 + 斜纹 | 9 层渐变纹理 + CRT 扫描线 |
| 卡片 | 标准矩形 + 圆角 | 标准矩形 + 圆角 | 6 种不规则 `clip-path` + 3D 旋转 |
| 字体 | IM Fell English / Special Elite | 同暗色 | Patrick Hand / Press Start 2P |
| 按钮 hover | 颜色变化 | 颜色变化 + `transform: scale(0.97)` | `translate(-2px,-2px)` 像素偏移 |
| card hover | `translateY(-4px)` | `translateY(-4px)` | `rotateX(0.3deg) rotateY(-0.3deg) scale(1.015)` |
| 覆盖方式 | 全部 `!important` 覆盖 | 全部 `!important` 覆盖 | `html[data-theme="lofi"]` 前缀限定 |

### 切换机制

1. HTML 中预加载三套 `<link>` 标签（`#theme-stylesheet-dark/light/lofi`）
2. `ThemeService._switchThemeLink(themeId)` 仅 toggle `disabled` 属性
3. 零网络请求，即时切换

### 复用指南

> **新建主题时**：复制 `dark.css`，修改 `:root` 变量 + 各区域覆盖色值。
> **新建主题专属组件样式**：如仅在某主题下生效，使用 `html[data-theme="xxx"] .your-class` 选择器。

---

## C3 - 全局基础样式

**文件**：`css/base/reset.css` + `css/utilities/scrollbar.css`
**行数**：~16 + ~19 行
**职责**：CSS 重置、body 基础字体、全局滚动条。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `*` | 全元素重置 | `margin: 0; padding: 0; box-sizing: border-box` |
| `body` | 基础字体 + 背景色 | 字体栈含 PingFang SC / Microsoft YaHei / IM Fell English / Special Elite；背景 `#1a1612` |
| `::-webkit-scrollbar` | 滚动条宽度 | `width: 6px; height: 6px` |
| `::-webkit-scrollbar-track` | 滚动条轨道 | `background: var(--color-bg-secondary)` |
| `::-webkit-scrollbar-thumb` | 滚动条滑块 | `background: var(--color-border); border-radius: 4px` |
| `::-webkit-scrollbar-thumb:hover` | 滑块悬停 | `background: var(--color-accent)` |

### 复用指南

> **body 字体栈**是回退优先级最高处。新组件如需特定字体，使用 `var(--font-family-*)` 变量即可。**全局滚动条**已通过伪元素样式化，组件内如需自定义滚动条样式请设置 `scrollbar-width: thin` 并覆盖 `-webkit-scrollbar-*`。

---

## C4 - 布局系统

**文件**：`css/base/layout.css`
**行数**：~227 行
**职责**：应用级布局骨架（`.app-layout` → `.main-content`）、工具栏（`.toolbar`）、头像组件（`#siteAvatar`）、首屏说明区、全屏视频背景。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.app-layout` | 应用根布局 | `display: flex; min-height: 100vh; padding: 20px 20px 80px 20px` |
| `.main-content` | 主内容区 | `flex: 1; padding: 0 20px; min-width: 0` |
| `.toolbar` | 顶部工具栏 | `display: flex; justify-content: center; gap: 16px; border-bottom: 1px solid var(--color-border); padding-bottom: 20px` |
| `.header-decoration` | 标题装饰区 | `flex: 1; text-align: center` |
| `.avatar` | 默认头像容器 | `width: 60px; height: 60px; transform: rotate(1deg)` |
| `.avatar#siteAvatar` | 站点图标（标本悬挂） | `width: 70px; height: 70px; overflow: visible` — 含 `::before/::after` 针脚装饰 |
| `.avatar#siteAvatar img/span` | 悬挂图标内容 | `width: 130px; height: 130px`（100×100 → 溢出容器） |
| `.avatar.has-custom` | 自定义图标激活 | `span { display: none }` / `img { display: block }` |
| `@keyframes swingBox / swingIcon` | 入场摇摆动画 | 旋转摆动 0→4°→-4°→3°→-2°→0° |
| `.avatar.animate` | 触发入场动画 | `animation: swingBox 1.2s ease-in-out forwards` |
| `h1` | 主标题 | `font-family: var(--font-family-display); letter-spacing: 4px; text-transform: uppercase; text-shadow: 3px 3px 0 var(--color-bg-tertiary)` |
| `.subtitle` | 副标题 | `font-style: italic; letter-spacing: 2px` |
| `.copyright-bar` | 版权栏 | `text-align: center; font-size: 10px; border-bottom: 1px solid var(--color-border)` |
| `.hero-section` | 首屏区域 | `min-height: calc(100vh - 120px); display: flex; align-items: center; justify-content: center` |
| `.hero-content` | 首屏内容（默认隐藏） | `max-width: 800px; margin-top: -300px` |
| `.fullscreen-bg` | 视频背景容器 | `position: fixed; inset: 0; z-index: 0; pointer-events: none` |

### 复用指南

> **`.app-layout` + `.main-content`** 是应用整体布局骨架，新增页面布局不应重新定义。**`h1` 样式**（Special Elite 字体 + 4px 间距 + 大写 + 硬阴影）是本项目的标题视觉特征，新建标题应遵循此模式。**`#siteAvatar` 悬挂图标样式**可通过 `CustomIconManager` 通用化到任意自定义图标位置（见 `docs/development/custom-icon-guide.md`）。

---

## C5 - 管理员控制台（可复用面板）

**文件**：`css/components/admin.css`
**行数**：~473 行
**职责**：定义 `.admin-panel` 基础面板组件（被贴纸控制台、草稿面板、文章编辑器等多处复用），以及管理面板特有的贴图列表、颜色选择器、主题按钮、侧边工具栏。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.admin-panel` | **可复用基础面板** | `position: fixed; bottom: 20px; right: 20px; width: 320px; max-height: 70vh; border-radius: 8px; backdrop-filter: blur(8px); box-shadow: 4px 4px 0 rgba(0,0,0,0.3); overflow: hidden; display: none` |
| `.admin-panel.open` | 展开状态 | `display: block` |
| `.admin-panel.hidden` | 隐藏 | `display: none` |
| `.admin-panel.collapsed` | 折叠状态 | `width: 48px; min-width: 48px; max-width: 48px` — 隐藏 h4 + content |
| `.admin-panel .panel-header` | 拖拽标题栏 | `cursor: grab; padding: 10px 14px; display: flex; justify-content: space-between; background: var(--color-bg-secondary); border-bottom: 1px solid var(--color-border)` |
| `.admin-panel .panel-header:active` | 拖拽中 | `cursor: grabbing` |
| `.admin-panel .panel-header h4` | 面板标题 | 硬编码 `color: #e8c88a`（不跟随主题变量） |
| `.admin-panel .panel-header .toggle-icon` | 折叠图标 | `cursor: pointer; transition: transform 0.2s` |
| `.admin-panel .panel-content` | 面板内容区 | `padding: 12px 16px; max-height: calc(70vh - 50px); overflow-y: auto` |
| `.admin-panel .control-group` | 控件组 | `margin-bottom: 12px` |
| `.admin-panel label` | 标签 | `display: block; font-size: 11px; color: var(--color-text-secondary)` |
| `.admin-panel input, .admin-panel select` | 输入/选择 | `width: 100%; background: var(--color-bg-secondary); border: 1px solid var(--color-border); font: 11px 'Courier New'` |
| `.admin-panel button` | 面板按钮 | `background: var(--color-border); border: none; width: 100%; margin-top: 6px`；hover: `background: #c47a44` |
| `.admin-flex-row` | 弹性行布局 | `display: flex; gap: 8px; flex-wrap: wrap` |
| `.admin-button-group` | 按钮组 | `display: flex; gap: 8px; margin-top: 6px` |
| `.admin-slider-container` | 滑块容器 | `display: flex; gap: 8px; align-items: center` |
| `.theme-btn` | 主题切换按钮 | `flex: 1; border-radius: 4px; padding: 6px 12px` |
| `.theme-btn-dark / .theme-btn-light / .theme-btn-lofi` | 三主题按钮配色 | 各自硬编码主题色 |
| `.pos-mode-btn` | 位置管理模式按钮 | `width: auto; padding: 4px 12px; font-size: 11px` |
| `.pos-mode-enter / .pos-mode-save / .pos-mode-cancel` | 进入/保存/取消 | `background: var(--color-border/success/danger)` |
| `.side-toolbar` | 左上角工具架 | `position: fixed; left: 20px; top: 50px; z-index: 2999` — 折叠/展开双态 |
| `.tool-item` | 工具栏图标按钮 | `width: 40px; height: 40px; font-size: 18px` |

### 基础 `.admin-panel` 复用规范

`.admin-panel` 是被多处复用的基础组件：
- **贴纸控制台** (`#sticker-console-panel`) — 复用面板结构
- **草稿管理面板** (`#article-editor-draft-panel`) — 同时添加 `left: 20px; top: 80px` 定位
- **拼图自定义面板** (`.puzzle-customizer-panel`) — 独立实现但风格一致

### 复用指南

> **创建新的管理面板时**：
> 1. 直接使用 `.admin-panel` class，不做样式重定义
> 2. 通过 `style` 属性或单独 class 设置 `left/top/right/bottom` **定位**
> 3. 标题使用 `.panel-header > h4` 结构
> 4. 内容用 `.panel-content > .control-group > label + input` 结构
> 5. 需要拖拽时手动绑定 mousedown 事件（参考 `DraftManager._bindDrag`）
> 6. 不要在面板内重写颜色/边框/阴影（主题 CSS 已覆盖）
> 7. **面板宽度不超过 320px**，内容区域使用 `max-height: calc(70vh - 50px)` + `overflow-y: auto`

---

## C6 - 侧边栏

**文件**：`css/components/sidebar.css`
**行数**：~193 行
**职责**：固定定位的侧边栏（含目录树容器），支持 open/collapsed 双态、拖拽、搜索框、移动端遮罩层。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.sidebar` | 侧边栏容器 | `position: fixed; left: 20px; top: 80px; width: 300px; max-height: 70vh; border-radius: 8px; box-shadow: 4px 4px 20px rgba(0,0,0,0.6); z-index: 1000; overflow: hidden; display: none; flex-direction: column` |
| `.sidebar.open` | 显示 | `display: flex` |
| `.sidebar.collapsed` | 折叠 | `width: 52px; min-width: 52px; max-width: 52px` — 隐藏 sidebar-body + search |
| `.sidebar-header` | 拖拽标题栏 | `cursor: grab; padding: 10px 14px; border-radius: 8px 8px 0 0` |
| `.sidebar-header:active` | 拖拽中 | `cursor: grabbing` |
| `.sidebar-header h3` | 标题 | 硬编码 `color: #e8c88a` |
| `.sidebar-header-actions` | 右侧操作按钮 | `display: flex; gap: 6px` |
| `.sidebar-collapse-btn / .close-sidebar` | 折叠/关闭按钮 | `background: none; border: none; border-radius: 4px` |
| `.sidebar-body` | 目录树容器 | `padding: 8px 4px; overflow-y: auto; max-height: calc(70vh - 56px)` |
| `.sidebar-search` | 搜索栏 | `padding: 8px 12px; border-bottom: 1px solid var(--color-danger)` |
| `.sidebar-search-box` | 搜索输入框 | `width: 100%; padding: 8px 12px; border-radius: 4px; font: 13px 'Courier New'`；focus: `border-color: #c47a44; box-shadow: 0 0 12px rgba(196,122,68,0.15)` |
| `.sidebar-overlay` | 移动端遮罩 | `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 999` — 仅 ≤768px 显示 |

### 复用指南

> **创建新的浮层面板时**：不要复制侧边栏样式。使用 C5 的 `.admin-panel` 作为基础面板，或参照 `.sidebar` 的固定定位 + 双态模式。
> **搜索框样式**可直接复用 `.sidebar-search-box` class。

---

## C7 - 文章阅读样式

**文件**：`css/components/articles.css` + `css/components/detail.css`
**行数**：~245 + ~463 行
**职责**：文章卡片网格（左右交替布局）、详情页标签页系统、正文排版、浮动窗、最小化栏。

### 文章卡片网格（articles.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.articles-grid` | 文章网格容器 | `max-width: 1400px; display: flex; flex-direction: column; gap: 60px` |
| `.group-header` | 分类标题行 | `width: 100%; border-bottom: 1px solid rgba(196,122,68,0.2)` |
| `.group-header .folder-title` | 分类标题 | 硬编码 `color: #e8c88a; font-family: 'Special Elite'` |
| `.folder-title.level-1~6` | 6 级嵌套标题 | 不同字号/颜色/左边距（`#e8c88a` → `#b8a080`） |
| `.card` | 文章卡片 | `width: 50%; padding: 22px; box-shadow: 6px 6px 0 rgba(0,0,0,0.35); cursor: pointer; position: relative` — 含 `::before` 虚线内框 + `::after` 右下角折角装饰 |
| `.card-left` | 靠左对齐 | `align-self: flex-start; margin-right: auto; transform: rotate(-0.3deg)` |
| `.card-right` | 靠右对齐 | `align-self: flex-end; margin-left: auto; transform: rotate(0.4deg)` |
| `.card:hover` | 悬停 | `transform: rotate(0deg) translateY(-4px); border-color: #c47a44` |
| `.card.selected` | 选中 | `outline: 3px solid #c47a44; transform: scale(1.01)` |
| `.card h3` | 卡片标题 | 硬编码 `color: #e8c88a; border-left: 3px solid #c47a44` — 含 `::before '✦'` 前缀 |
| `.card-content` | 卡片内容 | `font: 0.9rem 'IM Fell English'; -webkit-line-clamp: 4` |
| `.card-meta` | 卡片元信息 | `font: 10px 'Courier New'; border-top: 1px solid #4a3a28` |
| `.skeleton-card` | 骨架屏占位 | `width: 50%; min-height: 200px` — odd/even 左右交替 |
| `@keyframes cardGlowPulse` | 滚动定位高亮 | `transform: scale(1) → scale(1.02) → scale(1)` |
| `.card.card-highlight` | 触发高亮动画 | `box-shadow: 0 0 0 4px var(--color-accent)` |

### 详情页标签页系统（detail.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.detail-overlay` | 全屏覆盖层 | `position: fixed; inset: 0; background: var(--color-bg-overlay); backdrop-filter: blur(12px); z-index: 3000` |
| `.detail-container` | 详情容器 | `display: flex; flex-direction: column; width: 100%; height: 100%` |
| `.detail-topbar` | 浏览器式顶部栏 | `height: 36px; display: flex; align-items: center` |
| `.detail-tabs` | 标签页列表 | `flex: 1; overflow-x: auto; gap: 2px` |
| `.detail-tab` | 单个标签页 | `height: 28px; padding: 4px 12px; border-radius: 6px 6px 0 0; font: 12px 'Courier New'` |
| `.detail-tab.active` | 当前标签 | `background: var(--color-bg-card); border-color: var(--color-border-highlight)` |
| `.detail-tab .tab-close` | 关闭按钮 | `font-size: 14px` — hover: `color: var(--color-error)` |
| `.detail-topbar-controls` | 右侧控制按钮 | `display: flex; gap: 2px` |
| `.detail-panes` | 内容面板区 | `flex: 1; overflow: hidden; position: relative` |
| `.detail-pane` | 单个内容面板 | `display: none; padding: 24px 32px; overflow-y: auto` |
| `.detail-pane.active` | 当前内容面板 | `display: block` |

### 文章正文排版（.detail-body）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.detail-body` | 正文容器 | `font: 1rem var(--font-family-serif); line-height: 1.8; white-space: pre-wrap` |
| `.detail-body h1` | 一级标题 | `font-size: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: 10px` |
| `.detail-body h2` | 二级标题 | `font-size: 1.6rem; border-left: 4px solid var(--color-border-highlight); padding-left: 12px` |
| `.detail-body h3` | 三级标题 | `font-size: 1.3rem; color: var(--color-accent-light)` |
| `.detail-body blockquote` | 引用块 | `border-left: 3px solid var(--color-border-highlight); font-style: italic; background: var(--color-active)` |
| `.detail-body code` | 行内代码 | `background: var(--color-bg-secondary); padding: 2px 8px; border-radius: 4px; font: 0.9rem var(--font-family-mono)` |
| `.detail-body pre` | 代码块 | `background: var(--color-bg-secondary); padding: 16px; border-radius: 8px; border: 1px solid var(--color-border)` |
| `.detail-body ul` | 无序列表 | `margin: 8px 0 12px 24px; list-style: disc` |

### 浮动窗 + 最小化栏

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.floating-window` | 浮动详情窗 | `position: fixed; z-index: 3100; min-width: 200px; max-width: 320px; border-radius: 8px; box-shadow: 6px 6px 0 rgba(0,0,0,0.35); backdrop-filter: blur(4px)` |
| `.minimized-bar` | 最小化标签栏 | `position: fixed; left: 20px; bottom: 0; height: 40px; overflow-x: auto; z-index: 3100` |
| `.minimized-item` | 最小化标签 | `display: inline-flex; height: 30px; border-radius: 4px; cursor: pointer` |

### 复用指南

> **正文排版**直接复用 `.detail-body` class 及其子元素选择器（h1-h3, blockquote, code, pre）。文章编辑器和贴纸编辑器均已复用此排版。**卡片交替布局**如需类似效果，使用 `.card-left` / `.card-right` class（由 JS 动态赋值）。**标签页系统**如需复用，参照 `.detail-topbar` + `.detail-tabs` + `.detail-panes` 结构。

---

## C8 - 贴纸交互样式

**文件**：`css/components/deco-resize.css` + `css/components/sticker-float.css`
**行数**：~119 + ~108 行
**职责**：页面级贴纸编辑高亮 + 缩放控制点 + 底部编辑工具栏 + 文章内贴纸文字绕排。

### 页面贴纸编辑（deco-resize.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.deco-editing, .deco-resizing` | 编辑模式高亮 | `outline: 2px dashed var(--color-accent); outline-offset: 4px; z-index: 99` |
| `.deco-edit-handle, .deco-resize-handle` | 右下角缩放手柄 | `position: absolute; bottom: -10px; right: -10px; width: 20px; height: 20px; cursor: nwse-resize; background: var(--color-accent); border-radius: 50%` |
| `.deco-edit-handle:hover` | 手柄悬停 | `transform: scale(1.2)` |
| `.deco-edit-toolbar` | 底部编辑工具栏 | `position: fixed; bottom: 40px; left: 50%; transform: translateX(-50%); padding: 14px 28px; border-radius: 14px; backdrop-filter: blur(8px); z-index: 10000` |
| `.deco-edit-toolbar .toolbar-btn` | 工具栏按钮 | `padding: 8px 20px; border: none; border-radius: 8px` |
| `.toolbar-btn.primary` | 主按钮（保存） | `background: #4caf50; color: #fff` |
| `.toolbar-btn.secondary` | 次按钮 | `background: var(--color-bg-tertiary); border: 1px solid var(--color-border)` |
| `.toolbar-btn.danger` | 危险按钮（删除） | `background: #e74c3c; color: #fff` |

### 文章内贴纸文字绕排（sticker-float.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.article-sticker` | 贴纸元素（默认左浮动） | `float: left; shape-outside: circle(50%); clip-path: circle(50%); width: 120px; height: 120px` |
| `.article-sticker.float-right` | 右浮动 | `float: right` |
| `.article-sticker:hover` | 悬停高亮 | `filter: brightness(1.1) drop-shadow(0 0 6px rgba(196,122,68,0.3))` |
| `.article-sticker-container::after` | 清除浮动 | `clear: both` |
| `.article-sticker-editing` | 编辑模式 | `float: none; shape-outside: none; clip-path: none; border: 2px solid transparent; cursor: grab` |
| `.article-sticker.animate-in` | 入场动画 | `animation: sticker-float-in 0.5s ease-out` |
| `@keyframes sticker-float-in` | 动画定义 | `scale(0.6) rotate(-5deg)` → `scale(1.05) rotate(1deg)` → `scale(1) rotate(0deg)` |
| `[data-theme="dark"] .article-sticker` | 暗色主题适配 | `filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4))` |
| `[data-theme="light"] .article-sticker` | 亮色主题适配 | `filter: drop-shadow(0 2px 8px rgba(0,0,0,0.15))` |
| `[data-theme="lofi"] .article-sticker` | 低保真适配 | `filter: drop-shadow(...) sepia(0.2)` |

### 复用指南

> **贴纸文字绕排**依赖 `float` + `shape-outside: circle(50%)`，仅限文章详情页使用。**底部编辑工具栏** `.deco-edit-toolbar` 是通用 fixed 定位工具栏，可以在其他需要底部操作栏的场景复用。

---

## C9 - 文章编辑模式样式

**文件**：`css/editor/article-editor.css`
**行数**：~131 行
**职责**：全屏覆盖层内的 WYSIWYG 文章编辑体验，复用 `.detail-body` 正文排版。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `#article-editor-overlay` | 全屏覆盖层 | `scrollbar-width: thin; scrollbar-color: var(--color-border) transparent` |
| `#article-editor-tabbar-placeholder` | 标签栏占位 | `height: 36px; background: var(--color-bg-secondary); border-bottom: 1px solid var(--color-border)` |
| `#article-editor-article` | 文章容器（与贴纸编辑器一致） | `max-width: 800px; margin: 4px auto 0; padding: 40px 50px 120px; font: 15px "Courier New"; line-height: 1.9; min-height: 80vh; position: relative` |
| `#article-editor-article h1` | 编辑器标题 | `font-size: 28px; padding-bottom: 16px; border-bottom: 1px solid var(--color-border)` |
| `#article-editor-article h2/h3` | 编辑器子标题 | `margin: 24px 0 10px` |
| `#article-editor-article blockquote` | 引用 | `border-left: 3px solid var(--color-accent); padding: 4px 16px; font-style: italic` |
| `#article-editor-article code` | 行内代码 | `background: var(--color-bg-tertiary); padding: 2px 6px; border-radius: 3px` |
| `#article-editor-article pre` | 代码块 | `background: var(--color-bg-tertiary); padding: 14px 18px; border-radius: 6px; border: 1px solid var(--color-border)` |
| `#article-editor-article ul/ol` | 列表 | `padding-left: 24px; margin: 8px 0` |
| `#article-editor-title[contenteditable="true"]` | 可编辑标题 | `outline: none; border-bottom: 2px solid var(--color-accent); cursor: text` |
| `.detail-body[contenteditable="true"]` | 可编辑正文 | `outline: 2px dashed var(--color-accent); outline-offset: 4px; padding: 8px; cursor: text; min-height: 200px` |
| `#article-editor-sticker-layer` | 贴纸叠加层（只读） | `position: absolute; inset: 0; pointer-events: none; z-index: 10` |
| `.article-editor-sticker` | 贴纸元素（只读） | `position: absolute; border: 1px solid transparent; border-radius: 4px` |
| `.article-editor-sticker:hover` | 贴纸悬停 | `border-color: var(--color-accent)` |

### 复用指南

> **文章编辑器排版**完全复用 `.detail-body` 的子元素规则（h1-h3, blockquote, code, pre）。**可编辑态指示**使用 `outline: 2px dashed var(--color-accent)` 模式，与其他编辑态一致。**全屏覆盖层**样式通过 JS 动态设置 `style.cssText`，CSS 文件仅提供排版规则和滚动条样式。

---

## C10 - 贴纸编辑模式样式

**文件**：`css/editor/sticker-editor.css`
**行数**：~131 行
**职责**：贴纸编辑全屏覆盖层 + 控制台面板 + 贴纸元素交互样式。

### 核心选择器

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `#sticker-editor-overlay` | 覆盖层滚动条 | `scrollbar-width: thin` |
| `@keyframes sticker-cursor-pulse` | 光标脉冲动画 | `scale(0.5)` → `scale(1.6)`，用于贴纸放置位置指示 |
| `@keyframes sticker-appear` | 贴纸入场动画 | `scale(0.3)` → `scale(1.1)` → `scale(1)` |
| `#sticker-editor-article` | 文章容器（与文章编辑器一致） | `max-width: 800px; margin: 40px auto; padding: 40px 50px; min-height: 80vh; position: relative; overflow: visible` |
| `#sticker-editor-article h1/h2/h3` | 文章标题 | 同 `.detail-body` 排版 |
| `#sticker-editor-article blockquote` | 引用 | `border-left: 3px solid var(--color-accent)` |
| `#sticker-editor-article code/pre` | 代码 | `background: var(--color-bg-tertiary)` |
| `#sticker-editor-layer` | 贴纸叠加层 | `position: absolute; inset: 0; pointer-events: none; z-index: 10` |
| `#sticker-console-panel` | 控制台面板 | `display: block` — 复用 `.admin-panel` 样式 |
| `#sticker-console-content` | 控制台内容 | `max-height: 320px; overflow-y: auto; scrollbar-width: thin` |
| `#sticker-context-menu button:hover` | 右键菜单按钮 | `background: var(--color-hover)` |
| `.article-sticker-editing` | 编辑中贴纸 | `border: 2px solid transparent; cursor: grab` — hover 显示边框高亮 |

### 复用指南

> **贴纸编辑覆盖层**和文章编辑器共享相同的容器尺寸（`max-width: 800px` + `padding: 40px 50px`），确保贴纸坐标在两个编辑器之间通用。**控制台面板**直接复用 `.admin-panel` class（C5），不单独定义面板样式。

---

## C11 - 移动端适配

**文件**：`css/utilities/responsive/mobile.css` + `small-mobile.css`
**行数**：~434 + ~158 行
**职责**：两个响应式断点的全局布局调整、组件尺寸缩放、特定功能隐藏。

### 断点定义

| 断点 | 文件 | 触发条件 |
| :--- | :--- | :--- |
| 手机 | `mobile.css` | `@media (max-width: 768px)` |
| 小屏手机 | `small-mobile.css` | `@media (max-width: 480px)` |

### mobile.css 关键调整（≤768px）

| 区域 | 调整内容 |
| :--- | :--- |
| **全局** | `.app-layout` → `padding: 12px 12px 60px 12px` |
| **首屏** | `.hero-section` → `min-height: auto`；`.hero-description` 字号缩小 |
| **视频背景** | `.fullscreen-bg` → `display: none`（完全隐藏） |
| **卡片** | `.card` → `width: 92%`（覆盖左/右交替） |
| **侧边栏** | 宽度缩小为 `180px`，折叠时为 `40px`，位置调整为 `left: 8px; top: 100px` |
| **管理员面板** | 宽度缩小为 `200px`，折叠时为 `40px` |
| **登录组件** | `position: fixed; top: 10px; right: 8px` |
| **详情页** | `.detail-pane` → `padding: 16px`；标题字号缩小 |
| **贴纸** | **全部隐藏**：`.deco-logo/.deco-stamp/.deco-raven` `display: none`；`[id^="deco-"]` `display: none` |
| **工具栏** | `.side-toolbar` → `left: 5px; top: 25px` |

### small-mobile.css 关键调整（≤480px）

| 区域 | 调整内容 |
| :--- | :--- |
| **全局** | `.app-layout` → `padding: 8px 8px 56px 8px` |
| **侧边栏** | 宽度缩小为 `180px`，折叠时为 `36px` |
| **管理面板** | 宽度缩小为 `170px` |
| **卡片** | `.card` → `padding: 12px`；`.card h3` → `font-size: 0.85rem` |
| **登录组件** | 头像缩为 `32px`，文字缩为 `8-9px` |

### 移动端隐藏规则汇总

以下功能在 `≤768px` 时完全禁用（不在 CSS 中而是在 JS 中判断 `window.innerWidth`）：
- 文章编辑模式（`article-editor-mode.js` L83）
- 贴纸编辑模式（`sticker-editor.css` L128-130 隐藏整个 `#sticker-editor-overlay`）
- 拼图组件（`Puzzle.js` 初始化判断）
- 贴纸上传/编辑按钮（通过 CSS `display: none`）

### 复用指南

> **移动端适配新增组件时**：在 `mobile.css` 中参考已有选择器的模式，缩减尺寸并测试。**移动端禁用功能**：如需要 JS 端判断，使用 `window.innerWidth <= 768` 模式。**贴纸在移动端完全隐藏**是项目设计决策（触摸拖拽冲突），不要在移动端尝试恢复贴纸功能。

---

## C12 - 交互组件样式

**文件**：`css/components/puzzle.css` + `css/components/puzzle-customizer.css` + `css/components/magic-box.css` + `css/components/health-indicator.css` + `css/components/draft-history.css`
**行数**：~224 + ~256 + ~341 + ~111 + ~120 行
**职责**：拼图组件、3D 魔法箱子、健康监控指示器、草稿历史面板的独立样式。

### 拼图组件（puzzle.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.puzzle-widget` | 拼图容器 | `max-width: 500px; margin: 24px auto; border-radius: var(--radius-md); border: 1px solid var(--color-border)` |
| `.puzzle-header` | 标题栏 | `display: flex; justify-content: space-between; padding: 8px 14px; border-bottom: 1px solid var(--color-border)` |
| `.puzzle-reset-btn` | 重置按钮 | `width: 30px; height: 30px; font-size: 16px; border-radius: 4px` |
| `.puzzle-canvas-wrapper` | Canvas 外容器 | `position: relative; overflow: visible` |
| `#puzzleCanvas` | Canvas 元素 | `display: block; width: 480px; height: 180px` |
| `.puzzle-block` | DOM 拼图块 | `position: absolute; z-index: 3; pointer-events: none; background-size: cover` |
| `.puzzle-gap` | DOM 缺口层 | `position: absolute; background: var(--color-bg-primary); z-index: 1` |
| `.puzzle-block.puzzle-block-aligned` | 对齐状态 | `box-shadow: 0 0 18px rgba(255,215,0,0.5)`（金色辉光） |
| `.puzzle-flash` | 闪光动画层 | `background: radial-gradient(rgba(255,215,0,0.6) 0%, transparent 70%)` |
| `.puzzle-flash-active` | 触发闪光 | `animation: flashPuzzle 0.6s ease-out forwards` |
| `.puzzle-slider` | 滑块容器（独立定位） | `overflow: visible; z-index: 90` |
| `.puzzle-track` | 滑块轨道 | `height: 18px; border-radius: 9px; cursor: pointer` — 含 `::before/::after` 限位块装饰 |
| `.puzzle-thumb` | 滑块手柄 | `width: 32px; height: 16px; cursor: grab; background: linear-gradient + var(--color-accent)` — 金属质感 |
| `.puzzle-thumb.puzzle-slider-thumb-active` | 拖拽中 | `cursor: grabbing; box-shadow: 0 0 30px rgba(255,215,0,0.2)` |
| `.puzzle-hint` | 提示文字 | `text-align: center; font: 12px 'Courier New'; color: var(--color-text-muted)` |
| `.puzzle-drag-handle` | 整体拖拽手柄 | `width: 18px; height: 18px; cursor: grab; border-radius: 3px` |

### 拼图自定义面板（puzzle-customizer.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.puzzle-customizer-overlay` | 模态遮罩 | `position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 10000` — 含 `fadeIn` 入场动画 |
| `.puzzle-customizer-panel` | 面板主体 | `width: 420px; max-width: calc(100vw - 32px); max-height: calc(100vh - 60px); padding: 20px 24px` — 含 `translateY` 入场动画 |
| `.puzzle-customizer-header` | 标题栏 | `display: flex; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid var(--color-border)` |
| `.puzzle-customizer-row` | 表单行 | `display: flex; align-items: center; gap: 10px; margin-bottom: 10px` |
| `.puzzle-customizer-label` | 标签 | `flex: 0 0 80px; font-size: 12px; text-align: right` |

### 3D 魔法箱子（magic-box.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.magic-box-container` | 箱子定位容器 | `position: fixed; right: 30px; bottom: 30px; z-index: 998; cursor: grab` |
| `.magic-box` | 3D 场景 | `width: 120px; height: 100px; perspective: 300px` |
| `.magic-box-lid` | 箱盖 | `transform-origin: bottom center; transform-style: preserve-3d; transition: transform 0.4s cubic-bezier` |
| `.magic-box.opening .magic-box-lid` | 开箱动画 | `transform: rotateX(-110deg)` |
| `.magic-box.closing .magic-box-lid` | 关箱动画 | `transition: transform 0.4s ease-in` |
| `.magic-box-lid-top` | 箱盖顶部平面 | `width: 120px; height: 22px; background: var(--color-bg-tertiary); border: 2px solid var(--color-border)` |
| `.magic-box-hinge` | 黄铜合页装饰 | `::before/::after`: `width: 14px; height: 6px; background: linear-gradient(#b08050, #8a5a3a)` |
| `.magic-box-body` | 箱体 | `height: 78px; border: 2px solid var(--color-border); border-top: none` — 含 `::before` 木纹纹理 |
| `.magic-box-lock` | 锁扣装饰 | `::before`: `14px` 金属方块；`::after`: `8px` 圆形锁孔 |
| `.magic-box-item` | 物品展示区 | `position: absolute; top: -60px` — 含 `.popping/.showing/.retracting` 三种动画状态 |
| `.magic-box-item-emoji` | 物品 Emoji | `font-size: 36px; filter: drop-shadow(...)` |
| `.magic-box-item-img` | 物品贴图 | `width: 48px; height: 48px; object-fit: contain` |
| `.magic-box-count` | 计数器 | `position: absolute; bottom: -22px` |
| `.magic-box-lid-custom-img / .magic-box-body-custom-img` | 箱盖/箱体贴图 | `position: absolute; background-size: cover; display: none`（通过 JS 激活） |
| `.magic-box.admin-drag` | 管理员拖拽提示 | `border-color: var(--color-border-highlight); box-shadow: 0 0 12px rgba(196,122,68,0.4)` |

### 健康监控指示器（health-indicator.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.health-indicator` | 指示器容器 | `display: flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: var(--radius-sm); cursor: pointer` |
| `.health-dot` | 状态圆点 | `width: 8px; height: 8px; border-radius: 50%` |
| `.health-indicator.ok .health-dot` | 正常状态 | `background: #5cb85c; box-shadow: 0 0 6px rgba(92,184,92,0.5)` |
| `.health-indicator.degraded .health-dot` | 降级状态 | `background: #f0ad4e; animation: health-pulse 2s ease-in-out infinite` |
| `.health-indicator.unreachable .health-dot` | 不可达状态 | `background: #d9534f; animation: health-pulse 1s ease-in-out infinite` |
| `@keyframes health-pulse` | 脉冲动画 | `opacity: 1 ↔ 0.4` |
| `#health-banner` | 全局横幅（全局故障提示） | `position: fixed; top: 0; left: 0; right: 0; z-index: 10001; padding: 8px 16px; text-align: center` |
| `#health-banner.warning` | 警告横幅 | `background: #f0ad4e; color: #1a1a1a` |
| `#health-banner.error` | 错误横幅 | `background: #d9534f; color: #fff` |

### 草稿历史面板（draft-history.css）

| 选择器 | 用途 | 关键属性 |
| :--- | :--- | :--- |
| `.history-panel` | 历史面板 | `max-height: 300px; overflow-y: auto; padding: 8px 12px; border-top: 1px solid var(--color-border)` |
| `.history-item` | 历史条目 | `border-bottom: 1px solid var(--color-danger); padding: 6px 0` |
| `.history-item .history-path` | 文件路径 | `font-size: 11px; font-weight: bold; color: var(--color-text-accent)` |
| `.history-item .history-time` | 时间戳 | `font-size: 10px; color: var(--color-text-muted)` |
| `.history-preview-btn` | 预览按钮 | `border: 1px solid var(--color-border)` |
| `.history-restore-btn` | 恢复按钮 | `background: var(--color-border)` — hover: `background: #c47a44` |
| `.history-delete-btn` | 删除按钮 | `color: var(--color-error)` |
| `.draft-preview-modal` | 预览弹窗 | `position: fixed; inset: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(4px); z-index: 9999` |
| `.draft-preview-box` | 预览内容 | `max-width: 600px; width: 90%; max-height: 80vh; border-radius: 12px; padding: 24px` |

### 复用指南

> **拼图组件的滑块轨道 + 手柄**模式适合需要自定义 range 输入的场景。**魔法箱子的 3D transform**（`perspective` + `rotateX`）提供了一个完整的 CSS 3D 动画参考。**健康指示器的三态圆点**模式（ok/degraded/unreachable）适用于任何需要状态指示的组件。**草稿预览弹窗**可直接复用 `.draft-preview-modal` + `.draft-preview-box` 结构。

---

## 附录 A：CSS 变量完整引用表

以下列出所有在主题文件之外（组件 CSS）中直接使用 `var(--color-*)` 但**不从主题 CSS 继承**（即硬编码在组件 CSS 中的 fallback 值）：

| 组件文件 | 变量 | fallback 值 |
| :--- | :--- | :--- |
| `puzzle.css` | `--color-bg-secondary` | `#2a231c` |
| `puzzle.css` | `--color-bg-primary` | `#1a1612` |
| `puzzle.css` | `--color-bg-tertiary` | `#1a1612` |
| `puzzle.css` | `--color-accent` | `#c9a87c` |
| `deco-resize.css` | `--color-accent` | `#c47a44` |
| `deco-resize.css` | `--color-bg-primary` | `#1a1612` |
| `deco-resize.css` | `--color-bg-secondary` | `#2a2520` |
| `sticker-float.css` | `--color-accent` | `#c47a44` |
| `article-editor.css` | `--color-bg-secondary` | `#1e1a15` |
| `article-editor.css` | `--color-bg-tertiary` | `#2a231c` |
| `article-editor.css` | `--color-text-primary` | `#d4c9b8` |
| `article-editor.css` | `--color-text-heading` | `#e8c88a` |
| `article-editor.css` | `--color-accent` | `#c47a44` |
| `sticker-editor.css` | `--color-bg-tertiary` | `#2a231c` |
| `puzzle-customizer.css` | `--color-bg-secondary` | `#1e1a15` |
| `puzzle-customizer.css` | `--color-text-heading` | `#e8c88a` |

> **注意**：这些 fallback 值均为暗色主题默认值。当主题切换时，CSS 变量会被主题文件覆盖，fallback 仅在变量未定义时生效。

---

## 附录 B：新增组件样式检查清单

在创建新组件 CSS 文件时，请逐项确认：

- [ ] 颜色：全部使用 `var(--color-*)`，不硬编码色值
- [ ] 字体：使用 `var(--font-family-*)` 系列
- [ ] 间距/圆角：优先使用 `--spacing-*` / `--radius-*` 变量
- [ ] 阴影：使用 `--shadow-*` 变量（如需要硬阴影风格）
- [ ] Z-index：参照 C1 的 Z-index 层级表，不随意设 9999
- [ ] Scrollbar：如需自定义，使用 `scrollbar-width: thin` + `scrollbar-color`
- [ ] 三主题适配：测试暗色/亮色/低保真三套主题显示
- [ ] 移动端：≤768px 添加 `@media` 断点适配
- [ ] CSS 文件位置：放入 `css/components/`（通用组件）或 `css/editor/`（编辑器）
- [ ] 引入方式：在 `css/style.css` 中添加 `@import url(...)`（如全局使用）或通过 JS 动态注入（懒加载场景）
