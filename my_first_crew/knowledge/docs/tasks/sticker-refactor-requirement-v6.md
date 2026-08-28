# 贴纸系统彻底重构 — 任务需求（第六轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：
> - 第五轮任务 `20260827230527` 的失败报告（本轮必须全部吸收）

---

## 一、任务背景

贴纸系统需要彻底重构：单一数据源、单一标记处理、单一渲染核心，保证文章编辑器、全屏贴纸编辑器与阅读页所见即所得，并保持既有文章/草稿数据完全兼容。

前五轮已完成：文档完整、契约映射、代码可编译、常量单一来源、里程碑对齐。第六轮 Reviewer 的拒绝已收敛到**架构层单一职责（parser/facade/renderer）、生命周期细节（id 释放、安全断言）、解析单一来源**等收尾级 P0/P1。

本轮是**架构收口轮**：`parseMarkers` 单一实现、`StickerFacade` 统一入口、`hydrateStickers` 完整对象、`releaseIds` 生命周期、`assertSafeStickerData` 安全断言、`sanitizeSvg` 语义明确、MIME 校验策略写定。

## 二、重构目标

1. 贴纸数据模型、标记解析/序列化/渲染逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 本轮交付**可编译、可测试的代码补丁**与**架构内外一致的文档**。

## 三、前几轮强制修订要求（继续有效）

v2–v5 已列出的全部要求继续有效，包括接口契约、安全、坐标、id 生成、性能、静态检查、测试、文档完整性、代码可编译、无自引用、安全模块完整、里程碑对齐、常量单一来源、ESLint 规则精确化、性能测量方案等。

## 四、第六轮失败报告强制修订要求（本轮必须满足）

### 4.1 解析单一来源（Review 3 P1）

1. **`parseMarkers(container)` 单一实现**：在 `sticker-parser.js` 中实现 `parseMarkers(container) => StickerObject[]`，统一负责从 DOM 解析 sticker 全部字段；`sticker-model.js` 的 `hydrateStickers` 仅做委托或 re-export，确保解析单一来源。
2. **`hydrateStickers` 返回完整对象**：必须返回完整 `StickerObject`（含 `id/x/y/width/height/align/src`），不应包含 DOM node；否则 `model.setStickers` 会丢失业务数据。
3. **新增 `StickerFacade` 统一入口**：对外暴露 `hydrateStickers`、`replaceMarkers`、`serializeAll` 等能力，内部再分派到各模块；文档 API 表同步更新。

### 4.2 生命周期与安全（Review 3 P1）

4. **`replaceMarkers` DOM 路径 id 释放**：收集所有被剥离的 id（`afterIds`），在释放前过滤掉 `StickerModel` 真实持有的 id；`releaseIds` 接收可选模型引用或传入 predicate，落实 §8.2 生命周期约定。
5. **`backfillContent` 新增 id 强制 `generateId()`**：禁止直接使用 `Math.random()` 构造 id。
6. **`renderSticker`/`serializeOne` 安全断言**：写入 DOM/序列化前调用 `assertSafeStickerData`（或校验后的白名单函数），确保恶意 data URL / SVG 无法进入 DOM。
7. **`sanitizeSvg` 语义明确**：改为真正清洗（移除/转义危险节点与属性）而非简单拒绝；若项目阶段只能拒绝，文档 §6.2 同步改为“拒绝”语义。
8. **http(s) URL MIME 校验策略**：明确 `validateMimeType` 区分普通 URL 与 data URL 的校验逻辑；普通 URL 仅检查 `Content-Type` 响应头（或跳过 MIME 检查），data URL 走白名单。

### 4.3 Review 1/2 P2 项（一并修复，不留尾巴）

9. **`stripMarkers` 正则增强**：当前正则严格依赖属性顺序且无法处理单引号或含内容的 span，建议改用 DOMParser 或更宽松的 marker 特征匹配，并在测试中覆盖边界情况。
10. **`generateId` 退化分支**：显式控制重试上限（如 `attempts > MAX_RETRY`），重置计数器；补充冲突重试的单元测试（预填充 idSet 后强制碰撞）。
11. **常量命名**：`RASTER_MIME_TYPES` 含 SVG 与命名冲突，改为 `STICKER_IMAGE_MIME_TYPES` 或将 SVG 单独拆分；`event-constants.js` 承载 MIME 白名单语义不符，更名为 `security-constants.js` 或在 `module-index.md` 中说明职责。
12. **ESLint patterns 精确化**：字面字符串无法覆盖 `class="sticker active"`、单双引号混用等变体，改为精确正则模式并补充误报回归用例。
13. **`containerWidth` 默认值**：`sticker-renderer.js` 的 `containerWidth` 默认值为 0，未传容器宽度时右对齐被降级为左对齐，在 §5.1 中明确该降级行为。
14. **端到端集成用例**：在附录 B 补充从旧 content → `hydrateStickers` + `model.setStickers` + `serializeAll` / `renderSticker` 的完整数据流，验证坐标与 src 不丢失。
15. **`StickerModel` 生命周期**：提供 `clear`/`removeSticker` 能力，允许在测试或生命周期中重置 idSet，避免模块级全局状态导致测试相互污染。
16. **`renderSticker` CSS URL 转义**：`sticker.src` 应做 CSS URL 转义，防止特殊字符破坏 `background-image` 语法。
17. **`sticker-renderer.js` Vitest 用例**：补充覆盖右对齐 clamp、居中 transform、溢出退化分支等场景。

## 五、合入标准（Reviewer 执行口径）

- 只允许 P0/P1 导致拒绝；P2 及以下可存在但不影响合入；
- 架构层单一职责（parser/facade/renderer）、生命周期（id 释放、安全断言）、安全清洗语义必须全部明确且自洽；
- 若 `approved=false`，feedback 只列 P0/P1 且给出具体可执行修改意见。

## 六、验收标准

1. 4.1–4.3 每一条都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
2. `parseMarkers` 单一来源，`StickerFacade` 统一入口，`hydrateStickers` 返回完整对象。
3. 所有代码补丁通过 `node --check` / `eslint` / `npm run build`；`no-inline-sticker-regexp` 扫描 0 命中。
4. 所有既有贴纸数据（新旧标记、含 `stickers` 字段/仅 content 标记）在阅读页与编辑器中正确渲染，无数据丢失。
5. 编辑态与阅读态贴纸显示一致，“贴纸浮动渲染显示”WIP 关闭。
6. `npm run test`、`npm run build` 通过；Vitest 覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝、id 唯一性与冲突重试、右对齐 clamp 边界、`stripMarkers`/`replaceMarkers` 双路径、端到端数据流等。
7. 更新 `sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。
8. 交付物包含：完整重构方案、《契约映射表》、可编译代码补丁、测试与验证结果、性能基准测量方案与报告、ESLint 扫描报告、文档更新清单。

## 七、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 八、参考文档

- 第六轮失败报告：`my_first_crew/output/staging/20260827230527/failure_report.md`
- 第六轮设计文档：`my_first_crew/output/flow_state/20260827230527-document.md`
- 第五轮失败报告：`my_first_crew/output/staging/20260827224635/failure_report.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`