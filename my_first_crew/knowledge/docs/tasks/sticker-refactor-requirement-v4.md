# 贴纸系统彻底重构 — 任务需求（第四轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：
> - 第三轮任务 `20260827213702` 的失败报告（v3 已吸收）
> - 第四轮任务 `20260827220832` 的失败报告（本轮必须全部吸收）

---

## 一、任务背景

贴纸系统需要彻底重构：单一数据源、单一标记处理、单一渲染核心，保证文章编辑器、全屏贴纸编辑器与阅读页所见即所得，并保持既有文章/草稿数据完全兼容。

前三轮已完成架构收敛：文档已完整、契约映射表已建立。第四轮 Reviewer 的拒绝已从“文档不完整”推进到**代码补丁级 P0/P1**：自引用 import、data URL SVG 策略矛盾、里程碑映射错位、`addSticker` 语义错误、`stripMarkers` 风险、右对齐负 margin、CSS `url()` 过滤不完整、renderer/ESLint 补丁缺失等。

本轮是**代码补丁收口轮**：不仅文档要完整，**所有代码补丁必须可编译、无自引用、安全模块完整实现**，Reviewer 只按 P0/P1 拒绝（P2 及以下不影响合入）。

## 二、重构目标

1. 贴纸数据模型、标记格式、解析/渲染/序列化逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 本轮交付**可编译、可测试的代码补丁**，并同步完整文档。

## 三、前几轮强制修订要求（继续有效）

v2/v3 已列出的全部要求继续有效，包括但不限于：

- 接口契约：`replaceMarkers` / `upsertMarker(s)` / `createMarker` / `serializeOne` / `getStickers/setStickers/addSticker/removeSticker/updateSticker` / `compatArticle/backfillContent` / `hydrateStickers` / `findAnchorEnd`；
- 安全：`src` 白名单、MIME 白名单、SVG 方案 A/B、`new URL(src)` 校验、`javascript:/blob:/vbscript:` 拒绝、`-->`/引号/控制字符转义；
- 坐标：`x` 为左边缘百分比、右对齐 `calc((100% - ${x}%) - ${displayW}px)` 推导、多贴纸布局、`clear: both`；
- id 生成：`crypto.getRandomValues(new Uint8Array(16))` + base64url，熵 ≥128 bit；
- 性能：主流桌面 50 张贴纸 p95 ≤16ms + 基准报告；
- 静态检查：自定义 ESLint 规则 `no-inline-sticker-regexp` 扫描全仓库 0 命中；
- 测试：解析/序列化/状态同步/新旧兼容/安全注入/`StickerSerializeError`/SVG/id 唯一性/round-trip；
- 文档完整性：全部章节无占位，公开函数完整 JSDoc，计划 ↔ 文档 ↔《契约映射表》逐条对齐。

## 四、第四轮失败报告强制修订要求（本轮必须满足）

以下条目全部来自第四轮 Review 3（以及 Review 1/2 中未解决项），是**硬性要求**。

### 4.1 代码补丁必须可编译（本轮最高优先级）

- 所有交付的 JS 代码补丁必须可通过 `node --check` / `eslint` / `npm run build` 语法与静态检查；
- **禁止模块自引用 import**：`sticker-model.js` 不得 import 自身；需要类型复用时使用 JSDoc `@typedef` 或独立 `types.js`；
- 文档中出现的每个函数/模块必须提供**完整实现补丁**，不允许只有签名没有实现；
- 明确缺失项将直接判定 P1（会导致返工），不得合入。

### 4.2 第四轮 Review 3 逐条落地

1. **自引用 import**：移除 `sticker-model.js` 的自引用 import；类型复用改用 `@typedef` 或 `types.js`。
2. **data URL SVG 策略统一**：二选一并写死——
   - 方案 A：将 `image/svg+xml` 加入 `DATA_URL_MIME_TYPES` 并依赖 `sanitizeSvg` 保证安全；
   - 方案 B：明确 `extractSvgFromSrc` 不处理 data URL SVG；
   - 无论选哪种，`validateSrc` 与 `extractSvgFromSrc` 的行为必须一致，并在测试中覆盖。
3. **里程碑对齐**：计划、文档 §9 里程碑、《契约映射表》三者必须一致，按以下建议执行：
   - M1：模型/标记/安全；
   - M2：渲染/性能；
   - M3：静态检查/去重；
   - M4：集成验收；
   - 修正《契约映射表》的 M 列标记。
