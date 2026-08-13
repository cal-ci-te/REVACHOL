# REVACHOL

原创角色档案馆，一个带内容管理、贴纸装饰、水印保护、多主题切换的 Web 应用。

当前版本：v1.18.4（开发中）

---

<!-- ===== 预览 ===== -->
<h2>预览</h2>

<h3>主题</h3>
<table>
  <tr>
    <th align="center">主题</th>
    <th align="center">截图</th>
  </tr>
  <tr>
    <td align="center">暗色</td>
    <td align="center"><img src="images/screenshots/dark.png" width="500" style="max-width:100%; height:auto;" alt="暗色主题"></td>
  </tr>
  <tr>
    <td align="center">亮色</td>
    <td align="center"><img src="images/screenshots/light.png" width="500" style="max-width:100%; height:auto;" alt="亮色主题"></td>
  </tr>
  <tr>
    <td align="center">低保真</td>
    <td align="center"><img src="images/screenshots/lofi.png" width="500" style="max-width:100%; height:auto;" alt="低保真主题"></td>
  </tr>
</table>

<h3>功能</h3>
<table>
  <tr>
    <th align="center">功能</th>
    <th align="center">截图</th>
  </tr>
  <tr>
    <td align="center">目录树</td>
    <td align="center"><img src="images/screenshots/tree.png" width="300" style="max-width:100%; height:auto;" alt="目录树"></td>
  </tr>
  <tr>
    <td align="center">贴纸系统</td>
    <td align="center"><img src="images/screenshots/deco.png" width="300" style="max-width:100%; height:auto;" alt="贴纸系统"></td>
  </tr>
  <tr>
    <td align="center">移动端</td>
    <td align="center"><img src="images/screenshots/mobile.png" width="300" style="max-width:100%; height:auto;" alt="移动端"></td>
  </tr>
</table>

---

## 功能

- 文章：增删改查、分类管理、可见性控制、无限滚动
- 目录树：折叠展开、拖拽排序、右键菜单
- 详情页：标签页模式、全屏、最小化
- 贴纸：上传（自动压缩为 WebP）、管理、移动和缩放（统一编辑模式）
- 主题：暗色、亮色、低保真三套
- 管理面板：登录、头像、背景、纹理、水印、色卡
- 移动端：响应式布局、触摸拖拽、长按菜单

---

## 技术栈

前端：原生 ES Module、Vite、自研状态管理（AppState + EventBus）
后端：Node.js 22 + 原生 http、sql.js（SQLite）、WebSocket
部署：Docker Compose（镜像加速、非 root 运行、端口安全绑定）
存储：本地文件系统 / S3 兼容对象存储（适配器模式切换）
监控：ErrPulse
测试：Vitest + jsdom（单元）、Playwright（端到端）、playwright-archive（历史报告）

---

## 项目结构

```bash
revachol/
├── js/                        # 前端
│ ├── core/                    # 状态、事件、引用
│ ├── services/                # 业务逻辑
│ ├── ui/components/           # UI 组件
│ ├── admin/                   # 管理模块
│ └── utils/                   # 工具函数
├── css/                       # 样式（主题、响应式）
├── backend/                   # 后端
│ ├── routes/                  # 路由
│ ├── storage/                 # 存储适配器
│ └── uploads/decos/           # 贴纸文件
└── tests/                     # 单元测试
```

---

## 快速开始

### 本地开发

环境：Node.js 20+（Vite 7 最低要求；Docker 使用 22，本地已验证 24）

```bash
# 前端
npm install
npm run dev

# 后端
npm install
node backend/server.cjs
```

### Docker 部署

```bash
docker compose up -d --build
```

详见 [`docs/deployment/docker-setup.md`](docs/deployment/docker-setup.md)

管理员账号：admin / admin123（生产环境通过 `ADMIN_PASSWORD` 环境变量覆盖）

### 存储配置

创建 backend/.env 文件：

STORAGE_TYPE=local

#### 或使用 S3 兼容存储
STORAGE_TYPE=rustfs
RUSTFS_ENDPOINT=http://localhost:9000
RUSTFS_ACCESS_KEY=minioadmin
RUSTFS_SECRET_KEY=minioadmin
RUSTFS_BUCKET=revachol

## 架构亮点

存储层适配器模式：本地文件系统与 S3 兼容存储无缝切换，业务代码零感知。

Docker 安全部署：进程降权（非 root）、端口默认仅绑定 localhost、环境变量驱动的灵活配置。

目录树模块化：从 400+ 行拆分为 12 个职责单一的模块。

单向数据流：ArticleService 为唯一数据源，ArticleListStore 派生数据无副本。

多主题系统：CSS 变量驱动，三套主题动态加载。

## 更新日志

### v1.18.4

**贴纸渲染简化 + 数据驱动锚点架构（WIP）**：

> ⚠️ WIP：贴纸渲染位置问题尚未修复，数据驱动架构重构进行中。

**数据驱动架构（3 项）：**
- **新增 `AnchorManager`**（`js/editor/anchor-manager.js`）：贴纸锚点管理器，统一负责计算（`computeAnchor`/`computeAnchorFromY`）、定位（`locateAnchor`）、比较（`compareAnchors`）、序列化（`serialize`/`deserialize`）贴纸在内容中的段落锚点
- **新增 `ContentBuilder`**（`js/editor/content-builder.js`）：内容构建器，按锚点降序排序从后往前插入贴纸标记，支持 `before`/`after`/`inside` 三种插入方向，避免位置偏移
- **标记格式 `pos` → `anchor`**：贴纸标记由字符偏移量（`pos`）改为段落锚点（`anchor`，含 `type`/`index`/`paragraphId`/`direction`），反序列化兼容旧 JSON 格式与冒号分隔格式

**编辑器改造：**
- `editor-content.js` 重构内容构建流程
- `sticker-editor/save.js` 保存流程改用锚点计算
- `sticker-renderer.js` `createMarker`/`_parseMarkerContent` 支持 `anchor` 字段
- `article-editor-mode.js`、`draft-manager.js`、`detail.js` 同步调整

**修改文件（8 个）：**
`anchor-manager.js`（新增）、`content-builder.js`（新增）、`editor-content.js`、`sticker-editor/save.js`、`sticker-renderer.js`、`article-editor-mode.js`、`draft-manager.js`、`detail.js`

**贴纸渲染简化（3 项）：**
- **放弃动态多边形**：移除 `ShapeGenerator` 和 `shape-outside`/`clip-path` 动态计算，改为固定矩形绕排（仅 `float` + `margin`）。贴纸在 `contentEditable` 中的可见性问题得到解决
- **延迟渲染**：阅读页 `_renderStickersForArticle` 使用 `requestAnimationFrame` 延迟到下一帧，让浏览器先完成内容布局
- **尺寸兜底**：`.detail-body` 新增 `min-height: 200px`，`.article-sticker` 新增 `min-width/min-height: 1px` 强制浏览器计算浮动元素尺寸

**贴纸位置修复（3 项）：**
- **`buildSaveContent` 就地替换**：不再将所有标记追加到内容末尾，改为在 HTML 中查找 `.article-sticker` div 并就地替换为标记注释，保留 DOM 位置
- **`EditorStickers.refresh` 原地更新**：改为按 `decoId` 索引现有元素原地更新样式/图片，新增贴纸追加到末尾，删除贴纸移除 DOM
- **`onStickerSaved` 使用 DOM 数据**：贴纸编辑器保存后改为从 DOM 构建内容（`_buildSaveContent`），替代旧的末尾追加逻辑

