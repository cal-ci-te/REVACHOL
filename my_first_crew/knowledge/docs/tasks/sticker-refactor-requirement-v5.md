# 贴纸系统彻底重构 — 任务需求（第五轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：
> - 第四轮任务 `20260827220832` 的失败报告（v4 已吸收）
> - 第五轮任务 `20260827224635` 的失败报告（本轮必须全部吸收）

---

## 一、任务背景

贴纸系统需要彻底重构：单一数据源、单一标记处理、单一渲染核心，保证文章编辑器、全屏贴纸编辑器与阅读页所见即所得，并保持既有文章/草稿数据完全兼容。

前四轮已完成：文档完整、契约映射表、代码补丁可编译、无自引用、安全模块完整。第五轮 Reviewer 的拒绝已收敛到**章节编号/常量单一来源/语义澄清/测试补充/实现归属**等收尾级 P0/P1。

本轮是**最终收口轮**：文档结构、常量归属、API 语义、实现归属、ESLint 规则、性能测量方案必须全部明确；Reviewer 只按 P0/P1 拒绝（P2 及以下不影响合入）。

## 二、重构目标

1. 贴纸数据模型、标记格式、解析/渲染/序列化逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 本轮交付**可编译、可测试的代码补丁**与**结构完全一致的文档**。

## 三、前几轮强制修订要求（继续有效）

v2/v3/v4 已列出的全部要求继续有效，包括接口契约、安全、坐标、id 生成、性能、静态检查、测试、文档完整性、代码可编译性、无自引用、安全模块完整实现等。

## 四、第五轮失败报告强制修订要求（本轮必须满足）

### 4.1 文档结构与交叉引用（Review 1）

1. **里程碑章节编号**：将“里程碑计划”章节调整为第 9 节（例如与“静态检查与常量收敛”对调或重新编号），确保与计划 M4 的引用完全一致；附录 A《契约映射表》的 M 列必须与该章节完全对齐。
2. **版本历史表**：填入实际日期与 `version-manage.md` 对应的版本号，禁止“待定/TBD”。
3. **交叉引用**：第 9 节“里程碑计划”必须显式引用附录 A《契约映射表》，强化“计划 ↔ 文档 ↔ 附录 A”三处一致性。
4. **右对齐 clamp 测试**：代码实现阶段补充边界值测试（`x > 100%` 与 `x < 0`），验证 CSS/逻辑层 clamp 行为与文档描述一致。

### 4.2 错别字与细节（Review 2，虽为 P2 但必须修复）

5. §3.2“不依赖其他贴克模块”错别字修正为“贴纸模块”。
6. §6.1 列出 raster MIME 白名单具体条目：`image/png`、`image/jpeg`、`image/webp`、`image/gif` 等，并写明允许/拒绝规则。
7. §4 API 表补充 `hydrateStickers(container)` 的返回值、副作用、选择器细节，避免调用方误解其是否修改内部状态。
8. 计划/文档/附录 A 三处 M 列一致性**在本轮（对应 v0.2 阶段）即完成**，不得留到 M4。
9. §8.2 字符串场景“精确匹配”移除旧 HTML 标记：声明嵌套、转义、大小写不敏感等边界的处理原则，并提供对应测试用例。

### 4.3 常量与实现归属（Review 3）

10. **常量单一来源**：`RASTER_MIME_TYPES` / `DATA_URL_MIME_TYPES` 的定义位置明确为 `event-constants.js` 或 `sticker-security.js` 等单一来源；`sticker-constants.js` 仅做 re-export；删除文档中“在 sticker-constants.js 内直接定义常量”的示例。
11. **`serializeOne` 实现归属**：明确由 `sticker-parser.js` 实现，`sticker-model.js` 作为统一对外入口 re-export 或委托调用，禁止重复实现。

### 4.4 API 语义（Review 3）

12. **右对齐语义统一**：若 `x` 始终为左边缘百分比，则右对齐使用 `right: calc((100% - x%) - <displayW>px)` 或 `left: max(0%, x%)` 配合容器 `text-align/end` 逻辑；若 `x` 在右对齐模式下表示“距右边缘百分比”，必须在 §5.1 显式说明并补充类型字段或 align 上下文转换。二选一写死。
13. **`hydrateStickers` 缺 id 处理**：在 §4.1 明确策略——
    - 方案 A：返回补齐 id 的对象，并建议调用方用 `setStickers`/`upsert` 同步回 model；
    - 方案 B：提供可选参数 `writebackId` 直接更新 DOM；
    - 无论哪种，生成的 id 必须在 model 内做唯一性检查。
14. **`generateId` 唯一性保证**：在 §5.5 写明实现约定——生成后检查现有 sticker id 集合，若冲突则重新生成；补充冲突重试测试。
15. **`replaceMarkers` 两种执行路径**：在 §8.2 明确——
    - 字符串路径：仅负责移除 `serializeOne` 生成的规范新标记；
    - 旧标记迁移：必须通过 DOM 路径（`hydrateStickers` + `backfillContent`）完成；
    - `replaceMarkers` 内部根据输入类型选择路径，避免旧标记残留导致幂等失败。

### 4.5 静态检查与性能测量（Review 3）

16. **ESLint 规则精确化**：将 `/sticker/i` 改为更精确模式（如匹配 `sticker-marker`、`class=["']sticker["']`、`data-sticker-id` 等），或配置核心模块（`sticker-parser.js`、`sticker-renderer.js` 等）按路径豁免；提供误报回归测试。
17. **性能基准测量方案**：在 §7.4 / §11.3 补充具体测量方案——浏览器版本、测试数据（文章/贴纸规模）、渲染帧采集方式（`requestAnimationFrame` / `PerformanceObserver`），并说明 jsdom 仅作为冒烟测试、不作为性能基准。

## 五、合入标准（Reviewer 执行口径）

- 只允许 P0/P1 导致拒绝；P2 及以下可存在但不影响合入；
- 文档结构、常量归属、API 语义、实现归属、ESLint 规则、性能测量方案必须全部明确且自洽；
- 若 `approved=false`，feedback 只列 P0/P1 且给出具体可执行修改意见。

## 六、验收标准

1. 4.1–4.5 每一条都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
2. 计划、文档第 9 节里程碑、附录 A《契约映射表》三者 M 列完全一致，且第 9 节显式引用附录 A。
3. 常量定义单一来源，无重复定义；`serializeOne` 实现归属唯一。
4. 所有代码补丁通过 `node --check` / `eslint` / `npm run build`；`no-inline-sticker-regexp` 扫描 0 命中（含精确模式与豁免配置）。
5. 所有既有贴纸数据（新旧标记、含 `stickers` 字段/仅 content 标记）在阅读页与编辑器中正确渲染，无数据丢失。
6. 编辑态与阅读态贴纸显示一致，“贴纸浮动渲染显示”WIP 关闭。
7. `npm run test`、`npm run build` 通过；Vitest 覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝、id 唯一性与冲突重试、右对齐 clamp 边界、`stripMarkers`/`replaceMarkers` 两种路径等。
8. 更新 `sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。
9. 交付物包含：完整重构方案、《契约映射表》、可编译代码补丁、测试与验证结果、性能基准测量方案与报告、ESLint 扫描报告、文档更新清单。

## 七、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 八、参考文档

- 第五轮失败报告：`my_first_crew/output/staging/20260827224635/failure_report.md`
- 第五轮设计文档：`my_first_crew/output/flow_state/20260827224635-document.md`
- 第四轮失败报告：`my_first_crew/output/staging/20260827220832/failure_report.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`
