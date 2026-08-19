# REVACHOL 项目上下文

> 本文档为 AI 协作提供项目全貌。每次新会话开始，请先阅读本文档。

---

## 项目概述

**REVACHOL** — 原创角色档案馆，一个带内容管理、贴纸装饰、水印保护、多主题切换的 Web 应用。

- **代码规模**：约 2 万行（前后端 + 测试 + 部署）
- **当前版本**：v1.18.1
- **项目类型**：全栈个人项目，持续迭代中

---

## 技术栈

### 前端
- 原生 ES Module（无框架，无构建工具依赖）
- 自研状态管理：`AppState` + `EventBus`
- 自研路由层：`enhance.cjs`（15个端点，无需Express）
- CSS 变量驱动主题系统（3套：dark / light / lofi）

### 后端
- Node.js 原生 http 模块
- sql.js（SQLite WASM，零配置部署）
- WebSocket（原生，广播式）
- 存储适配器模式（本地文件系统 ↔ S3 兼容）

### 部署
- Docker Compose（镜像加速、非 root 运行、健康检查）
- ErrPulse 监控集成

---

## 核心模块清单

### 前端模块

| 模块 | 路径 | 职责 |
| :--- | :--- | :--- |
| 文章编辑模式 | `js/editor/article-editor-mode.js` | 主控制器，协调各子模块 |
| 文章编辑器核心 | `js/editor/article-editor-core.js` | 状态管理（_article, _dirty, _snapshot） |
| 文章编辑器渲染 | `js/editor/article-editor-renderer.js` | 文章渲染 + contentEditable |
| 文章编辑器贴纸 | `js/editor/article-editor-stickers.js` | 贴纸渲染、拖拽、右键菜单 |
| 文章编辑器快捷键 | `js/editor/article-editor-keys.js` | ESC / Ctrl+S / Ctrl+Enter |
| 文章编辑器保存 | `js/editor/article-editor-save.js` | 草稿保存、发布、快照恢复 |
| 文章编辑器工具栏 | `js/editor/article-editor-toolbar.js` | 悬浮工具栏（可拖拽/折叠） |
| 贴纸编辑模式 | `js/editor/sticker-editor-mode.js` | 沉浸式全屏贴纸编辑 |
| 贴纸渲染 | `js/editor/sticker-renderer.js` | 贴纸标记解析与渲染 |
| 贴纸形状 | `js/editor/sticker-shape.js` | 16边形生成 + 位置推荐 |
| 草稿管理 | `js/editor/draft-manager.js` | 草稿列表、恢复、删除 |
| 组件管理器 | `js/core/component-manager.js` | 统一组件生命周期 |
| 贴纸服务 | `js/services/deco-service.js` | 贴纸 CRUD 与交互 |
| 文章服务 | `js/services/article-service.js` | 文章 CRUD |
| 健康监控 | `js/services/health-monitor.js` | 后端健康状态轮询 |
| 目录侧边栏 | `js/ui/components/sidebar.js` | 目录树 + 右键菜单 |
| 管理员控制台 | `js/admin/panel.js` | 悬浮控制台（拖拽/折叠） |
| 形状生成器 | `js/utils/shape-generator.js` | 16边形顶点生成（缓存） |

### 后端模块

| 模块 | 路径 | 职责 |
| :--- | :--- | :--- |
| 服务入口 | `backend/server.cjs` | HTTP 服务 + WebSocket |
| 数据库 | `backend/db.cjs` | sql.js 初始化与迁移 |
| 路由 | `backend/routes/*.cjs` | 文章/贴纸/草稿/设置/认证/健康 |
| 存储适配器 | `backend/storage/*.cjs` | 本地 ↔ S3 切换 |
| 认证 | `backend/auth.js` | Token 生成/验证 |
| WebSocket | `backend/websocket.cjs` | 广播式实时通信 |

---

## 模块依赖关系
article-editor-mode (主控制器)
├── article-editor-core (状态)
├── article-editor-renderer (渲染)
│ └── Utils.escapeHtml
├── article-editor-stickers (贴纸)
│ ├── DecoShelf
│ ├── StickerShape
│ └── EventBus
├── article-editor-keys (快捷键)
├── article-editor-save (保存)
│ ├── ApiClient
│ └── ArticleService
├── article-editor-toolbar (工具栏)
├── draft-manager (草稿)
│ └── ApiClient
└── sticker-editor-mode (贴纸编辑)
├── DecoShelf
├── StickerShape
└── EventBus

text

---

## 代码风格规范

- **模式**：对象字面量（`const ModuleName = { ... }`）
- **缩进**：2 空格
- **变量声明**：`const` 优先，`let` 次之，避免 `var`
- **注释**：JSDoc 风格（`/** ... */`）
- **命名**：camelCase（变量/函数），PascalCase（类）
- **文案**：所有 UI 文案统一在 `js/utils/ui-strings.js`
- **事件**：所有事件常量统一在 `js/core/event-constants.js`

---

## 设计约束（关键！）

### 平台约束
- **移动端**：≤768px 禁用所有编辑功能（文章编辑、贴纸编辑、拼图）
- **桌面端**：完整功能

### 主题约束
- 三套主题：`dark` / `light` / `lofi`
- 所有颜色使用 CSS 变量：`var(--color-*)`
- 主题切换通过 `document.documentElement.dataset.theme`

### 数据约束
- 贴纸数据格式：`{ decoId, x, y, width, height, align, margin, shape, vertices }`
- 贴纸坐标相对于文章容器（`.detail-body`），不是视口
- 草稿数据格式：`{ id, article_id, title, content, category, stickers, saved_at }`
- `stickers` 字段为 JSON 字符串

### 存储约束
- 工具栏位置：`localStorage.article_editor_toolbar_pos`
- 侧边栏位置：`localStorage.article_editor_draft_pos`
- 控制台位置：`localStorage.sticker_console_pos`
- 主题偏好：`localStorage.rv_selected_theme`

### 交互约束
- ESC 退出：需双击确认（1.5s 窗口）
- Ctrl+S：保存草稿
- Ctrl+Enter：发布
- 贴纸右键菜单：浮动方向切换 + 删除

---

## 最近改动（2026-08-04）

- 文章编辑模式重构：800+ 行 → 7 个模块（见 `TASK_STATUS.md`）
- 贴纸编辑模式新增（沉浸式全屏）
- 组件管理系统（ComponentManager）全面加固
- 移除组件独立版本号体系（统一到 package.json）

---

## 已知技术债

1. 文章编辑模式：控制台拖拽在编辑模式下位置偏移（P2）
2. 恢复草稿时贴纸位置不准确（P1）
3. 光标位置估算粗糙（用 lines.length * 22 而非精确计算）
4. 贴纸库为空时无加载状态指示

---

## 相关文档

- 组件管理器文档：`docs/development/component-manager.md`
- 贴纸编辑器文档：`docs/development/sticker-editor.md`
- 代码风格规范：`docs/development/code-style.md`
- 任务状态：`TASK_STATUS.md`
- 需求检查清单：`REQUIREMENTS_CHECKLIST.md`