**标记格式扩展：**
- 新增 `pos` 字段编码贴纸在内容中的字符偏移量
- `parseMarkers`、`parseStickersFromContent`、`_parseStickerMarkers` 全部同步解析 `pos`（默认 -1 兼容旧数据）
- `ShapeGenerator`（`js/utils/shape-generator.js`）标记为 `@deprecated`

**编辑器修复（2 项）：**
- **草稿删除确认文本**：`DraftManager._deleteDraft` 从传入空字符串改为传入实际保存时间
- **保存/发布异常处理**：`saveDraft` 和 `saveAndPublish` 中 `_buildSaveContent()` 移入 try 块，防止同步异常被静默

**修改文件（9 个）：**
`sticker-shape.js`、`sticker-renderer.js`、`editor-content.js`、`editor-stickers.js`、`article-editor-mode.js`、`draft-manager.js`、`detail.js`、`detail.css`、`shape-generator.js`（弃用标记）

### v1.18.3

**P0 渲染修复 + 编辑器阅读页样式对齐 + 贴纸边界调整：**

**P0 修复（2 项）：**
- **文章卡片 HTML 渲染**：`MarkdownUtils.toHTML()` 无条件 `escapeHtml()` 导致编辑器输出的 HTML 内容被双重转义，卡片显示原始标签文字（如 `<p>`、`<strong>`）而非富文本样式。修复为添加 `_isLikelyHtml()` 启发式检测，HTML 内容绕过转义直接渲染。卡片路径统一使用 `innerHTML` + `truncateHtml()` 替代旧的 `textContent` 截断。
- **贴纸标记泄露**：标记剥离仅移除 `<!-- sticker:xxx -->` 但保留前面的 `\n` 换行符，导致文章末尾出现空行占位。修复为新增 `StickerRenderer.stripMarkers()` 统一函数，同时清理标记周围的换行空白，6 处散落裸正则全部替换。

**编辑器 ↔ 阅读页样式对齐：**
- 删除编辑器 `#article-editor-article` 的 `max-width:800px` 居中、底部 `120px` 工具栏留空、`min-height:80vh`、编辑态虚线框指示 — 完全靠拢 `.detail-pane` 布局
- 新增 `#article-editor-topbar` 标签栏占位条（36px，`position:sticky`，深色背景 + 底边框），外观与阅读页 `.detail-topbar` 一致
- 统一 `box-sizing:border-box`、`min-height:100%`、标题 `font-family:var(--font-family-serif)`
- 阅读页新增 `h1.detail-title` 标题渲染，样式与编辑器 `#article-editor-title` 完全一致

**贴纸位置边界调整：**
- 贴纸上边界从视口顶（0px）改为标签栏占位下（36px）
- 贴纸下边界从视口底改为 `50000px`（自由下移，性能安全）
- 4 个钳制点统一常量：`MARGIN_H=10`、`TOP_MIN=36`、`BOTTOM_MAX=50000`

**工具函数新增：**
- `js/utils/dom.js` 新增 `stripHtml()`、`truncateHtml()`

**修改文件（13 个）：**
`markdown-utils.js`、`dom.js`、`sticker-renderer.js`、`articles.js`、`detail.js`、`article-editor-mode.js`、`detail.css`、`article-editor.css`、`deco.js`、`deco-edit.js`

### v1.18.2

**贴纸系统 P0–P2 全量修复（WIP）**：

> ⚠️ 融合仍未完成，编辑器与贴纸编辑的代码杂糅问题待后续版本解决。

**P0 修复（2 项）：**
- **标记字段顺序兼容**：旧格式 `<!-- sticker:id align=? w=? h=? -->` 与新格式 `<!-- sticker:id x=? y=? w=? h=? align=? -->` 字段顺序不同，导致旧文章贴纸标记完全无法解析。修复为正则两步法：通用提取 `(.*?)` + 字段独立解析 `(\w+)=(\S+)`，与字段顺序完全无关。
- **align 方向持久化**：`_collectStickerData()` 硬编码 `align: 'left'`，右键切换的 `right` 方向在保存时丢失。修复为从 `_stickerData` 索引读取原始属性。

**P1 修复（5 项）：**
- **snapshot 含贴纸**：`_snapshot` 从 `{title, content}` 扩展为 `{title, content, stickers}`，`hasChanges()` 增加贴纸 JSON 对比。修复纯贴纸修改后 ESC 不弹确认框的问题。
- **草稿恢复贴纸**：`_restoreFromDraft()` 增加 `_parseStickersFromContent()` + `_refreshStickerLayer()`。
- **保存防重复**：`saveDraft()`/`saveAndPublish()` 增加 `_saving` 锁 + `try/finally` 释放。
- **公共 Markdown 模块**：提取 `js/utils/markdown-utils.js`（`MarkdownUtils.toHTML()`），消除 `article-editor-mode.js` 和 `sticker-editor-mode.js` 中 55 行重复的 Markdown→HTML 转换代码。
- **监听器显式解绑**：新增 `_unbindStickerElements()`，`_cleanup()` 中 DOM 移除前解绑 `mousedown`/`mouseenter`/`mouseleave`/`contextmenu`。

**P2 修复（6 项）：**
- 提取 `DEFAULT_X`/`DEFAULT_Y`/`DEFAULT_GAP` 到 `StickerShape`，替换 9 处硬编码 50/80
- 拖拽时设置 `userSelect: 'none'` 防止文本选中
- ESC 键关闭贴纸右键菜单
- 草稿恢复后更新 `_snapshot`
- `contentEditable` 中阻止 `Ctrl+S`/`Ctrl+Enter` 快捷键
- 贴纸库加载失败 toast 提示

**正则统一：**
- `detail.js` 内联正则改为 `import { StickerRenderer }` 直接引用 `_MARKER_REGEX`
- 所有 5 处正则读取路径统一为 `StickerRenderer._MARKER_REGEX`
- 新增 `_parseMarkerContent()` 字段解析器

**审计文档：**
- `docs/ai-collaboration/editor-sticker-audit.md`：P0 全量检查报告（~545 行）
- `docs/ai-collaboration/editor-sticker-p0-remains.md`：修复后 P0 遗留排查（~268 行）
- `docs/ai-collaboration/editor-sticker-p1-remains.md`：修复后 P1 遗留排查（~334 行）

### v1.18.1

**文章编辑器合并 + 文章内贴纸编辑系统（Phase 1，WIP）**：

将原独立 `article-editor.html` 页面合并到主 SPA 中，并以全屏模态覆盖层形式新增文章内贴纸编辑功能。

> ⚠️ **注意**：此为第一步合并，功能尚不完善，代码杂糅未做拆分。编辑器与贴纸编辑的 UI 逻辑耦合在主页面运行时中，后续需抽取为独立模块。

