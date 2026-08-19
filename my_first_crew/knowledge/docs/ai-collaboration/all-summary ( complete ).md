 # 8 个核心模块结构化摘要

   ## M1 - ArticleService（数据层）

   - 文件：js/services/article-service.js（约 471 行）
   - 职责：文章与分类的单一数据源，管理 CRUD、缓存、可见性切换、分类树构建

   ### 数据结构
   - article：Object — { id, title, content, category, categoryName, updateTime, visible }
   - category：Object — { id, name, parent, sort_order }
   - cache：Object — { data: Article[], timestamp }，TTL 由 CONFIG.CACHE_TTL（默认 5 分钟）控制
   - _categories：Array — 分类列表，持久化到 localStorage（key categories）

   ### 公开方法
   - fetchArticles(forceRefresh)：从后端拉取文章（缓存 TTL 内直接返回，失败降级为模拟数据）
   - getAllArticles() / getVisibleArticles()：获取全部文章 / 可见文章（未登录时过滤 visible=false）
   - setVisibility(articleId, visible)：切换文章可见性（需登录，成功后写缓存并广播）
   - onVisibilityChanged(data)：响应远端（BroadcastChannel/WebSocket）可见性变更并刷新 UI
   - buildDirectoryTree(articles)：构建分类目录树（sort_order 优先，回退拼音排序）
   - clearCache() / getStats() / isVisible(articleId) / getArticlesByCategory(categoryName) / addArticleToCache(article)
   - saveSnapshot() / restoreSnapshot(snapshot)：数据深拷贝快照，用于撤销/恢复
   - 分类方法：getAllCategories / getCategoryTree / getCategoryChildren / getCategoryParent / findCategoryById / addCategory / moveCategory / renameCategory
   / removeCategory / removeCategoryEntry / removeCategoriesByIds / reparentCategoryChildren / setCategoriesOrder

   ### 触发事件
   - ARTICLE_DATA_LOADED：数据保存/加载成功后
   - ARTICLE_VISIBILITY_CHANGED：可见性切换或分类增删改时（payload 含 { articleId, visible, fromRemote } 或分类变更信息）
   - ARTICLE_MADE_INVISIBLE：访客视角下文章被设为隐藏时

   ### 依赖
   - ApiClient：GET/PUT 后端请求
   - StorageAdapter：分类缓存持久化
   - EventBus / EVENTS：事件发布
   - AppState：isLoggedIn 登录态判断
   - NotificationService：Toast 提示（含 visibilityAdminOnly 等文案）
   - CONFIG：CACHE_TTL

   ---

   ## M2 - AppState + EventBus（状态管理）

   - 文件：js/core/app-state.js（约 129 行）、js/core/event-bus.js（约 40 行）、js/core/state-mutations.js（约 57 行）、js/core/event-constants.js（约 84
   行）
   - 职责：集中式 state + mutation 提交，发布-订阅跨模块通信

   ### 数据结构（状态键，共 21 个）
   - isLoggedIn：boolean — 登录态
   - adminUsername：string — 管理员用户名
   - panelCollapsed / panelRight / panelBottom：管理面板折叠态与位置
   - sidebarCollapsed / sidebarLeft / sidebarTop：侧边栏折叠态与位置
   - decoEditing：boolean — 贴纸编辑态
   - articles / visibleArticles / articleVisibility：文章数据
   - watermarkText / watermarkOpacity：水印配置
   - textureDataUrl / textureOpacity：纹理配置
   - bgColor：string — 背景色
   - admin / ui：管理员对象 / UI 控制器引用
   - puzzleImage / puzzleCompleted：拼图组件状态

   ### 公开方法
   - AppState.get(key)：读取状态
   - AppState.commit(type, payload)：提交 mutation（mutationHandlers 修改 state，mutationKeyMap 映射受影响键并通知订阅者）
   - AppState.subscribe(key, callback)：键订阅（若键已有值立即回调一次）
   - AppState.unsubscribe(key, callback)：取消订阅
   - AppState.reset() / snapshot()：重置 / 深拷贝快照
   - EventBus.on/off/emit/once/clear：发布-订阅（emit 逐回调 try-catch 隔离）
   - MUTATIONS（state-mutations.js）：18 个 mutation 类型常量（SET_LOGGED_IN、SET_PANEL_POSITION、SET_SIDEBAR_COLLAPSED、SET_DECO_EDITING、SET_WATERMARK_、SE
   T_TEXTURE_、SET_BG_COLOR、SET_ARTICLES、SET_VISIBLE_ARTICLES、SET_ARTICLE_VISIBILITY、SET_ADMIN、SET_UI、SET_KEY、SET_PUZZLE_IMAGE、SET_PUZZLE_COMPLETED
   等）

   ### 事件常量域（约 58 个，按域划分）
   - 文章域：ARTICLE_VISIBILITY_CHANGED / ARTICLE_MADE_INVISIBLE / ARTICLE_DATA_LOADED / ARTICLE_DATA_LOADING / ARTICLE_DATA_ERROR / ARTICLES_UPDATED
   - UI 域：UI_INITIALIZED / UI_REFRESH
   - 认证域：AUTH_LOGGED_IN / AUTH_LOGGED_OUT / AUTH_UNAUTHORIZED
   - 管理面板域：PANEL_TOGGLED / PANEL_COLLAPSED + 16 个 ADMIN_* 操作事件（贴图/纹理/水印/位置模式等）
   - 贴图域：DECO_LIBRARY_CHANGED / DECO_EDITING_STARTED / DECO_EDITING_STOPPED / DECO_CONTEXT_MENU
   - WebSocket 域：WS_CONNECTED / WS_DISCONNECTED / WS_VISIBILITY_CHANGED
   - 通知域：NOTIFICATION_SHOW / NOTIFICATION_HIDE
   - 健康检查域：HEALTH_CHECK_PASSED / HEALTH_CHECK_DEGRADED / HEALTH_CHECK_FAILED
   - 组件管理器域：COMPONENT_REGISTERED / COMPONENT_INITIALIZED / COMPONENT_MOUNTED / COMPONENT_UNMOUNTED / COMPONENT_ERROR / COMPONENT_BEFORE_DESTROY /
   COMPONENT_ALL_INITIALIZED / COMPONENT_ALL_READY / COMPONENT_CONFIG_CHANGED
   - 其他：THEME_CHANGED / EDITOR_OPENED / EDITOR_CLOSED / STICKER_EDITOR_OPENED / STICKER_EDITOR_CLOSED / STICKER_EDITOR_SAVED / ARTICLES_LIST_UPDATED /
   APP_STARTED

   ### 订阅机制
   - AppState：commit → mutationHandlers 改 state → mutationKeyMap 取受影响键 → _notify(key, newValue) → 订阅回调；按键订阅避免整树 diff
   - EventBus：on/off 登记与解除，emit 逐个回调执行并 try-catch 隔离错误

   ### 依赖
   - state-mutations.js：AppState 的 mutation 常量与处理器来源（唯一外部依赖）

   ### 设计要点
   - 自研而非 Vuex/Pinia：约 15 个状态键引入 ~30KB 库不抵 <1KB 自研实现；commit(type, payload) + subscribe(key, callback) 接口与 Vuex 一致，状态键增长到 50+
   可无缝迁移 Pinia
   - EventBus 用纯 JS 实现而非 DOM CustomEvent：避免 DOM 依赖、保持纯数据流、便于单元测试

   ---

   ## M3 - 目录树模块

   - 文件：js/ui/components/directory/（12 个子模块，共约 1781 行）
   - 职责：折叠展开、拖拽排序、右键菜单、位置管理

   ### 子模块列表
   - index.js（约 222 行）：入口，组装子模块，导出 UIDirectory
   - render.js（约 191 行）：渲染 DOM 树
   - events.js（约 230 行）：单击/双击/右键事件委托
   - context-menu.js（约 345 行）：右键菜单逻辑
   - folder-state.js（约 38 行）：折叠/展开状态
   - drag-drop.js（约 273 行）：桌面端拖拽排序
   - directory-visibility.js（约 32 行）：可见性切换
   - directory-drop-handler.js（约 76 行）：拖拽放置处理
   - directory-pending-moves.js（约 69 行）：待确认移动队列
   - directory-interactions-binder.js（约 78 行）：交互事件绑定器
   - position-manager.js（约 134 行）：位置管理模式（保存/恢复快照）
   - mobile-controls.js（约 73 行）：移动端控件

   ### 公开方法
   - UIDirectory.init(container)：初始化（创建位置管理器、移动端控件、订阅事件）
   - UIDirectory.updateTree(filterKeyword)：重建目录树并绑定交互（位置模式下重启用拖拽）
   - UIDirectory.setActiveNode(nodeId)：设置选中节点
   - UIDirectory.destroy()：清理事件绑定、位置管理器、待移动队列、移动端控件

   ### 触发事件
   - ARTICLE_DATA_LOADED：数据加载后重建目录树
   - ADMIN_POSITION_MODE_ENTER / ADMIN_POSITION_MODE_EXIT / ADMIN_POSITION_MODE_CANCEL：进入/退出/取消位置管理模式
   - AUTH_LOGGED_IN / AUTH_LOGGED_OUT：登录态变化后刷新（显示/隐藏管理员控件）
   - ARTICLES_UPDATED：树更新后广播（无过滤关键词时）
   - directory-toggle-visibility（CustomEvent）：点击可见性切换按钮时派发

   ### 外部依赖
   - ArticleListStore：buildDirectoryTree / getVisibleArticles 数据来源
   - AppState / EventBus / EVENTS：状态读取与事件订阅
   - Utils：storage（折叠状态持久化）
   - mobile/index：isMobile / enableTouchDrag / enableTouchContext（移动端触摸拖拽与长按）

   ### 设计要点
   - 从 400+ 行单文件拆分为 12 个职责单一的子模块
   - 折叠状态持久化到 localStorage（key folder-collapsed-{文件夹名}）
   - 位置管理模式：拖拽移动先入待确认队列（pending-moves），统一提交或取消，快照保存/恢复
   - 移动端通过长按启用右键菜单与触摸拖拽（enableTouchContext）

   ---

   ## M4 - 贴纸系统和拼图

   - 文件：贴纸前端（js/services/deco.js 约 772 行、js/services/deco-repository.js 约 296 行、js/services/deco-edit.js 约 629 行、js/ui/components/deco-ui.js
    约 186 行）、贴纸后端（backend/routes/decos.cjs 约 238 行、backend/upload.cjs 约 118 行）、文章内贴纸（js/editor/sticker-editor-mode.js 约 600+
   行、js/editor/sticker-renderer.js 约 200+ 行、js/editor/sticker-shape.js 约 143 行）、拼图（js/puzzle/Puzzle.js 约 943 行、js/puzzle/core/）
   - 职责：贴纸上传（自动压缩为 WebP）、管理、位置编辑、存储，以及滑动拼图验证组件

   ### 数据结构
   - 贴纸元数据（SQLite decos 表）：{ id, name, position(JSON), style('fixed'|'absolute'), image_path }
   - 前端缓存项：{ id, name, position, style, dataUrl('/api/decos/{id}/image') }
   - 文章内贴纸：{ decoId, x, y, width, height, align('left'|'right'), margin, shape, vertices }
   - 贴纸占位标记：<!-- sticker:{id} x={x} y={y} w={w} h={h} align={align} -->
   - 拼图配置：{ width, height, blockSize, overhang, position, image, completed }

   ### 存储方式（多层）
   - 图片文件：backend/uploads/decos/（本地）或 S3 Bucket（RustFS）— WebP 二进制
   - 元数据：SQLite decos 表 — 服务端权威数据
   - 前端缓存：localStorage['deco_library'] — 离线/快速加载（不含 dataUrl）
   - 内存缓存：DecoRepository._cache — 含图片路由
   - 失败队列：localStorage['deco_sync_fail_queue'] — 网络恢复后重试 PUT

   ### 公开方法
   - DecoShelf：loadLibrary() / getAll() / get(id) / upload(file, name)（Canvas 压缩 WebP quality 0.6，约减 40-60% 体积）/ duplicate / rename /
   deleteFromLibrary / removeFromPage / setPosition / setStyle / clampPositionToViewport / download
   - DecoRepository：load() / save(item) / delete(id) / syncFromServer() / getAll() / get(id)（含 _postToServer / _putToServer / _deleteFromServer /
   _syncFromServerSilently）
   - DecoEdit：enterEditMode(id) / exitEditMode(save) / isActive() / getActiveDecoId()（移动 + 缩放统一编辑模式）
   - StickerRenderer：parseMarkers(content) / createMarker(decoId, opts) / stripMarkers(content) / stripStickerDivs(content)（_MARKER_REGEX
   统一数据源，字段顺序无关兼容新旧格式）
   - StickerShape：buildFloatStyles(sticker) / buildInlineStyle(sticker, imageUrl) / suggestPosition(existing, width, y) / isOverlapping(a, b)（默认尺寸
   120、间距 20、回退坐标 50）
   - Puzzle：new Puzzle(options) / init() / setSize / setOverhang / setPosition / updateConfig / setImage / save / load / getConfig / destroy()

   ### 渲染逻辑
   - 页面级贴纸：position: fixed/absolute 视口绝对定位，钳制边界（上 36px / 下 50000px，左右 10px 边距）
   - 文章内贴纸：content 中 HTML 注释标记 → StickerRenderer 渲染为 .article-sticker div（float + margin 固定矩形绕排；v1.18.4 起放弃动态多边形
   shape-outside/clip-path）
   - 拼图：Canvas 绘制完整背景 + DOM 层渲染拼图块与缺口（同一 clipPath 数据源保证形状一致）

   ### 触发事件
   - DECO_LIBRARY_CHANGED：贴纸库增删改后
   - DECO_EDITING_STARTED / DECO_EDITING_STOPPED：进入/退出位置编辑
   - STICKER_EDITOR_OPENED / STICKER_EDITOR_CLOSED / STICKER_EDITOR_SAVED：文章内贴纸编辑生命周期
   - 拼图实例级事件（js/puzzle/core/EventEmitter.js）：image:changed / config:changed / completed:changed / progress

   ### 后端
   - upload.cjs：base64 JSON → Buffer → magic number 校验（PNG/JPEG/WebP，防非图片绕过）→ storage.upload → SQLite INSERT → broadcast
   - decos.cjs：GET 列表 / GET :id/image（二进制读取，RustFS 未命中回退本地）/ PUT（name/position/style/dataUrl 更新）/ DELETE（先删文件再删记录）；写操作经
   requireAuth

   ### 设计要点
   - 前端上传即压缩为 WebP（quality 0.6），减少存储和传输体积
   - 坐标基准统一为文章容器坐标系，无视口/页面/容器混淆
   - 位置编辑采用快照恢复机制（取消回滚），未放置贴纸编辑时自动渲染到屏幕正中
   - 拼图是自包含可实例化组件（可多实例），内部 EventEmitter 不依赖全局 EventBus；移动端（≤600px）完全禁用；管理面板（PuzzleCustomizer）懒加载 + 快照恢复

   ---

   ## M5 - 主题系统

   - 文件：js/services/theme-service.js（约 221 行）+ css/themes/{dark,light,lofi}/（v1.12 起各合并为一个单 CSS 文件 dark.css/light.css/lofi.css）
   - 职责：三套主题（暗色/亮色/低保真）动态切换，CSS 变量驱动，零网络请求即时响应

   ### 数据结构（THEMES 注册表）
   - dark：{ id:'dark', name:'暗色', icon:'🌙', cssFile:'/css/themes/dark.css', isDefault:true, puzzleBg:'#1a1612' }
   - light：{ id:'light', name:'亮色', icon:'☀️', cssFile:'/css/themes/light.css', isDefault:false, puzzleBg:'#f5f0eb' }
   - lofi：{ id:'lofi', name:'低保真', icon:'📼', cssFile:'/css/themes/lofi.css', isDefault:false, puzzleBg:'#fdf6e3' }
   - 持久化键：localStorage selected_theme

   ### 变量体系（约 43 个唯一变量，`_variables.css`）
   - --color-*：bg-primary / bg-secondary / bg-tertiary / bg-card / text-primary / text-secondary / text-muted / text-heading / accent / border / danger /
   success 等
   - --font-family-*：base / display / mono / serif
   - --shadow-*：sm / md / lg / xl / focus / glow

   ### 公开方法
   - getThemes() / getCurrentTheme() / getThemeInfo(themeId) / getPuzzleBackground()
   - loadTheme()：启动时从 localStorage 恢复并同步 link 状态
   - applyTheme(themeId, isRestore)：应用主题（切 link、存偏好、设置 data-theme、清内联背景、通知 Texture、广播、刷新目录树/右键菜单、更新按钮态）
   - switchTheme(themeId)：切换主题（幂等，已当前主题时忽略）
   - init()：初始化

   ### 切换机制
   - HTML 预加载三套 <link>（#theme-stylesheet-dark/light/lofi），切换仅 toggle disabled 属性，零网络请求
   - 替代旧版动态创建/销毁 <link>，消除 @import 链异步加载导致的 CSS 变量缺失
   - 仅 lofi 设置 data-theme="lofi"，dark/light 依赖默认样式
   - 主题化 favicon：切换为 /themes/{id}/favicon*

   ### 持久化与跨页同步
   - localStorage['selected_theme'] 持久化偏好
   - BroadcastChannel('revachol') 发送 type:'theme_changed' 跨标签页同步
   - EventBus.emit(THEME_CHANGED, { themeId, theme, isRestore })

   ### 依赖
   - Utils（storage 读写）、EventBus / EVENTS、Texture（setThemeMode 进入主题模式）、ContextMenu（重新初始化右键菜单）

   ### 设计要点
   - 三套主题颜色差异过大，用变量回退的调试成本高于维护独立文件 → 独立主题文件 + CSS 变量驱动
   - 切换后 150ms 延迟刷新目录树与重新初始化右键菜单（等待样式生效）

   ---

   ## M6 - 后端路由层

   - 文件：backend/enhance.cjs（约 70 行自研路由框架）+ backend/routes/{articles,decos,settings,drafts}.cjs + backend/auth.cjs（约 244 行）+
   backend/server.cjs（约 220 行，入口）
   - 职责：自研路由匹配、CORS、参数注入、统一响应

   ### 公开方法（enhance.cjs）
   - GET/POST/PUT/DELETE(path, handler)：注册路由
   - match(method, pathname)：先精确匹配，再遍历参数路由（:id 转为正则），注入 req.params
   - send(res, data, status)：统一 JSON 响应 + CORS 头
   - sendError(res, statusCode, message, code)：统一错误格式 { error, code }
   - json(req)：Promise 化请求体解析（非法 JSON 报错）

   ### 端点列表（18 个 = 14 注册 + 4 内联）
   - 注册端点（14）：GET/POST /api/articles、PUT/DELETE /api/articles/:id、PUT /api/articles/:id/visibility、GET /api/decos、GET
   /api/decos/:id/image、PUT/DELETE /api/decos/:id、GET/PUT /api/settings、GET/POST /api/articles/:id/drafts、DELETE /api/articles/:id/drafts/:draftId
   - 内联端点（4，直接在 server.cjs）：POST /api/decos（贴纸上传，requireAuth(handleDecoUpload)）、POST /api/auth/login、POST /api/auth/logout、GET
   /api/auth/me

   ### 认证流程（auth.cjs）
   - 登录：比对 ADMIN_PASSWORD 环境变量（开发默认 admin123）→ generateToken('admin','admin') → 返回 7 天有效期 Token
   - requireAuth(handler)：校验 Authorization: Bearer 头，失败 401，成功注入 req.user
   - revokeToken(token)：登出使 Token 失效
   - 所有写操作（POST/PUT/DELETE）经 requireAuth，读操作公开
   - 实现细节：内存 Map tokenStore + crypto.randomBytes(32) 生成 64 位十六进制 Token；另提供 requireRole / optionalAuth / compose 中间件工具

   ### 入口启动流程（server.cjs）
   - dotenv 加载环境变量 → storage.init() 初始化存储 → 注册四组路由 → 认证初始化 → http.createServer（CORS + OPTIONS 预检 + 内联端点 + match 分发 + 404/500
   兜底）→ initWebSocket → db.initDb() → listen(9999) → 3 秒后 cleanExpiredDrafts()

   ### 设计要点
   - 项目仅约 15 个 REST 端点，不引入 Express（概念开销 > 收益），保留原生 http 底层控制力；API 增长至 50+ 可无缝迁移 Express 控制器结构
   - 统一错误响应格式 { error, code }（前后端约定，便于前端分类处理）
   - 写操作后经 WebSocket broadcast() 通知所有客户端（文章/贴纸/设置变更）

   ---

   ## M7 - 存储适配器

   - 文件：backend/storage/index.cjs（约 7 行）、backend/storage/config.cjs（约 30 行）、backend/storage/storage-service.cjs（约 28
   行）、backend/storage/adapters/local.cjs（约 77 行）、backend/storage/adapters/rustfs.cjs（约 140 行）
   - 职责：本地文件系统 ↔ S3 兼容存储（MinIO/Ceph/AWS）无缝切换，业务代码零感知

   ### 适配器接口
   - upload(buffer, filename, contentType)：上传，返回 { id, url, key, filename }
   - getUrl(id, filename)：获取文件 URL
   - delete(filename)：删除文件
   - exists(filename)：检查文件是否存在
   - read(filename)：读取文件（Buffer）

   ### 公开方法（StorageService 门面）
   - upload / getUrl / delete / exists / read：透传给当前适配器
   - isLocal() / isRustFS()：查询当前存储类型（单例 storage 实例）

   ### 配置（config.cjs）
   - STORAGE_TYPE：.env 一行切换（local / rustfs，默认 local）
   - LOCAL_CONFIG：uploadDir = backend/uploads/decos、baseUrl = /uploads/decos
   - RUSTFS_CONFIG：endpoint / accessKey / secretKey / bucket / region / useSSL / forcePathStyle: true（适配 MinIO/RustFS 自建服务）

   ### 两个适配器
   - local.cjs：同步 I/O（writeFileSync/readFileSync，小文件同步开销更小）；ID 生成 deco_{timestamp}_{random}；getUrl 返回 /api/decos/{id}/image 图片路由
   - rustfs.cjs：基于 @aws-sdk/client-s3；构造时自动 _ensureBucket（HeadBucket →
   CreateBucket）；upload=PutObject、getUrl=http(s)://endpoint/bucket/key、exists=HeadObject、read=GetObject + transformToByteArray

   ### 设计要点
   - 门面模式：业务代码只调 storage.upload/read/delete，不感知底层是本地文件还是 S3
   - 切换只需改 .env 中 STORAGE_TYPE 一行，业务代码零改动
   - 历史背景：最初用 BLOB 存图片，sql.js WASM 在 Windows 下 BLOB 序列化偶发损坏，重构为文件系统 + 适配器方案；decos 表保留 image_data 列兼容旧数据迁移

   ---

   ## M8 - 文章编辑器

   - 文件：js/editor/ 目录（6 个文件：article-editor-mode.js 约 1000 行、article-editor-toolbar.js 约 209 行、draft-manager.js 约 311
   行、sticker-editor-mode.js 约 600+ 行、sticker-renderer.js 约 200+ 行、sticker-shape.js 约 50 行）
   - 职责：全屏模态 WYSIWYG 编辑器，支持 Markdown 智能渲染、草稿管理、贴纸插入/拖拽、保存/发布

   ### 入口与生命周期
   - 入口：ArticleEditorMode.open(articleId)（主页面 Ctrl+E 打开；≤768px 移动端禁用并提示）
   - 关闭：close(save)（save=true 时保存）；isVisible()

   ### 数据结构
   - 编辑器状态：_article / _articleId / _dirty / _saving（防重复保存/发布锁）/ _snapshot { title, content, stickers } / _renderMode('html'|'text')
   - 草稿：{ id, article_id, title, content, category, saved_at }

   ### 公开方法
   - open(articleId) / close(save) / isVisible() / hasChanges()（对比含 stickers 的快照）
   - saveDraft()：保存草稿（POST /api/articles/:id/drafts，_saving 锁防重复请求）
   - saveAndPublish()：发布（_buildSaveContent → PUT /api/articles/:id → fetchArticles(true) 刷新 → 反馈弹窗；成功更新 _snapshot）
   - discardChanges()：放弃修改，从快照恢复标题+内容+贴纸
   - getTitle() / setTitle(val) / toggleRenderMode()：标题读写与渲染模式切换
   - _openStickers()：先 saveDraft() → StickerEditorMode.open(article) → 监听 SAVED/CLOSED 回调同步贴纸

   ### 复用策略
   - 文章渲染：复用 UIDetail.renderContent 的 Markdown→HTML 逻辑
   - 全屏覆盖层：复用 StickerEditorMode._createOverlay 模式
   - ESC 退出：复用贴纸编辑模式的按键处理
   - 样式：复用 .admin-panel 面板样式

   ### 保存流程
   - 草稿：Ctrl+S / 工具栏 → saveDraft() → POST drafts（追加式，每文章最多保留 20 条，超出删最旧）
   - 发布：Ctrl+Enter / 工具栏 → saveAndPublish() → PUT articles（content 由 _buildSaveContent 就地替换贴纸 div 为标记，保留贴纸位置）
   - 关闭：close(true) → _saveArticle()（仅当 _dirty/hasChanges() 才发布）

   ### 贴纸集成
   - 文章内贴纸编辑：_openStickers → StickerEditorMode（全屏覆盖层 + 右下角控制台 + 贴纸拖拽 + 右键菜单切换浮动方向/删除）
   - 保存回调 onStickerSaved：更新 _article.stickers → _refreshStickerLayer → _buildSaveContent → ApiClient.put 同步后端
   - 标记格式：<!-- sticker:{id} x={x} y={y} w={w} h={h} align={align} -->，StickerRenderer._MARKER_REGEX 统一解析/清除（兼容新旧格式，字段顺序无关）
   - 渲染：StickerRenderer（文章内 DOM）+ StickerShape（float + margin 固定矩形绕排）

   ### 关键能力
   - 智能渲染：_renderContent Markdown→HTML，html/text 双渲染模式切换
   - 粘贴清理：pasteHandler 清洗外部粘贴内容
   - 草稿管理：DraftManager 侧边面板（预览/恢复/删除/拖拽折叠，位置持久化 article_editor_draft_pos）
   - 脏状态追踪：_dirty + hasChanges() + _snapshot（含 stickers），未保存 ESC/退出弹确认
   - 键盘快捷键：ESC（双击确认退出，1.5s 窗口）、Ctrl+S（保存草稿）、Ctrl+Enter（发布）
   - 反馈弹窗：_showFeedbackModal 发布成功详情
   - 移动端禁用：≤768px 隐藏并提示（"文章编辑功能仅支持桌面端"）

   ### 触发事件
   - EDITOR_OPENED / EDITOR_CLOSED：编辑器打开/关闭
   - STICKER_EDITOR_OPENED / STICKER_EDITOR_CLOSED / STICKER_EDITOR_SAVED：贴纸编辑生命周期与保存

   ### 依赖
   - ArticleService（文章数据）、DecoShelf（贴纸库）、ApiClient（草稿/发布请求）、EventBus / EVENTS、UI（文案）、Utils（Toast）
   - StickerRenderer / StickerShape / StickerEditorMode（贴纸系统）
   - ArticleEditorToolbar（悬浮工具栏）、DraftManager（草稿面板）
