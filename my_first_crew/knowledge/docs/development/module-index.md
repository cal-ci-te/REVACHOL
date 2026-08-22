# REVACHOL 模块索引

> 版本：v1.23.0-wip | 更新：2026-08-22
>
> 本文档基于代码现状扫描生成，用于降低单人维护的认知负荷。模块增减时应同步更新本索引。
> 文件数与实际目录一致（前端 `js/` 130 个文件、后端 `backend/` 26 个文件、CrewAI `my_first_crew/` 53 个文件）。

---

## 一、前端模块（`js/`）

### 1.1 `core/` — 基础设施层（7 个文件）

| 文件 | 职责 | 关键依赖 | 被依赖方 |
|---|---|---|---|
| `app-state.js` | 集中式状态管理（类 Vuex）：`commit(mutation)` 变更 + subscriber 通知 | 无 | 全局 |
| `event-bus.js` | 全局事件总线：`on/off/emit/once` | 无 | 全局 |
| `event-constants.js` | 全部事件常量 `EVENTS.*`（含 `CREW_*`） | 无 | 全局 |
| `state-mutations.js` | 全部 mutation 常量 `MUTATIONS.*`（含 `SET_CREW_STATE`） | 无 | 全局 |
| `component-manager.js` | 组件统一管理：register/init/mount/unmount、状态追踪、错误隔离、拓扑排序、超时保护 | EventBus、EVENTS | `app.js`、`crew-dashboard.js`、各组件 |
| `app-initializer.js` | 应用初始化：模块初始化顺序拓扑排序 | — | `app.js` |
| `dom-refs.js` | 集中式 DOM 引用 | — | 多个 UI 模块 |

依赖方向：`core/` 内部基本独立，被 `services/`、`ui/`、`admin/`、`editor/`、`components/` 广泛依赖。

### 1.2 `services/` — 业务服务层（17 个文件）

| 文件 | 职责 | 关键依赖 | 被依赖方 |
|---|---|---|---|
| `api-client.js` | fetch 封装：请求/响应拦截器、Token 自动注入、401 处理 | — | 全局（除纯工具外几乎所有业务模块） |
| `article-service.js` | 文章 CRUD、分类管理、目录树数据唯一数据源 | ApiClient、AppState、EventBus、StorageAdapter | `ui/components/directory/`、`admin/panel/`、`stores/` |
| `crew-service.js` | Crew Dashboard 服务：`/api/crew/*` REST + WebSocket 连接 + 握手超时/指数退避/轮询降级 | ApiClient、AppState、EventBus、EVENTS、MUTATIONS | `crew-dashboard-component.js`、`pages/crew-dashboard.js` |
| `deco.js` | 贴纸业务：贴纸库、渲染位置管理 | ApiClient、EventBus | `ui/components/deco-ui.js`、`admin/` |
| `deco-repository.js` | 贴纸数据仓库：本地缓存 + 服务器同步 + 失败重试 | ApiClient、StorageAdapter | `deco.js` |
| `deco-edit.js` | 贴纸统一编辑模式（移动 + 缩放） | EventBus、EVENTS | `admin/panel/handlers/deco-edit.js` |
| `health-monitor.js` | 健康监控：轮询 `/api/health`、指数退避、多标签页同步 | ApiClient、BroadcastChannel | `app.js` |
| `theme-service.js` | 主题加载/切换（三套预加载 + disabled toggle）、favicon | Utils.storage、EventBus、Texture、ContextMenu | 全局 |
| `site-icon.js` | 站点图标实例 | StorageAdapter | `app.js` |
| `custom-icon.js` | 通用自定义图标管理器 | StorageAdapter | 站点图标等 |
| `texture.js` | 背景纹理 | — | `theme-service.js`、`admin/` |
| `watermark.js` | 平铺水印层 | — | `app.js` |
| `hero-background.js` | 首页视频背景 | — | `app.js` |
| `notification-service.js` | Toast 通知 | — | 全局 |
| `storage-adapter.js` | localStorage 适配（`rv_` 前缀 + JSON 序列化） | — | 全局 |
| `visibility-service.js` | 页面可见性管理 | — | `health-monitor.js` 等 |
| `websocket-service.js` | 通用 WebSocket 封装（主站广播） | EventBus | 主站广播消费方 |

### 1.3 `ui/components/` — UI 组件（24 个文件）

| 文件 | 职责 | 关键依赖 |
|---|---|---|
| `sidebar.js` | 左侧目录树容器与状态 | AppState、EventBus |
| `directory.js` + `directory/`（12 个文件） | 目录树模块化实现：渲染、拖拽排序、右键菜单、位置管理、移动端控制 | ArticleService、ArticleListStore、EventBus |
| `detail.js` | 文章详情标签页（全屏/最小化/贴纸渲染） | ArticleService、StickerRenderer、ThemeService |
| `articles.js` | 文章卡片网格渲染 | ArticleService、MarkdownUtils |
| `search.js` | 文章搜索 | ArticleService |
| `helpers.js` | UI 通用工具 | — |
| `deco-ui.js` | 贴纸库与贴纸 UI | DecoService |
| `magic-box/`（5 个文件） | 魔法箱子组件（开箱动画/物品池/拖拽） | EventBus、ComponentManager |