- **编辑器内嵌化**：
  - 删除独立 `article-editor.html`（124 行）及旧编辑器 CSS（`css/pages/editor/`，12 个文件）
  - 删除旧编辑器 JS 文件：`js/pages/article-editor.js`（423 行）、`js/editor/editor-core.js`、`js/editor/auto-save.js`、`js/editor/draft-history.js`、`js/editor/history-ui.js`
  - 新建 `js/editor/article-editor-mode.js`：主页面内全屏模态 WYSIWYG 文章编辑器，复用 `UIDetail.renderContent` 的 Markdown→HTML 逻辑，支持 Markdown/HTML 自动检测、快照脏检测、ESC 退出
  - 新建 `js/editor/article-editor-toolbar.js`：工具栏（标题编辑 / 保存 / 贴纸模式切换 / 草稿切换）
  - 新建 `js/editor/draft-manager.js`（311 行）：可拖拽、可折叠的草稿历史侧边面板，支持恢复/删除/双击恢复，`sendBeacon` 关闭前自动保存
  - 新建 `css/editor/article-editor.css`（131 行）：全屏覆盖层排版，`contenteditable` 编辑态指示，复用 `.detail-body` 正文规则
- **文章内贴纸编辑系统（全新）**：
  - 新建 `js/editor/sticker-editor-mode.js`（~420 行）：沉浸式全屏贴纸编辑环境，贴纸库控制台（复用 `.admin-panel`）、拖拽放置 + 坐标微调、脉冲光标动画、`<!-- sticker:xxx -->` 标记解析
  - 新建 `js/editor/sticker-renderer.js`（~150 行）：贴纸 DOM 创建、内容标记解析、文章内渲染
  - 新建 `js/editor/sticker-shape.js`（~80 行）：16 边形 `shape-outside` 浮动形状配置、位置推荐
  - 新建 `js/utils/shape-generator.js`（~120 行）：16 边形多边形顶点生成（圆形/椭圆/圆角矩形）
  - 新建 `css/editor/sticker-editor.css`（131 行）：编辑模式覆盖层 + 控制台面板样式
  - 新建 `css/components/sticker-float.css`（108 行）：`float` + `shape-outside: circle(50%)` 文字绕排，含三主题适配 + 移动端缩小
- **文章阅读页面贴纸渲染**：
  - `js/ui/components/detail.js` 新增 `_renderStickersForArticle()` 和 `_parseStickerMarkers()`：在阅读视图中渲染文章内贴纸（从 `article.stickers` 或内容标记解析），30+ 行
- **快捷键**：`Ctrl+E` 打开当前活跃文章的编辑器（`js/app.js` 新增 20 行）
- **事件扩展**：新增 5 个事件常量 `EDITOR_OPENED/CLOSED`、`STICKER_EDITOR_OPENED/CLOSED/SAVED`
- **文案统一**：`ui-strings.js` 新增 `UI.editor` 扩展（2 条）+ `UI.stickerEditor` 全组（12 条）
- **ErrPulse 禁用**：`backend/server.cjs` 改为 `enabled: false`，`vite.config.js` 注释 `@errpulse/vite` 插件（SDK 无开关配置，注释即关闭）
- **组件清理**：4 个组件文件（deco/puzzle/magic-box/health-component.js）移除未使用的 import
- **开发者文档**：`docs/development/sticker-editor.md`（贴纸系统架构 + 文件清单 + 数据流）
- **ai协作文档**：`docs\ai-collaboration\all-summary.md`(ai总览项目建立上下文索引的提示词),`docs\development\css-index.md`（ai建立的css样式索引）,`docs\ai-collaboration\css-summary.md`(ai根据css建立上下文索引的提示词)

### v1.18.0

**组件统一管理系统（ComponentManager）**：

为项目 4 个交互/装饰组件（贴纸系统、拼图、魔法箱子、健康监控）建立统一管理架构，并为后续"一条龙互动组件引擎"预留接口。

- **核心管理器**（`js/core/component-manager.js`，738 行）：统一生命周期（register → init → mount → unmount）、状态追踪（registered/initialized/mounted/unmounted/error）、拓扑排序依赖解析、单组件失败错误隔离、完整的单组件操作 API（initComponent/mountComponent/unmountComponent/remountComponent/updateComponent）、运行时配置更新（updateConfig）、EventBus 订阅自动清理（trackEvents）、超时保护（init/mount/unmount 可配置超时）
- **4 个组件适配器**（`js/components/{deco,puzzle,magic-box,health}-component.js`）：将现有组件包装为符合 ComponentManager 描述符规范的标准化组件
- **事件体系扩展**：新增 9 个 `COMPONENT_*` 事件常量（REGISTERED/INITIALIZED/MOUNTED/UNMOUNTED/ERROR/BEFORE_DESTROY/ALL_INITIALIZED/ALL_READY/CONFIG_CHANGED）
- **文案统一管理**：新增 `UI.componentManager` 文案对象（27 个字符串），遵循项目规范
- **app.js 集成**：替代原有的 3 个 ad-hoc setTimeout 初始化块，统一用 `ComponentManager.initAll()` → `mountAll()`。beforeunload 使用 `unmountAll({ sync: true })` 同步卸载路径
- **互动引擎预留**：`createInteractive()` / `renderInteractive()` / `getInteractiveConfigs()` / `setInteractiveEnabled()` 4 个接口先空实现不报错，配置存储到队列等待后续引擎消费
- **P0/P1 审计修复**：超时保护防止 Promise 挂起阻塞 initAll、beforeunload 同步卸载路径避免异步丢失、remountComponent 支持卸载后重新挂载、拓扑排序结果缓存 + 脏标记
- **完整开发者文档**（`docs/development/component-manager.md`，378 行）：架构设计、注册新组件、适配现有组件、调试方法、互动引擎预留说明、测试验证清单
- **路线图更新**：标记「组件抽象化统一管理」为已完成

### v1.17.3

**目录树拖拽修复 + 排序优化 + 文案统一管理**：

- **修复 — 文章拖拽移动认证缺失**：`drag-drop.js`、`directory-drop-handler.js`、`directory-pending-moves.js` 三处文章移动使用裸 `fetch()` 直接调用 `PUT /api/articles/:id`，未携带 `Authorization` 头导致 401 拖拽失败。统一替换为 `ApiClient.put()`，走请求拦截器自动注入 Token
- **修复 — 待处理移动队列方法不存在**：`directory-pending-moves.js` 调用 `ArticleService.getArticle()`（不存在的方法），导致 `commitMoves()` 所有文章因"不存在"被静默跳过。修正为 `ArticleService.getAllArticles().find()`
- **重构 — 目录树排序策略（方案一 + 方案三接口）**：文件夹排序从 `minId`（文章 ID）改为拼音排序（`localeCompare('zh-CN')`），解决拖拽文章后源文件夹因 `minId` 突变导致位置跳跃的问题。同步预留 `sort_order` 字段和 `setCategoriesOrder()` 方法，为手动拖拽排序做好准备
- **重构 — 健康监控文案提取**：`health-monitor.js` 中 6 处硬编码中文字符串（超时提示、服务名、Tooltip 模板等）迁移至 `UI.monitor.*`，与项目其他模块统一管理
- **路线图更新**：标记「目录树排序策略优化」为已完成

### v1.17.2

**项目文档体系建设**：

完善项目规划与文档体系，明确设计原则和版本治理规则。

- **路线图重写**（`docs/roadmap.md`）：从 v1.12 级别简要路线图升级为 v1.17 级别完整规划。新增「项目定位」（4 条核心目标）、「设计原则」（6 条优先级排序）、「明确不做的方向」（5 条边界）、「版本规划原则」（语义化版本）、「组件开发路线图」总览表；已完成列表扩展至 v1.17，短期/中期/长期计划全面重新梳理
- **组件路线图**（`docs/component-roadmap.md`）：新建自定义交互组件开发路线图，记录现有 4 个组件（贴纸/拼图/魔法箱子/健康监控）和 7 个计划方向（状态门/对话树/计时事件/合成/路径解锁/电梯/STG 小游戏），明确配置驱动、状态可追踪、物品系统联动的设计原则
- **commit 模板**（`docs/ai-collaboration/commit-guide.md`）：更新 AI 协作 commit 提示词模板，新增 roadmap 已完成项自动标记指令