4. **`addSticker` 语义**：改为真正的 append（`[...list, sticker]`），或重命名函数/更新文档以反映 upsert 语义；不允许文档写 append、实现却是 upsert。
5. **`stripMarkers` 实现**：改用基于标记字符串/精确选择器的移除（限定 `<span class="sticker-marker">` 与特定旧 `<img>` 模式），避免 DOMParser 重写 content；若必须用 DOMParser，必须在文档中声明并评估影响。
6. **右对齐计算**：增加 `Math.max(0, ...)` clamp，或改用 `right: calc((100 - x)%)` + `transform: translateX(-100%)` 避免负 margin；文档给出公式与边界说明。
7. **M0 占位**：移除所有“待回填”占位，或明确标记为例外并同步更新 M0 验收标准。
8. **CSS `url()` 过滤**：仅禁止非本地/外部 URL，保留同一 SVG 文档内 `#id` 引用；给出过滤规则与测试。
9. **renderer 与 ESLint 补丁**：补充 `sticker-renderer.js` 与 `eslint-rule-no-inline-sticker-regexp.js` 的核心实现补丁，供 Reviewer 直接审查。
10. **旧标记兼容清单**：在 §4.3 或 §3.4 列出所有需要兼容的旧标记 HTML 模式及属性映射表（旧格式无引号、新格式双引号、`<span class="sticker-marker">`、旧 `<img>` 等）。

### 4.3 第四轮 Review 1/2 未解决项（一并落实）

- `replaceMarkers` 必须先统一移除 content 内所有现有贴纸标记（或调用 `stripMarkers`），再由 `backfillContent` 回填，保证保存路径幂等；
- `resolveStickers` 对缺少 id 的标记自动调用 `generateId()` 补齐，保证运行时 Sticker 模型始终有合法 id；
- `sticker-security.js` 给出完整实现：`sanitizeSvg` allowlist、style 移除、事件属性过滤、CSS 危险子集过滤、`clip-path/mask` 的 `#id` 白名单校验、`extractSvgFromSrc` 统一处理 URL SVG 与 data URI SVG；
- `validateSrc` 签名与文档描述统一（明确 `options` 是否需要）；
- `findAnchorEnd` 返回结构化 warning（如 `{ index, warnings: [{ code, message }] }`），区分“锚点未找到”与“锚点在标签/注释内”；
- 常量统一由 `event-constants.js` / `ui-strings.js` 作为唯一来源，`sticker-constants.js` 只做 re-export 或删除重复；
- MIME 白名单适用范围写清：若 `src` 支持 SVG 则纳入 `image/svg+xml`；若仅用于上传校验则显式限定场景。

## 五、合入标准（Reviewer 执行口径）

- 只允许 P0/P1 导致拒绝；P2 及以下可存在但不影响合入；
- 代码补丁必须可编译、无自引用、安全模块完整；缺失实现/编译失败/策略矛盾 = P1；
- 若 `approved=false`，feedback 只列 P0/P1 且给出具体可执行修改意见。

## 六、验收标准

1. 4.1–4.3 每一条都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
2. 所有代码补丁通过 `node --check` / `eslint` / `npm run build`；全仓库 `no-inline-sticker-regexp` 扫描 0 命中。
3. 计划、文档 §9 里程碑、《契约映射表》三者 M 列完全一致。
4. 所有既有贴纸数据（新旧标记、含 `stickers` 字段/仅 content 标记）在阅读页与编辑器中正确渲染，无数据丢失。
5. 编辑态与阅读态贴纸显示一致，“贴纸浮动渲染显示”WIP 关闭。
6. `npm run test`、`npm run build` 通过；Vitest 覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝、id 唯一性、右对齐 clamp、`stripMarkers` 兼容等。
7. 更新 `sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。
8. 交付物包含：完整重构方案、《契约映射表》、**可编译代码补丁**、测试与验证结果、性能基准报告、ESLint 扫描报告、文档更新清单。

## 七、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 八、参考文档

- 第四轮失败报告：`my_first_crew/output/staging/20260827220832/failure_report.md`
- 第四轮设计文档：`my_first_crew/output/flow_state/20260827220832-document.md`
- 第三轮失败报告：`my_first_crew/output/staging/20260827213702/failure_report.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`