依赖方向：`ui/components/` 依赖 `services/` 与 `core/`，不反向依赖 `admin/` 或 `editor/`。

### 1.4 `admin/` — 管理面板（28 个文件）

| 文件/子目录 | 职责 | 关键依赖 |
|---|---|---|
| `auth.js` | 登录/登出状态管理 | ApiClient、AppState |
| `avatar.js` | 头像上传/裁剪 | ApiClient |
| `drag.js` / `position.js` | 管理面板拖拽与位置管理 | EventBus |
| `state.js` | 管理面板状态 | AppState |
| `ui.js` | 管理面板 UI 文案/交互 | EventBus |
| `index.js` | 管理面板入口 | 子模块聚合 |
| `panel/`（16 个文件） | 面板渲染（`render.js`/`palette.js`/`index.js`）+ 事件绑定（`events/`）+ 分类处理器（`handlers/`：auth/avatar/bg-color/deco-edit/gradient/magic-box/texture/theme/video/watermark）+ `action-delegator`/`article-manager` | ApiClient、DecoService、ThemeService、MagicBox |
| `events/`（3 个文件） | 上下文菜单与全局事件 | EventBus |
| `puzzle/`（2 个文件） | 拼图自定义面板 | Puzzle 组件 |

### 1.5 `editor/` — 编辑器（18 个文件）

| 文件 | 职责 | 关键依赖 |
|---|---|---|
| `article-editor-mode.js` | 全屏模态 WYSIWYG 文章编辑器 | MarkdownUtils、AnchorManager、DraftManager |
| `article-editor-toolbar.js` | 编辑器工具栏（标题/保存/贴纸/草稿） | EventBus |
| `editor-content.js` | 编辑内容构建/保存 | ContentBuilder、StickerRenderer |
| `editor-keys.js` | 编辑器快捷键 | — |
| `editor-overlay.js` | 编辑覆盖层 | — |
| `editor-stickers.js` | 编辑器内贴纸层刷新 | StickerShape、DecoRepository |
| `draft-manager.js` | 草稿历史侧边面板（恢复/删除/自动保存） | ApiClient |
| `anchor-manager.js` | 贴纸锚点管理（计算/定位/序列化） | — |
| `content-builder.js` | 按锚点构建带贴纸标记的内容 | — |
| `sticker-renderer.js` | 贴纸 DOM 渲染/标记解析 | — |
| `sticker-shape.js` | 贴纸形状与位置推荐 | — |
| `sticker-editor/`（7 个文件） | 贴纸编辑器主控（`index.js`）+ 控制台/键盘/覆盖层/保存/贴纸/工具栏子模块 | AnchorManager、ContentBuilder、DecoRepository |

### 1.6 `utils/` — 工具函数（11 个文件）

| 文件 | 职责 |
|---|---|
| `ui-strings.js` | 全局文案统一管理（`UI.*`） |
| `markdown-utils.js` | Markdown → HTML 渲染、HTML 识别 |
| `dom.js` | `escapeHtml`/`stripHtml`/`truncateHtml` 等 DOM 工具 |
| `broadcast-helper.js` | BroadcastChannel 跨标签页通信封装 |
| `storage.js` | storage 接口（委托 StorageAdapter） |
| `function.js` | debounce/throttle |
| `image.js` | 图片压缩 |
| `toast.js` | Toast 实现 |
| `shape-generator.js` | 多边形顶点生成（`@deprecated`，贴纸已改固定矩形） |
| `touch-context.js` | 移动端长按上下文 |
| `utils.js` | 向后兼容聚合导出 |

### 1.7 `pages/` — 页面入口（1 个文件）

| 文件 | 职责 |
|---|---|
| `crew-dashboard.js` | `/crew-dashboard.html` 独立入口：注册拦截器、恢复登录态、`ThemeService.init()`、注册并挂载 crew-dashboard 组件 |

### 1.8 其他前端模块

| 模块 | 职责 |
|---|---|
| `app.js` | 主应用入口：初始化 AppInitializer、注册全局命名空间 `window.__REVACHOL__` |
| `config.js` | 前端配置常量 |
| `bootstrap/`（3 个文件） | `module-registry`（组件注册）、`broadcast-setup`（跨标签页广播）、`ui-injector`（UI 注入） |
| `components/`（5 个文件） | ComponentManager 适配器：`deco`/`puzzle`/`magic-box`/`health`/`crew-dashboard` |
| `mobile/`（4 个文件） | 移动端检测、触摸拖拽、触摸上下文 |
| `puzzle/`（6 个文件） | 拼图组件核心（`Puzzle.js` + `core/` 渲染/拖拽/状态/事件） |
| `stores/article-list-store.js` | 文章列表派生状态 Store |
| `models/article-model.js` | 文章数据模型 |