### v1.17.1

**修复 E2E 测试容器构建失败**：

Playwright 官方镜像缺少 C++ 编译工具链，导致 `bcrypt` 原生模块在 `npm install` 时编译失败（`node-pre-gyp ERR! not ok`）。

- **Dockerfile.test**：在 `npm install` 前新增编译工具链安装层（`build-essential` / `python3` / `g++` / `make`），安装后清理 APT 缓存控制镜像增量
- **多阶段构建评估**：评估了 alpine → ubuntu 多阶段方案，因 musl/glibc ABI 不兼容而否决，直接安装编译工具为最优解
- **文档整合**：将 `docs/deployment/docker-setup.md` 整合到 `docs/development/tools/docker/README.md`，新增 E2E 测试容器构建说明章节（含原生模块依赖、解决方案、musl/glibc 兼容性分析、验证步骤）

### v1.17.0

**全栈健康监控系统**：

为后端新增 `/api/health` 端点，为前端新增实时状态指示器与自动轮询，覆盖 10 项边缘情况，支持 Docker 原生 healthcheck。

- **后端健康检查端点**：`GET /api/health` 返回 `{ status, timestamp, uptime, checks: { database, storage, websocket, memory } }`；数据库 `SELECT 1` 验证、存储临时文件读写验证、WebSocket 连接数统计、heapUsed/heapTotal 内存百分比
- **响应延迟记录**：各检查项记录 ms 级延迟（`database.latency` / `storage.latency`），HTTP 状态码 200/503 区分健康/降级
- **X-Health-Status 响应头**：`healthy` / `unhealthy`，方便 Docker 和负载均衡器解析
- **ErrPulse 集成**：健康检查失败时自动上报 `critical` 级别错误
- **Docker 原生 healthcheck**：`docker-compose.yml` backend 服务新增 `healthcheck` 指令（`node -e` 解析 JSON，interval 30s / timeout 5s / retries 3 / start_period 10s）
- **健康检查脚本**：`scripts/test-health.sh` 支持单次检查 / 等待就绪（`--wait` 最多 60s）/ JSON 输出（`--json`）
- **前端健康监控服务**：`js/services/health-monitor.js`（~380 行），对象字面量模式，定时轮询 `/api/health` 端点
- **边缘情况 v2.0 覆盖**：指数退避（初始 5s→最大 60s） / 失败重试（最多 3 次，递增延迟） / 非 JSON 响应 `_safeJsonParse` / 多标签页 BroadcastChannel 主导选举同步 / 可见性自适应频率（隐藏 5min） / 并发锁 `_pendingCheck` / 细化降级提示显示具体故障服务名 / 首次加载 2s 延迟 + 二段式 `init()`→`start()`
- **BroadcastChannel 辅助工具**：`js/utils/broadcast-helper.js`（64 行），封装跨标签页通信，leader 选举，`health-sync` + `health-join` + `health-leave` 消息协议
- **UI 状态指示器**：右上角圆点 + 文字 + 详细说明（`.health-detail`），悬停 Tooltip 显示各服务延迟详情；降级时顶部黄色/红色全局横幅 + Toast 通知；自动禁用编辑/上传控件
- **CSS 样式**：`css/components/health-indicator.css`（106 行），三色圆点 + 脉冲动画 + 横幅样式，`var(--color-*)` 变量自动适配三套主题
- 新增 3 个 `EVENTS.HEALTH_*` 事件常量，`UI.monitor` 9 条 + `UI.toast` 4 条文案

### v1.16.1

**超现实箱子 — 双部件贴图、拖拽修复、右键菜单、文案提取**：

v1.16.0 的首次快速迭代，覆盖 6 项修复和 4 项增强。

- **修复 — 首次拖拽跳原点**：`BoxDrag._startDrag()` 内联 `style.left` 为空时（CSS `right/bottom` 定位）`parseFloat("")` → `NaN` → 回退 0。改为 `getBoundingClientRect()` 获取真实视口坐标
- **修复 — 管理员持久化失效**：`mount()` 在 `load()` 之前调用，`_applyInitialPosition()` 读到未加载的 `null` 坐标。交换顺序：先 `load()` 后 `mount()`
- **修复 — 导入路径错误**：`BoxItemPool.js` 对 `utils/ui-strings.js` 的导入路径少一层（`../../` → `../../../`），导致整个模块链断裂、页面持续加载中
- **修复 — absolute 模式拖拽范围**：`_clampPosition()` 对 fixed/absolute 两种模式均用 `window.innerWidth/Height`。absolute 模式改用 `documentElement.scrollWidth/Height`
- **增强 — 双部件贴图**：箱子外观从单图覆盖重构为箱盖/箱体双部件独立贴图层，贴图层嵌入 `magic-box-lid`/`magic-box-body` 内，随 `rotateX` 旋转联动，开箱动画与自定义贴图共存
- **增强 — 拖拽范围限制**：`onDragMove` 实时钳制 left/top，含底部计数器 28px 延伸，确保箱子不超出页面
- **增强 — 右键菜单**：右键弹出单选项菜单（复用 `#deco-context-menu` 样式），支持 fixed ↔ absolute 切换，带视口↔文档坐标转换，状态持久化到 `positionStyle`
- **增强 — BroadcastChannel 同步**：管理员拖拽设定新默认位置后广播 `magic_box_position_changed`，`broadcast-setup.js` 接收并同步到其他标签页
- **增强 — 文案统一提取**：23 条硬编码中文文案（物品池 / 计数器 / 右键菜单 / Toast）全部移至 `UI.magicBox`，统一存储于 `js/utils/ui-strings.js`
- **增强 — 旧数据兼容**：`BoxState.load()` 自动将旧版 `customImage` 字段迁移至 `customBodyImage`

### v1.16.0

**超现实箱子交互组件**：

在页面右下角新增一个可交互的 3D 旧木箱悬浮装饰，增强项目的沉浸感与超现实主义氛围。

- **开箱动画**：点击箱子 → 五阶段动画序列（开箱 0.4s → 物品弹出 0.6s → 展示 1.5s → 物品收回 0.4s → 关箱 0.4s），物品 Emoji + 名称 + 描述随机弹出，连续两次不重复
- **物品池**：8 件超现实物品（白色羽毛 / 旧硬币 / 生锈钥匙 / 字条 / 沙粒 / 纽扣 / 小镜子 / 空无），各有独特文案
- **计数持久化**：每次开箱计数 +1，底部显示"已打开 x 次"，刷新不丢失（localStorage `rv_box_data`）
- **拖拽双模式**：普通用户拖拽后以弹簧动画飞回默认位置；管理员（`AppState.isLoggedIn`）拖拽直接设定新默认位置并持久化
- **3D 木箱外观**：`perspective` + `rotateX` 实现箱盖旋转打开，黄铜合页 / 锁扣 / 木纹纹理 CSS 装饰，三套主题 `var(--color-*)` 自动适配
- **自定义图片接口**：预留 `customImage` 字段 + `setCustomImage()` API，后续可通过管理面板上传自定义箱子外观
- **模块化设计**：参照 Puzzle 组件模式拆分为 `BoxItemPool` / `BoxState` / `BoxDrag` / `BoxRenderer` / `BoxManager` 五层，6 文件 847 行 JS + 313 行 CSS，零外部依赖

