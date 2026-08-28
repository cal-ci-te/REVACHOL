# 贴纸系统彻底重构 — 任务需求（第二轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：第一轮任务 `20260825120651` 的《未通过审查报告》（3 轮 Review 意见已全部吸收为本轮硬性要求）

---

## 一、任务背景

贴纸系统经过多轮增量修补（v1.18 ~ v1.26），目前存在多套相互纠缠的实现：

- 标记解析、渲染、保存逻辑在 `article-editor-mode.js`、`sticker-editor-mode.js`、`detail.js`、`sticker-renderer.js` 等文件中重复或半重复；
- `_stickerData` 与 DOM 形成双数据源，拖拽后内存数据不同步；
- 阅读页与编辑器的浮动渲染显示长期不一致（roadmap 中“贴纸浮动渲染显示功能尚未修复”WIP 项）；
- 第一轮已产出设计文档但连续 3 次审查未通过，问题集中在**接口契约不一致、HTML/URL 安全、坐标与浮动数学、id 生成、兼容层语义、静态检查与测试覆盖**。

本轮目标：在保留第一轮架构方向（单一数据源、单一渲染核心、阅读/编辑所见即所得）的前提下，**严格按失败报告修订设计并完成实现**，确保 Reviewer 按本轮验收标准可通过。

## 二、重构目标

1. 贴纸数据模型、标记格式、解析/渲染/序列化逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 通过现有测试并补充必要的单元测试，同步更新相关文档。

## 三、第一轮失败报告强制修订要求（本轮必须满足）

以下条款全部来自第一轮 3 次 Review 意见，是**硬性要求**，设计文档与实现必须明确体现，不允许含糊或自相矛盾。

### 3.1 模块接口契约（必须统一）

- 统一 `sticker-markup.js` API：
  - 提供 `replaceMarkers(content, stickers)` 作为保存入口（替换/追加标记段并保留其他 HTML）；
  - `upsertMarker` 只做按 id 的局部更新，或改为支持数组的批量版本；文档必须说明与 `replaceMarkers` 的职责边界；
  - `createMarker` 与 `serializeOne` 行为对齐，并补全完整 JSDoc。
- 统一 model API 命名，计划与文档必须一致：
  - `getStickers(article)` / `setStickers(article, stickers)` / `addSticker(article, data)` / `removeSticker(article, id)` / `updateSticker(article, id, patch)`；
  - 纯数组工具函数不得与上述数据方法重名，另起命名空间或加 `InArray` 后缀。
- `compatArticle` 语义固定：
  - `compatArticle(article)` 仅返回归一化后的 `stickers`，不修改也不返回 content；
  - content 回填统一由 `backfillContent(article)` / `replaceMarkers` 在保存路径处理；
  - 文档明确 `resolveStickers` / `backfillContent` / `replaceMarkers` 的调用时机、副作用与幂等性。
- `serializeOne` 错误契约固定：必填字段缺失时抛出 `StickerSerializeError`，单元测试必须覆盖该异常。
- 统一错误处理风格：`normalizeSticker` 与 `validateStickers` 的返回契约二选一并写清——要么 `normalizeSticker` 返回 `{ sticker, errors }`，要么保持返回 `null` 但文档显式说明调用方必须先用 `validateStickers` 预检。
- `sticker-editor-interactions` 只暴露 `init/destroy` 与事件绑定，不得暴露 `getStickers/setStickers/addSticker/removeSticker` 等数据方法，避免与 model 层重叠。

### 3.2 安全（HTML 注释、URL、SVG）

- 序列化层必须对属性值做转义：`&`、`"`、`<`、`>`、`--`、控制字符；parser 做对应单遍还原，禁止二次解码。
- `src` 白名单：仅允许 `http(s)` 与受限 `data:` URI；必须用 `URL` 构造函数校验并显式拒绝 `javascript:` / `blob:` / `vbscript:`。
- `data:` URI MIME 白名单：仅允许 `/^data:image\/(png|jpeg|jpg|gif|webp|svg\+xml);/i`，非 image 类型一律拒绝。
- SVG 安全策略必须明确二选一并写进文档：
  - 方案 A：将 `image/svg+xml` 从白名单移除（最严格）；
  - 方案 B：保留 SVG 但必须清洗/沙箱，禁止 `<script>`、`on*` 属性（可使用 DOMPurify 或等价策略），并配套测试。
- 增加安全/注入专项测试：`-->`、引号、协议绕过、超长 data URI、SVG 含 `<script>`、SVG 含 `onload`、干净 SVG 的接受/拒绝行为。

### 3.3 坐标与浮动渲染（必须数学自洽）

- 坐标模型固定：`x` 表示贴纸左边缘相对容器左侧的**百分比**；`y` 表示相对容器顶部的百分比（或文档明确定义）。
- `align: left` / `right` 与 float 的关系必须给出推导和示意图：
  - 右对齐使用 `margin-right: calc(${(100 - x)}% - ${displayW}px)`，文档必须给出推导（容器宽 C 时左边缘落在 x%）与示意图；
  - 禁止使用 `margin-left: ${x}%` 描述右对齐，避免 CSS 百分比语义误导。
