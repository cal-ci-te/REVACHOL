# 任务：为 REVACHOL 项目生成 8 个核心模块的摘要提示词（用于单ai单独工作，协作时忽略）

## 目标
根据提供的项目文档，了解项目，并在对话窗口输出 8 个核心模块的结构化摘要，用于 AI 协作和项目文档。

## 文档来源
- docs下所有文档
- 项目根目录 `README.md`，`REQUIREMENTS_CHECKLIST.md`

## 项目核心信息
- **项目名称**：REVACHOL
- **技术栈**：原生 ES Module + Vite（前端），Node.js 22 + 原生 http + sql.js（后端）
- **架构分层**：前端（core/services/stores/ui），后端（routes/storage/db），存储适配器（local/S3）

## 输出格式要求

每个摘要使用以下固定格式（严格遵循，不要额外内容）：

## M[编号] - [模块名称]

- **文件**：`[文件路径]`（约 [行数] 行）
- **职责**：[一句话描述模块的核心职责]
- **[子标题]**：[根据模块类型，使用以下分类]

### 数据结构（如适用）
- `[字段名]`：[类型] — [说明]

### 公开方法
- `[方法名]`：[功能描述]

### 触发事件（如适用）
- `[事件名]`：[触发时机]

### 依赖
- `[模块名]`：[用途说明]

### 设计要点（如适用）
- [关键设计决策]

## 8 个核心模块定义

### M1 - ArticleService（数据层）
- **文件**：`js/services/article-service.js`（~470 行）
- **职责**：文章与分类的单一数据源，管理 CRUD、缓存、可见性切换、分类树构建
- **关键**：数据结构、公开方法、触发事件、依赖

### M2 - AppState + EventBus（状态管理）
- **文件**：`js/core/app-state.js`（~130 行）、`js/core/event-bus.js`（~40 行）、`js/core/state-mutations.js`（~50 行）、`js/core/event-constants.js`（~85 行）
- **职责**：集中式 state + mutation 提交，发布-订阅跨模块通信
- **关键**：状态键列表、事件常量域（~60 个）、订阅机制

### M3 - 目录树模块
- **文件**：`js/ui/components/directory/`（12 个子模块）
- **职责**：折叠展开、拖拽排序、右键菜单、位置管理
- **关键**：子模块列表、外部依赖、关键交互事件

### M4 - 贴纸系统和拼图
- **文件**：贴纸前端（`js/services/deco.js`、`js/services/deco-repository.js`、`js/services/deco-edit.js`、`js/ui/components/deco-ui.js`）、贴纸后端（`backend/routes/decos.cjs`、`backend/upload.cjs`）、文章内贴纸编辑（`js/editor/sticker-editor-mode.js`、`js/editor/sticker-renderer.js`、`js/editor/sticker-shape.js`）、拼图（`js/puzzle/Puzzle.js`、`js/puzzle/core/`）
- **职责**：上传（自动压缩为 WebP）、管理、位置编辑、存储，以及滑动拼图验证组件
- **关键**：存储方式（本地/S3）、渲染逻辑（页面级绝对定位 + 文章内注释标记）、位置管理

### M5 - 主题系统
- **文件**：`js/services/theme-service.js`（~220 行）+ `css/themes/{dark,light,lofi}/`（各一个合并后的单 CSS 文件）
- **职责**：三套主题（暗色/亮色/低保真）动态切换，CSS 变量驱动，零网络请求即时响应
- **关键**：切换机制（预加载 + disabled toggle）、变量体系（~50 个）、持久化（localStorage + BroadcastChannel）

### M6 - 后端路由层
- **文件**：`backend/enhance.cjs`（~70 行自研路由框架）+ `backend/routes/{articles,decos,settings,drafts}.cjs` + `backend/auth.js` + `backend/server.cjs`（入口）
- **职责**：自研路由匹配、CORS、参数注入、统一响应
- **关键**：主要端点列表（14 个注册端点 + 4 个内联端点 = 18 个）、认证流程（`requireAuth` 包装器）

### M7 - 存储适配器
- **文件**：`backend/storage/index.cjs`、`backend/storage/config.cjs`、`backend/storage/storage-service.cjs`、`backend/storage/adapters/local.cjs`（~77 行）、`backend/storage/adapters/rustfs.cjs`（~140 行）
- **职责**：本地文件系统 ↔ S3 兼容存储（MinIO/Ceph/AWS）无缝切换，业务代码零感知
- **关键**：适配器接口（upload/getUrl/delete/exists/read）、切换方式（.env 一行）、门面设计

### M8 - 文章编辑器
- **文件**：`js/editor/` 目录（6 个文件：`article-editor-mode.js` ~1000 行、`article-editor-toolbar.js` ~209 行、`draft-manager.js` ~311 行、`sticker-editor-mode.js` ~600+ 行、`sticker-renderer.js` ~200+ 行、`sticker-shape.js` ~50 行）
- **职责**：全屏模态 WYSIWYG 编辑器，支持 Markdown 智能渲染、草稿管理、贴纸插入/拖拽、保存/发布
- **关键**：入口、复用策略、保存流程、贴纸集成、关键能力（智能渲染/粘贴清理/草稿管理/脏状态追踪/键盘快捷键/反馈弹窗/移动端禁用）

## 输出要求

- **输出完整的 8 个模块摘要**
- **每个摘要使用上方固定格式**
- **不要添加任何额外内容或说明**
- **严格从项目文档中提取信息，不要推测**