---

## 二、后端模块（`backend/`）

### 2.1 `routes/` — 路由层（5 个文件）

| 文件 | 职责 | 关键依赖 |
|---|---|---|
| `articles.cjs` | 文章 CRUD 路由 | db、auth、validate |
| `decos.cjs` | 贴纸路由 | db、auth、validate |
| `drafts.cjs` | 草稿路由 | db、auth、cleanup-drafts |
| `settings.cjs` | 站点设置路由 | db、auth |
| `crew.cjs` | Crew Dashboard 路由：spawn Python 子进程、解析 NDJSON、翻译为 `CREW_*` WS 广播、内存状态快照 | child_process、websocket.broadcast、auth、enhance |

> 注：`/api/auth/login|logout|me` 认证路由直接在 `server.cjs` 中注册，`routes/` 下没有独立的 `auth.cjs` 路由文件。

### 2.2 核心模块

| 文件 | 职责 | 被依赖方 |
|---|---|---|
| `server.cjs` | HTTP 服务器入口：路由注册、认证端点、上传处理、启动 WebSocket | 镜像 CMD |
| `db.cjs` | sql.js 数据库封装（查询/执行/导出） | 全部路由 |
| `auth.cjs` | Token 生成/验证/撤销 + `requireAuth`/`requireRole` 包装器 | 全部写路由 |
| `websocket.cjs` | 广播式 WebSocket：`/websocket/` 路径、心跳保活、`broadcast()` | `crew.cjs`、`server.cjs` |
| `enhance.cjs` | 轻量 Web 增强层：`send`/`sendError`/`json` 统一响应 | 全部路由 |
| `upload.cjs` | 文件上传处理 | `server.cjs` |
| `validate.cjs` | 业务校验 | 路由层 |
| `utils.cjs` | 通用工具 | 路由层 |

### 2.3 `storage/` — 存储适配器

| 文件 | 职责 |
|---|---|
| `config.cjs` | 存储配置（STORAGE_TYPE 等） |
| `index.cjs` | 适配器工厂 |
| `storage-service.cjs` | 存储服务（读写/迁移） |
| `adapters/local.cjs` | 本地文件系统适配器 |
| `adapters/rustfs.cjs` | S3 兼容（RustFS/MinIO）适配器 |
| `migration/migrate.cjs` | 数据迁移 |

### 2.4 脚本与工具

`scripts/seed-admin.js`（管理员种子）、`cleanup-drafts.cjs`（草稿清理）、`check-tables.cjs`/`check.cjs`/`test.cjs`（诊断）、`migrate.cjs`（迁移入口）

---

## 三、依赖关系速查

### 3.1 前端依赖链

```
crew-dashboard.html                      index.html
        │                                    │
        ▼                                    ▼
pages/crew-dashboard.js ─────────────── app.js
        │                                    │
        ▼                                    ▼
services/crew-service.js            bootstrap/* + ui-controller
        │                                    │
        ├─► api-client ◄─────────────────────┤
        ├─► app-state / event-bus ◄──────────┤
        └─► component-manager ◄──────────────┤
                                              │
        ui/components/*  ←  services/*  ←  core/*
        admin/*          ←  services/*  ←  core/*
        editor/*         ←  services/* + utils/*
```

关键约束：
- `core/` 不依赖 `services/`、`ui/`、`admin/`、`editor/`（单向依赖）
- `services/` 不依赖 `ui/` 与 `admin/`
- `admin/`、`editor/` 通过 EventBus 与 AppState 解耦，不直接互相调用
- 所有业务请求统一走 `ApiClient`（自动注入 Token）

### 3.2 后端依赖链

```
server.cjs
  ├─► routes/articles.cjs ─► db.cjs ─► storage/*
  ├─► routes/decos.cjs   ─► db.cjs
  ├─► routes/drafts.cjs  ─► db.cjs
  ├─► routes/settings.cjs─► db.cjs
  ├─► routes/crew.cjs    ─► websocket.cjs(broadcast)
  │                        └─► child_process → my_first_crew/run_revachol_crew.py
  ├─► auth.cjs           （requireAuth）
  └─► enhance.cjs        （send/sendError/json）
```

---

## 四、相关文档

- [WebSocket 协议](./websocket-protocol.md) — `CREW_*` 实时通信协议
- [组件管理器](./component-manager.md) — 组件生命周期
- [CSS 索引](./css-index.md) — 样式模块
- [路线图](../roadmap.md) — 规划与已完成里程碑