### v1.15.0

**贴纸统一编辑模式 — 移动 + 缩放合并**：

将原来分离的「编辑位置」和「调整大小」两个独立编辑入口合并为一个统一的「📐 移动和缩放」模式。

- **统一入口**：右键菜单从 3 个分散项（编辑位置 / 调整大小 / 恢复默认大小）收敛为 1 个「📐 移动和缩放」；管理面板贴纸库 📍 按钮同步改为 📐
- **统一操作**：一次进入即可同时拖拽移动 + 拖拽右下角控制点缩放，无需在两种模式间切换
- **三按钮工具栏**：确认更改（保存位置+大小） / 重置（恢复到快照，保持模式） / 取消（恢复到快照，退出模式）；新增 ESC 键等同取消
- **未放置贴纸支持**：从贴纸库点击 📐 时自动渲染到屏幕正中（100×100 默认尺寸），确认后更新为已放置；取消则移除元素恢复未放置状态
- **模块重构**：新建 `js/services/deco-edit.js`（~630 行）替代旧 `deco-resize.js`（已删除）；`DecoEdit` 对象字面量，18 个方法，零依赖注入
- **样式更新**：`css/components/deco-resize.css` 新增 `.deco-editing`、`.deco-edit-handle`、`.deco-edit-toolbar` 三套类名，移动端响应式适配
- **安全清理**：`admin/auth.js` 登出时同步退出 `DecoEdit` 编辑状态

### v1.14.0

**贴纸大小可变（缩放）功能**：

- **核心交互**：右键贴纸 →「📐 调整大小」→ 右下角出现圆形控制点 → 拖拽改变尺寸 → 底部工具栏「✅ 确认」保存或「❌ 取消」回退
- **性能优化**：`requestAnimationFrame` 节流（≤60fps）+ CSS `transform` 方案预留（`useTransform: true` 切换 GPU 加速模式，不触发 Reflow）
- **边界约束**：最小 40px，最大不超过视口；右下角控制点不超出屏幕；尺寸变化后自动钳制位置确保贴纸不越界
- **默认大小**：首次进入缩放模式时记录当前尺寸为默认值，「↺ 恢复默认」恢复到该值而非原始图片尺寸（避免手柄因原图过大而超出屏幕）
- **多贴纸防冲突**：贴纸 A 缩放中点贴纸 B → A 自动退出（不保存），B 进入缩放模式
- **删除自动退出**：缩放模式下贴纸被删除时自动退出缩放模式
- **事件清理**：退出缩放时完整解绑控制点 `mousedown`/`touchstart` 和 `document` 级 `mousemove`/`mouseup`，移除控制点 DOM
- **渲染扩展**：`DecoShelf._applyDecoSize()` 支持 `position.width`/`height`（默认方案 B）和 `position.scaleX`/`scaleY`（方案 C transform），已有贴纸兼容
- **右键菜单修复**：修复贴纸首次从库中放置后右键无响应的问题（`_renderSingleDeco` 现有元素分支确保 `pointer-events: auto` + contextmenu 事件绑定）

### v1.13.1

**文章编辑器认证令牌修复**：

- **根因**：编辑器页面（`article-editor.html`）是独立 HTML 文档，拥有独立的 JS 上下文。`ApiClient` 的请求拦截器仅在主页面 `app.js` 中注册，导致编辑器内所有需认证的 API 调用（草稿保存/恢复/删除、文章保存）均不携带 `Authorization` 头，返回 401
- **修复 `ApiClient` 拦截器缺失**：在 `article-editor.js` 中注册与主页面相同的请求拦截器（注入 `Bearer Token`）+ 响应拦截器（401 自动清理过期 Token + 更新登录状态）
- **修复 `autoSaveOnUnload` 令牌缺失**：页面关闭/隐藏时的草稿自动保存从 `sendBeacon`（不支持自定义请求头）改为 `fetch + keepalive: true`，并注入 `Authorization` 头

### v1.13.0

**E2E 测试体系 + 单元测试补全 + Docker 测试容器化**：

- **Playwright 端到端测试**：
  - 新增 `playwright.config.js`，仅使用 Chromium，支持 local/CI 双模式
  - 测试套件覆盖 7 个功能域：冒烟（首页可访问性）、认证（登录/登出/Token 验证）、文章 CRUD（创建/编辑/删除/可见性）、贴纸管理（上传/更新/删除）、主题切换（暗色/亮色/低保真）、目录树（折叠/展开/搜索）、站点设置（读取/修改/权限验证）
  - 登录态复用机制：`auth.setup.js` 通过 API 获取 Token → `storageState` 保存 → 其他测试项目通过 `dependencies: ['setup']` 继承，避免重复登录
  - 集成 playwright-archive：测试报告自动归档到 `run-history/`，支持历史仪表盘（`http://localhost:3200`）
  - webServer 优化：从 `isCI ? undefined` 改为始终配置 `reuseExistingServer`，本地/Docker/CI 三环境零配置切换
  - 归档脚本重构：`test:e2e`（纯测试） | `test:e2e:archive`（仅归档） | `test:e2e:ci`（测试→通过才归档），消灭 `|| exit 0` 吞噬失败信号问题
- **单元测试补全**（5 个模块，97 个用例）：
  - `tests/unit/auth.test.js`：generateToken / verifyToken / revokeToken / requireAuth / requireRole / optionalAuth / compose，含完整 req/res mock 与集成测试
  - `tests/unit/app-state.test.js`：commit() API 全覆盖（19 种 mutation + SET_KEY + 订阅者通知 + reset + snapshot）
  - `tests/unit/api-client.test.js`：GET/POST/PUT/DELETE + FormData + 拦截器链 + 超时 408
  - `tests/unit/function.test.js`：debounce / throttle（fake timers + this 绑定 + 参数验证）
  - `tests/unit/event-bus.test.js`：补充 emit 无数据/once+on 混用/off 不存在回调/错误恢复 等边界
- **Docker 测试容器**：
  - 新增 `Dockerfile.test`：基于 `mcr.microsoft.com/playwright:v1.48.0-noble` 官方镜像（预装 Chromium + 系统依赖），三层 COPY 缓存优化，`pwuser` 非 root 运行
  - `docker-compose.yml` 新增 `playwright-tests` 服务：依赖 backend + frontend，bind mount 持久化报告，一次性运行自动退出
  - `e2e-tests/playwright.docker.config.js`：Docker 专用配置（60s 超时、始终无头、录像开启、webServer: undefined）
  - `scripts/run-e2e-in-docker.sh`：一键脚本（检查 Docker → 启动依赖 → 等待就绪 → 运行测试 → 归档报告）
  - npm 脚本：`test:e2e:docker` | `test:e2e:docker:build` | `test:e2e:docker:ci`
- **文档**：
  - `e2e-tests/README.md`：测试文件结构、命令速查、登录态机制说明、编写指南、CI 集成
  - `e2e-tests/DOCKER-README.md`：Docker 测试架构、调试指南、常见问题

### v1.12.2

**拼图核心渲染重构 — 块背景像素直读 + 坐标系统一 + 缺口边界修复**：

