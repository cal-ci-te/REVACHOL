# 贴纸系统重构 — P1 缺陷修复任务（Flow 临时：质量审查不阻塞合入）

> 任务类型：代码修复方案产出
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入
> 说明：本轮 Flow 通过环境变量 `CREW_REVIEWER_BLOCK_DISABLED=1` 临时禁用 Reviewer 禁止合入权限，仅作为质量审查记录 issues/suggestions。

---

## 背景

Kimi 审查了当前贴纸重构 M1-M3 + M4 代码，发现 8 项 P1 缺陷。本轮任务要求 Coder 产出每一项的精确修复方案（含代码补丁），使开发者可直接按方案修改代码。

## 修复要求（8 项 P1）

### P1-1：渲染器 x 坐标 px/百分比语义混乱

**文件**：`js/business/sticker/renderer/sticker-renderer.js`

- `clampX` 文档称 `x` 为“相对容器左侧百分比”，但内部用 `containerWidth - width`（px）做 clamp。
- `renderSticker` 左对齐把结果当 `px` 使用（`margin-left:${x}px`），右对齐却当 `%` 使用（`calc((100% - ${x}%) - ${width}px)`）。
- 要求：统一 `x` 语义。若 `x` 为百分比，则 `clampX` 返回百分比值，计算公式与右对齐 CSS 统一。
- 输出：精确的 `clampX` 与 `renderSticker` 代码补丁。

### P1-2：parser 缺失 x/y 输出 NaN

**文件**：`js/business/sticker/parser/sticker-parser.js`

- `normalizeMarkerFields` 中 `x`/`y` 缺失时 `parseInt(undefined, 10)` 得到 `NaN`，既不回退默认值也不回退 `undefined`。
- 最终序列化会输出 `x=NaN`，渲染会生成 `margin-left:NaNpx`。
- 要求：缺失/非有限值时回退 `DEFAULT_STICKER.x/y`，并同步在 `serializeOne` 中用 `Number.isFinite` 守卫输出。
- 输出：`normalizeMarkerFields` 与 `serializeOne` 的代码补丁。

### P1-3：sanitizeSvg 未接入渲染流程

**文件**：`js/business/sticker/security/security-utils.js`、`js/business/sticker/sticker-facade.js`

- `sanitizeSvg` 与 `fetchAndValidateMimeType` 已导出并注入门面，但 `StickerFacade.renderSticker` 从未调用 `sanitizeSvg`。
- `data:image/svg+xml` 仅做 MIME 白名单校验，SVG 内容未清洗。
- 要求：在渲染前对 `data:image/svg+xml` 解码并调用 `sanitizeSvg`；明确 `fetchAndValidateMimeType` 的调用策略（默认不 fetch，调用方负责）。
- 输出：`StickerFacade.renderSticker` 中接入 SVG 清洗的代码补丁。

### P1-4：stripStickerDivs 正则嵌套 div 截断内容

**文件**：`js/editor/sticker-renderer.js`

- `stripStickerDivs` 用非贪婪正则匹配 `<div ... class="...article-sticker...">...</div>`，当贴纸 div 内部嵌套 div 时会在第一个 `</div>` 处截断，导致保存时 HTML 结构损坏。
- 要求：改用 DOM 解析方式（`DOMParser` 或 `querySelectorAll`）精确移除 `.article-sticker` 与 `.sticker-clearfix` 节点，不要依赖正则匹配嵌套标签。
- 输出：`stripStickerDivs` 的精确代码补丁。

### P1-5：StickerFacade 序列化不走 DI

**文件**：`js/business/sticker/sticker-facade.js`

- `serializeOne`/`serializeAll` 直接调用顶层导入，未通过 `this.parser`/`this.serializer` 委托，导致 `createStickerFacadeWithMocks` 无法 mock 序列化行为。
- 要求：构造函数中新增 `this.serializer = deps.serializer || { serializeOne, serializeAll }`，方法内改为 `this.serializer.serializeOne(...)`。
- 输出：`StickerFacade` 构造函数的代码补丁。

### P1-6：ESLint no-inline-sticker-regexp 漏报动态拼接

**文件**：`eslint/rules/no-inline-sticker-regexp.js`

- 只检查 `Literal` 参数，无法拦截 `new RegExp('<div...' + className + '...')` 这类动态拼接的贴纸 DOM 正则。
- 要求：扩展 `CallExpression`/`NewExpression` 检测：当参数为字符串拼接表达式且任一 `Literal` 片段含 `sticker`/`article-sticker`/`<!--` 等关键词时同样报出。
- 输出：规则代码的精确补丁。

### P1-7：ESLint ban-internal-import 漏报 editor 相对路径

**文件**：`eslint/rules/ban-internal-import.js`

- editor 导入路径为 `../business/sticker/parser/...`，规则只匹配 `../sticker/...` 与 `js/business/...`，导致漏报。
- 要求：放宽正则，覆盖 `business/sticker/(model|parser|renderer|security)/` 与常见相对路径前缀；若 editor 被允许直接导入，应在规则中显式排除并注释原因。
- 输出：规则正则的精确补丁。

### P1-8：model backfillContent 重复 id 与 releaseIds 参数校验

**文件**：`js/business/sticker/model/sticker-model.js`

- `backfillContent` 对同一批多个缺失 id 的贴纸调用 `generateId` 时，不记录本批已生成 id，可能产生重复（虽然概率低）。
- `releaseIds` 未校验数组参数，传入 `Set` 或字符串会报错。
- 要求：`backfillContent` 维护局部 `generatedIds` Set 并传给 `generateId`；`releaseIds` 增加 `Array.isArray(idsOrPredicate)` 判断，非数组非函数时抛出明确错误。
- 输出：`backfillContent` 与 `releaseIds` 的代码补丁。

## 输出格式

Coder 输出应为包含以下内容的文档：
- 每项 P1 的根因分析（1-2 句）
- 精确的代码补丁（diff 或完整函数替换）
- 补丁后的文件完整性检查（`node --check`、ESLint、测试）

## 参考

- Kimi 审查输出：`D:\Temp\kimi_review_output.txt`
- 当前代码位于 `js/business/sticker/` 与 `js/editor/sticker-renderer.js`