- 补充多贴纸布局示意图：同侧多贴纸、左右两侧贴纸、`y%` 与 float 流交互；必要时引入 wrapper 或 `clear: both` 策略。
- `shape` 渲染规范：`round` 使用 `border-radius: 50%`（或按设计稿明确），`square` 为直角；说明是否影响 float margin。
- 标记段位置约定：默认标记段始终位于 content 末尾，保存前先 `stripMarkers` 移除旧段；提供可选 `markerAnchor` 参数支持编辑器指定位置，并给出 `findAnchorEnd` 实现草案（正则或 HTML parser 伪代码）及锚点不存在、锚点在注释/标签内、content 为空时的回退策略。

### 3.4 id 生成（必须唯一且可测试）

- 仅使用 `crypto.getRandomValues(new Uint8Array(16))` + base64url 编码，熵值 ≥128 bit；
- 移除 `Date.now() + Math.random()` 回退；测试环境注入 crypto mock；
- M1 交付物包含 crypto 可用性检测：生产环境缺少 crypto 时抛出可观测错误，不得静默降级。

### 3.5 渲染与性能（必须可验收）

- 图片加载失败默认显示占位节点与错误样式，`onImageError` 仅作为可选通知；
- 统一错误事件 payload：`{ stickerId, src, error }`，`RenderOptions.onImageError` 与 `STICKER_EVENTS.IMAGE_ERROR` 保持一致；
- IntersectionObserver 配置：`rootMargin: '200px 0px'`、`threshold: 0`；阅读区为独立滚动容器时支持传入 `root` 选项，默认 viewport 需在文档标注适用场景；占位节点使用 `data-sticker-id`，切换时复用 wrapper 避免回流；
- 性能验收：主流桌面环境 50 张贴纸 p95 ≤16ms，并提供基准测试报告；移动端/CI 作为参考指标。

### 3.6 静态检查与测试（必须落地）

- 编写自定义 ESLint 规则 `no-inline-sticker-regexp`，同时拦截 `Literal[regex]` 与 `new RegExp(...)` 中匹配 `/sticker[\s:\-]/i` 的表达式；示例包括禁止 `/<!--\s*sticker/`、`/sticker:/` 等；
- M2 验收时扫描全仓库并产出报告（目标 0 处内联正则）；
- parser fixture 覆盖：旧格式无引号、新格式双引号、value 含空格、value 含引号需转义、属性重复、注释文本中出现 `-->` 实体等；
- 通过实际 DOM/浏览器 fixture 验证 `--` 与实体解码顺序，确保 `&#45;&#45;` 不会被浏览器解析为注释结束；
- 里程碑增加依赖图与冻结点：M2 完成后冻结 markup/parser/model API，M4 前完成 fixtures 审计。

## 四、原有基础要求（继续有效）

- 贴纸占位标记继续使用 HTML 注释形式（`<!-- sticker:... -->`），兼容旧格式与当前新格式，字段顺序无关。
- 贴纸数据以 `article.stickers`（或等价单一数据源）为权威来源，禁止保存路径产生双份、丢失或顺序错乱。
- 阅读页与编辑器（含全屏贴纸编辑模式）共用同一渲染核心，浮动方向、尺寸、文字间距、形状绕排一致。
- 保留既有交互：拖拽移动、缩放、右键菜单（切换对齐/删除）、贴纸库放置、未放置贴纸管理。
- 移动端（≤768px）维持既有行为；三套主题（dark/light/lofi）视觉一致。
- 修复已记录遗留问题：草稿恢复后贴纸从 content 重新解析、保存/发布防重复、拖拽结束后状态同步、监听器与定时器显式清理、DOM 引用置空。
- 遵循项目规范：ES Module、2 空格缩进、JSDoc、UI 文案统一在 `js/utils/ui-strings.js`、事件常量统一在 `js/core/event-constants.js`、颜色使用 CSS 变量。
- 不引入新运行时框架/重依赖；如确需新增依赖（如 DOMPurify），必须说明理由、体积与替代方案。

## 五、验收标准

1. 第一轮失败报告中 3.1–3.6 的每一条要求都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
2. 所有既有贴纸数据（新旧标记、含 `stickers` 字段/仅 content 标记）在阅读页与编辑器中正确渲染，无数据丢失。
3. 编辑态与阅读态贴纸显示一致，“贴纸浮动渲染显示”WIP 关闭。
4. 全仓库不存在重复的贴纸正则、解析或渲染实现；`no-inline-sticker-regexp` 扫描 0 命中。
5. 拖拽/缩放/对齐切换/删除后保存并刷新，位置与属性完整恢复；草稿保存→恢复→编辑→发布全链路一致。
6. `npm run test`、`npm run build` 通过；新增/更新 Vitest 单元测试覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝等。
7. 更新 `my_first_crew/knowledge/docs/development/sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。
8. 交付物包含：修订版重构方案（架构/文件清单/迁移策略/API 契约）、完整代码或补丁、测试与验证结果、性能基准报告、ESLint 扫描报告、文档更新清单。

## 六、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 七、参考文档

- 第一轮失败报告：`my_first_crew/output/staging/20260825120651/failure_report.md`
- 第一轮设计文档：`my_first_crew/output/flow_state/20260825120651-document.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`