拼图块背景重构为 `ctx.getImageData` 直接从主 Canvas 读取缺口区域像素（替代之前三版方案：CSS `backgroundPosition` 符号/竞态、离屏 Canvas 坐标变换），**零计算偏差**。缺口/块的 CSS 位置改为与滑块相同的 `getBoundingClientRect` + `canvasScale` 方案，消除 Canvas 缩放或偏移时的坐标不一致。缺口边界计算改为 tabR 感知，防止小画布/大块时缺口溢出。

- **块背景重建**：`_render()` 块层从「计算 imageSource → 离屏裁剪」改为 `ctx.getImageData(gx-tabR, gy-tabR)` 直读主 Canvas 已绘制的像素，`putImageData` 写入离屏 Canvas 后 `toDataURL` 作为 `backgroundImage`，`background-size: 100% 100%` 无对齐计算
- **坐标系统一**：新增 `canvasOffLeft/Top`（`getBoundingClientRect` 差异）+ `canvasScale`（`clientWidth / canvas.width`），缺口/块的位置和尺寸统一乘以 `canvasScale`，与 `positionSlider` 完全一致
- **缺口边界修复**：`_resetGapX` 动态计算 `tabR` 作为最小边距，`maxGap = canvasW - gapW - tabR`（替代硬编码 `100`/`200`）；新增 `_clampGapY` 确保缺口垂直不溢出
- **_onRedraw 时序修复**：`_onRedraw` 移至 `importState` 之前设置，避免异步图片加载后重绘回调为 null
- **_cachedImg onload 加固**：复用缓存 Image 对象时刷新 `onload` 绑定，确保 `_onRedraw` 始终被调用
- **overhang 默认值**：`200` → `100`，滑块有效行程占比从 26% 提升至 34%，精度从 7.3px/单位降至 5.5px/单位

### v1.12.1

**拼图形状修复 + 贴纸持久化（修复 v1.10 Token 认证迁移引发的数据丢失）**：

- **根因**：v1.10 将管理员认证从硬编码密码改为 Token 机制后，`auth_token` 存储在 `localStorage` 中。硬刷新（Ctrl+Shift+R）清空 `localStorage` → `requireAuth` 拦截 `PUT /api/decos/:id` → 贴纸位置数据永不到达服务器 → 再次硬刷新永久丢失
- **贴纸持久化修复**：
  - `DecoRepository.load()` 修复空数组 `[]`（truthy）误判为有效缓存，导致跳过服务器请求（`_cache.length > 0`）
  - `_syncFromServerSilently()` 实际执行服务器数据合并：服务器有有效位置时采用，本地有位置但服务器为 null 时加入重试队列
  - 新增 `_retryFailedSyncs()`：每次 `load()` 重试之前失败的 PUT
  - `save()` 失败时将贴纸 ID 写入 `deco_sync_fail_queue`
  - 贴纸两种状态均可持久化：未放置（`position: null`）和已放置
  - `_renderSingleDeco` 增加 `document.body` 守卫，`module-registry.js` 渲染时序修复
- **拼图模块修复**：
  - 统一 `blockSize` 为块大小和缺口的唯一数据源，删除独立 `gapSize`
  - `PuzzleRenderer` 下边/左边凸起 arc 方向 CCW→CW，修复向内凹陷 bug
  - `_render()` 使用独立 `scaleX`/`scaleY` 修复 Y 轴偏移（Canvas CSS 与内部分辨率不同比）
  - `_render()` 动态更新 DOM 块 `width`/`height`/`clipPath` 并统一乘 scale
  - `PuzzleDrag.setBlockW`/`setOverhang` 自动重算 `_minThumbX`
  - `setSize()` 同步更新 Canvas CSS 尺寸和轨道宽度
  - `init()`/`load()`/`importState()` 全路径同步 blockSize 到渲染器和拖拽模块
- **CSS**：`.puzzle-block` 移除硬编码 `width:72px;height:72px;border-radius:8px;border:1px`，改为 `box-sizing:border-box;border:none;border-radius:0`，由 JS 全权控制

### v1.12.0

**主题系统简化 + 拼图渲染修复 + 移动端禁用**：

- **主题系统重构**：消除 @import 链，3 个主题各 5 子文件合并为单文件加载；切换从动态 <link> 创建/销毁改为三套预加载 + disabled toggle，零网络请求即时切换
- **拼图分割线修复**：重写为双路径方案（外路径亮色描边 + 内路径暗色描边各偏移 1px），确保暗/亮/图片背景下均清晰可见
- **移除边缘磨损粒子**：效果参数过细微不可见 + 仅在纯色模式生效，删除相关 118 行代码
- **拼图块 Y 轴对齐**：gapY 改为直接读取 renderer.gapY，消除与 Canvas 缺口位置的偏差
- **移动端禁用拼图**：init() 首行检测 ≤600px 提前返回；移除所有移动端 CSS 媒体查询规则和 JS 移动端方法

### v1.11.0

**滑动拼图装饰性交互组件**：

- **拼图机制**：Canvas 绘制背景图片（或主题纯色）→ 随机位置挖缺口 → DOM 拼图块跟随滑块移动 → 对齐 ±5px 触发闪光动画
- **图片源优先级**：用户自定义图片（管理面板上传，复用头像裁剪 UI 锁定 8:3 宽高比）→ 主题纯色背景 → 默认几何图形
- **自定义 DOM 滑块**：纯 div 实现 track + thumb（72×72 圆角矩形），绕过浏览器原生 `<input type=range>` 的 thumb 裁切限制，thumb 和拼图块共用 blockX 坐标
- **溢出支持**：拼图块和滑块均可 overflow visible，溢出距离通过 `setOverhang()` 控制
- **跟随鼠标**：`_setBlockX` 将 track 上的鼠标位置直接映射为 blockX，thumb 1:1 跟随，不受 overhang 影响
- **移动端适配**：≤600px 强制流式模式（hero-section 下方），禁用溢出；Canvas 百分比缩放 + DOM 位置同步乘 scale；滑块缩小为 36×36
- **拖动文字保护**：拖动期间 `userSelect: none`，释放后恢复
- **管理面板集成**：上传/恢复默认按钮，`UI.puzzle.*` 文案统一管理

### v1.10.0

**后端 Token 认证体系**：

- **Token 管理**：新增 `backend/auth.js`（232 行），基于内存 Map 的 Token 生成/验证/撤销
  - Token 生成使用 `crypto.randomBytes(32).toString('hex')`（密码学安全）
  - `requireAuth` handler 包装器：不修改 enhance.cjs，以最小侵入保护路由
  - `optionalAuth`：有 Token 注入用户信息，无 Token 不阻塞（适配"登录看更多"场景）
  - `compose` 中间件组合工具 + `requireRole` 角色校验，为未来多角色扩展预留接口
  - `tokenStore` 抽象层封装 Map，标注 Redis 迁移路径
- **路由保护**：全部写操作端点（articles/decos/drafts/settings）包裹 `requireAuth`
  - 读操作（GET）保持公开，访客可正常浏览
  - CORS 头增加 `Authorization` 支持
- **登录/登出 API**：`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
  - 密码从 `ADMIN_PASSWORD` 环境变量读取（开发环境回退 `admin123`）
  - 登录响应返回 `{token, userId, role, expiresIn}`
- **前端认证闭环**：
  - `AdminAuth.login/logout` 改为 async 调用后端 API，Token 存入 `localStorage`
  - `ApiClient` 请求拦截器自动注入 `Authorization: Bearer <token>` 头
  - 401 响应 → `EVENTS.AUTH_UNAUTHORIZED` → 自动清理 Token + 退回访客模式
  - 页面刷新从 `localStorage` 恢复登录状态
  - `article-editor.js` 改为从 Token 判断登录状态（不再硬编码）
- **工程预留**：
  - `db.cjs` 新增 `users` 表 + `articles.author_id` 列迁移
  - `backend/scripts/seed-admin.js` 管理员种子脚本（bcrypt 哈希 + 幂等）
  - 5 条 `[FUTURE]`/`[DEPLOY]` 注释：Redis 迁移、bcrypt 升级、刷新 Token、暴力破解防护、服务器重启行为

### v1.9.2

**Service 层通用化**：

- 新增 `CustomIconManager`（js/services/custom-icon.js）：通用自定义图标管理器，支持任意 UI 元素的"自定义图标 + 回退"能力，每实例独立 `storageKey` + DOM 选择器，零实例冲突
- 站点图标重构：app.js 内联 IIFE（22 行）提取为 `js/services/site-icon.js` SiteIcon 实例，保持向后兼容

**色值统一为 CSS 变量（Phase 1-3）**：

- Phase 1：10 个 CSS 组件文件 ~90 处硬编码色值 → `var(--color-*)`
- Phase 2：8 个编辑器/页面 CSS 文件 ~55 处硬编码色值 → `var(--color-*)`
- Phase 3：22 个 JS 文件 ~80 处内联样式色值 → `var(--color-*)`
- 全项目非 themes/ CSS 中 12 种核心暗色硬编码清零（仅保留 `<input type="color">` 和 JS 运行时默认值）

**站点图标样式升级**：

- 针脚装饰：单 `::before` 线段 → 双 `::before` + `::after` 圆形钉（accent 色）
- 图标容器：+`border-radius`、+`box-shadow`、+`flex` 居中、+`transform-origin`
- Emoji 回退字号：40px → 60px，+`line-height: 100px`
- img/span：+`transform-origin`、+`transition: transform 0.2s`

**Bug 修复**：

- 修复最小化标签页关闭后刷新再现：`closeTab` 增加 `tabElement`/`paneElement` null 守卫（最小化条目无 DOM 元素，`.remove()` 抛 TypeError 阻断 `_saveMinimizedState`）
- 修复 `closeAll` 同款 null 守卫缺失

**文档**：

- 新增 `docs/development/custom-icon-guide.md`：自定义图标组件使用指南（实例创建 / CSS / 管理面板集成）

### v1.9.1

**移动端样式优化**：

- 卡片严格左右交错排列：卡片交错从 `nth-child`（按父级计数）改为 `.card-left`/`.card-right` 类选择器（由 JS 全局 `cardIndex` 赋值），跨越文件夹边界连续交替
- 侧边栏位置下移：`sidebar.js` 移动端默认 `top` 从 80px → 68px，`loadState`/`loadPosition` 双入口强制移动端覆盖已保存值
- 登录入口增大：头像 28→36px，标签 8→10px，欢迎语 7→9px
- 位置控件主题适配：三套主题 `_sidebar.css` 中写入 `var(--color-*)` 变量覆盖，替代 `admin.css` 硬编码暗色值
- 心跳加载动画主题平滑：`index.html`/`article-editor.html` 内联预加载脚本（处理 StorageAdapter `rv_` 前缀 + JSON 编码），`data-theme` 在第一帧渲染前就位
- 贴图库入口隐藏：`#assetUploadBtn`/`#assetFileInput`/`#assetListContainer` 移动端隐藏，仅显示移动端不支持贴纸

**修复**：

- 修复 `small-mobile.css`（≤480px）后加载覆盖 `mobile.css`（≤768px）导致移动端样式未生效
- 修复 `sidebar.js` `loadPosition()` 在 `loadState()` 之后运行，用旧保存值覆盖移动端默认值
- 修复内联预加载脚本读 `selected_theme` 裸键而非 StorageAdapter 前缀键 `rv_selected_theme`
- 修复位置控件色值经 Vite HMR `@import` 链注入被绕过，改为主题 CSS `<link>` 直载

### v1.9.0

**全局命名空间收敛与架构解耦**：

- **全局收敛**：14 个 `window.X` 合并为 `window.__REVACHOL__` 单一命名空间，10 个消费方同步更新；附带修复 `window.UI`、`window._UIDetail`、`window._UISidebar` 三个从未赋值的死引用
- **事件常量补全**：`event-constants.js` 从 20 → 40 个常量，覆盖 admin/deco/auth/theme/position 五个事件域；`admin/index.js` 等 6 个文件全部替换散落字符串为 `EVENTS.*`
- **Service 层封装**：ArticleService 新增 6 个公开方法（`getCategoryChildren`、`findCategoryById`、`reparentCategoryChildren`、`removeCategoryEntry`、`removeCategoriesByIds`、`saveSnapshot/restoreSnapshot`），消除 `context-menu.js`（10 处）、`drag-drop.js`、`touch-drag.js`、`position-manager.js`（6 处）等外部文件对 `_categories`/`_data`/`cache` 私有字段的直接访问
- **Store 透传**：ArticleListStore 新增 5 个代理方法，detail.js、events.js、directory-visibility.js、index.js 四个 UI 组件从直引 ArticleService 改为通过 Store 获取数据

**Bug 修复**：

- 修复贴纸在 `absolute` 定位下拖拽发生坐标偏移（编辑期间临时转为 `fixed`，保存时还原坐标系）
- 修复目录树在位置管理模式中反复 enter/exit 后拖拽弹窗重复触发（`enableDragDrop` 旧监听器未清理导致叠加）

### v1.8.2

**开发文档与版本声明修正**：

- 新增 `docs/development/tools/` 开发工具文档（Vitest / ErrPulse / Docker Compose，含索引）
- Node.js 最低版本声明从 "18+" 更正为 "20+"（Vite 7 实际要求 >=20.19.0）
- 文档中注明实际运行版本：Docker 使用 22 LTS，本地开发机已验证 24
- 此版本差异无功能性冲突——两个版本均为受支持发行版，依赖兼容性审查已覆盖

### v1.8.1

**贴纸动画修复**：

- `_renderSingleDeco` 改为"原地更新"策略：元素已存在时直接修改 CSS 属性（position/top/left/width/height），不再 remove + createElement 重建
- `_renderAllDecos` 同理：遍历贴纸调用 `_renderSingleDeco` 原地更新，末尾清理孤儿元素（已在库中删除或无位置的贴纸 DOM）
- `setStyle`（v1.8.0 已部分修复）继续使用直接 DOM 更新，不经过 render 方法

效果：贴纸仅在网页首次加载时播放 `fadeInUp` 入场动画，移动位置、切换样式（fixed ↔ absolute）均为即时 CSS 更新，无动画重播。

### v1.8.0

**Docker 化部署与安全加固**：

- **Docker 部署方案**：`docker compose up -d --build` 一键启动前后端双容器，SQLite + 贴纸通过命名卷持久化。含完整操作文档（`docs/deployment/docker-setup.md`）
- **Node.js 22 升级**：基础镜像 `node:18-alpine` → `node:22-alpine`，经全量依赖兼容性审查（`docs/node-22-upgrade-review.md`），确认 0 个原生模块风险
- **进程降权运行**：容器内以 `node` 用户（非 root）启动后端，限制潜在攻击面
- **端口安全绑定**：默认仅监听 `127.0.0.1`，云服务器通过 `BIND_ADDR=0.0.0.0` 一键切换
- **镜像加速**：配置轩辕镜像 `docker.xuanyuan.me` 解决 Docker Hub 拉取超时

**运行时适配**：

- 后端监听地址改为 `HOST` 环境变量控制
- Vite Proxy 三项目标统一由 `VITE_BACKEND_URL` 控制，本地开发行为不变
- `watch.usePolling` 增加 `interval: 2000` 降低 WSL2 跨文件系统 I/O

**Bug 修复**：

- 修复 `storage/config.cjs` 中 `uploadDir` 路径解析错误（`../../uploads/decos` → `../uploads/decos`），原被 root 权限掩盖
- 修复贴纸切换样式（fixed ↔ absolute）后位置丢失与入场动画重播：`setStyle()` 改为原地更新 DOM 属性，跳过 `_renderSingleDeco` 的 remove + createElement 触发 CSS `fadeInUp` 重播

### v1.7.0

**最小化标签页持久化**：刷新不丢失，localStorage 存取 + 全量重渲染保证顺序一致。去重处理（同一文章不重复开标签页）。激活详情页时自动隐藏 minimized bar。

**文章格式保留**：详情页 + 卡片 `white-space: pre-wrap`，首行缩进、空行、段落间距完整保留。

**站点图标**：标本悬挂样式（图标溢出方框 + 针脚装饰 + drop-shadow），优先加载自定义图标 → `images/site-icon.png` → 🎭 emoji 回退。一次性摇摆入场动画。

**页面渐入动画**：加载完成后文字（0.12s）→ UI 控件（0.25s）→ 贴纸（0.45s）三级延迟淡入。

**编辑器 favicon 同步**：文章编辑器页面现在也随主题切换标签页图标。

### v1.6.0

**心跳开屏加载动画**：SVG 双层心电图波形 + 脉冲光晕，CSS 变量适配三套主题。加载期间锁定页面滚动，至少显示 300ms，10s 超时兜底。

**主题 Favicon 同步**：切换主题时动态替换标签页图标。暗色/亮色/低保真各一套 `.ico` + `.png` 双版本。

**文章卡片交错排布**：`nth-child` 改为全局 `cardIndex` 递增，文件夹边界不再打断左右交替。

**低保真最小化标签页**：补 32 行 lofi 覆盖（CSS 变量 + 像素风），minimized-bar 不再硬编码暗色值。

### v1.5.1

**草稿管理补丁**：
- 修复 `cleanup-drafts.cjs` 语法错误（多余 `}` 导致模块加载失败，后端静默退出）
- 修复 `query()` 和 `exec()` 仍使用原始绑参 API 导致 COUNT 查询和 DELETE 失效（db.cjs 四个函数全部统一为 `escapeSql` + `db.exec`）
- 修复 `DELETE ... ORDER BY ... LIMIT` 在 sql.js 中不兼容 → 改为子查询

### v1.5.0

**草稿系统全面修复**：

sql.js 参数绑定 Bug 排查（历时最长修复）：
- 发现 `stmt.run(params)` 返回 `lastInsertRowid: 0`——sql.js CDN 版本绑参不执行 INSERT
- 切到 `db.exec(手动转义SQL)` 后 `lastInsertRowid` 递增但 `db.export()` 文件大小不变——INSERT 在内存生效但未被子系统追踪
- 定位到 `queryAll()` 从未调用 `stmt.bind(params)`——`WHERE article_id = ?` 始终为空结果集
- 最终方案：统一 `escapeSql()` 工具函数手动转义 + `BEGIN/COMMIT` 显式事务 + `db.exec()` 执行

**草稿管理策略**：
- 数量限制：每文章最多 20 条草稿，超出自动删除最旧
- 过期清理：30 天前草稿自动清理（启动全量 + 每次保存增量双保险）
- 保存节流：多写入合并为单次 `db.export()`（5s 间隔可配），消除并发冲突

### v1.4.0

**安全加固**：贴图上传后端增加 magic number 校验（PNG/JPEG/WebP），防止非图片文件绕过前端上传；文章/贴图标题、内容、分类增加业务层长度校验。

**贴图系统升级**：
- 边界约束：拖拽 / 保存 / 窗口 resize 自动钳制，确保贴图不超出屏幕
- 位置编辑控件移至贴图下方（重置 / 确认 / 取消三按钮居中）
- 贴图库按钮改为紧凑两行布局
- 修复右键菜单 DOM 被误删导致二次失效

**文章编辑器主题同步**：编辑器与主页面主题实时同步（暗色 / 亮色 / 低保真），通过 BroadcastChannel 双端联动。

**修复**：
- 后端 `url.parse()` 弃用 → WHATWG `new URL()`
- 贴图样式切换 Toast 统一为"已切换"
- 主页面切换到亮色时编辑器延迟加载变量（`onload` 链式加载）
- 草稿历史面板 UI 文案 key 修正

### v1.3.0

**工程注释重构**：全项目 107 个文件删除装饰性分隔线与废话注释，新增 25+ 处工程决策注释，覆盖自研路由层 / 状态管理 / EventBus / ApiClient / 存储适配器等核心模块，标注技术债与已知限制。

**修复**：
- 贴纸存储恢复本地文件系统，修改 `.env` 一行可切换 RustFS
- 访客模式下文件夹折叠/展开修复（匿名监听器泄漏导致偶数抵消）
- 登出后头像实时切换为访客默认图片
- 登录后贴纸右键菜单恢复（DOM 移除改为隐藏）
- 访客模式下贴纸右键菜单禁用（权限守卫遗漏）
- `:scope > .children` 改为 `.children` 兼容更多浏览器

### v1.2.0

**工具栏**：左上角新增可展开工具栏，当前含使用说明组件。点击展开后在详情标签页中阅读网站说明，与文章阅读体验一致。

**卡片高亮**：点击目录树跳转到文章卡片时，显示主题自适应辉光动画（暗色暖金 / 亮色暖棕 / 低保真米褐），1.5 秒自动消退。

**详情页升级**：
- 铺满全屏，无边框间距与宽度限制
- 滚动隔离——阅读时不会触发外部页面滚动
- 顶部栏改为浏览器式标签行：标签页在左，最小化/全屏/关闭在右

**主题拆分**：三个主题文件拆分为 5 模块（变量 / 布局 / 内容 / 侧边栏 / 交互），按功能域定位。

**贴纸存储**：统一使用本地文件系统，`.env` 中 `STORAGE_TYPE=local`。

### v1.1.0

**实时通信**：主页面与文章编辑器页面之间通过 BroadcastChannel 实现可见性修改的实时同步，无需刷新。

**主题优化**：
- 暗色/亮色主题目录树字体补全（IM Fell English 古卷宗体）
- 低保真主题按钮全覆盖、标题居中、卡片重新设计为 6 种不规则裁剪 + SVG 撕纸边缘滤镜 + 透底纸张白纸配色
- 三个主题下登录入口尺寸统一增大，头像占比提升
- 目录树行距统一，消除访客/管理员模式切换时的布局跳动

**交互修复**：
- 贴纸右键菜单恢复（与目录树菜单 id 冲突已解决，两菜单完全独立并有三套主题样式）
- 访客↔管理员模式切换即时生效，目录树与文章列表自动刷新
- 文章编辑器页面加载稳定性提升（重复导入修复 + 安全超时 + 错误处理）

## 后续计划

文章全文搜索

多语言支持

文章全文搜索

多语言支持
