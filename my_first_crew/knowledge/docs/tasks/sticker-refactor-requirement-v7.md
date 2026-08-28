# 贴纸系统彻底重构 — 任务需求（第七轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：
> - 第六轮任务 `20260828211559` 的失败报告（本轮必须全部吸收）

---

## 一、任务背景

贴纸系统需要彻底重构：单一数据源、单一标记处理、单一渲染核心，保证文章编辑器、全屏贴纸编辑器与阅读页所见即所得，并保持既有文章/草稿数据完全兼容。

前六轮已完成架构收敛与文档完整。第七轮 Reviewer 的拒绝已收敛到**实现级工程细节**：`validateMimeType` 同步/异步拆分、`StickerFacade` 依赖注入、`ban-internal-import` ESLint 作用域、`sanitizeSvg` 黑名单/DOMPurify、`escapeCssUrl` 转义、版本号与里程碑对齐。

本轮是**实现细节收口轮**，重点锁定以下方向，同时继续满足 P0/P1 合入标准（P2 及以下不影响合入）。

## 二、重构目标

1. 贴纸数据模型、标记解析/序列化/渲染逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 本轮交付**可编译、可测试、安全自洽**的代码补丁与文档。

## 三、前几轮强制修订要求（继续有效）

v2–v6 已列出的全部要求继续有效，包括接口契约、安全、坐标、id 生成、性能、静态检查、测试、文档完整性、代码可编译、无自引用、安全模块完整、里程碑对齐、常量单一来源、ESLint 规则精确化、`parseMarkers` 单一来源、`StickerFacade` 统一入口等。

## 四、第七轮重点锁定要求（本轮必须满足）

### 4.1 validateMimeType 拆分

1. 将 `validateMimeType` 拆分为：
   - 同步 `validateDataUrlMimeType(src)`：仅用于 data URL 白名单与长度检查；
   - 可选异步 `fetchAndValidateMimeType(src)`：用于普通 http/https URL；
   - `assertSafeStickerData` 仅执行同步校验，避免阻塞渲染/序列化。
2. `fetchAndValidateMimeType` 补充 SSRF 限制：禁止自动重定向、拒绝私有 IP/元地址（127.0.0.1、169.254.169.254 等）、设置请求超时。
3. 明确普通 http/https src 的 MIME 校验**默认不触发 fetch**（仅同步白名单/语法检查）；在 8.3 说明“前端无法完全阻止 DNS rebinding，私有 IP 拦截为最佳努力”。

### 4.2 StickerFacade DI（依赖注入）

4. `StickerFacade` 内部自行实例化 model/renderer/parser/security，且项目**不再对外导出这些子模块**；如必须导出，在 README/API 表标记 `@internal`，并配合 lint 规则禁止业务目录 import。
5. 提供**依赖注入/测试工厂**：允许注入 mock 的 parser/model/renderer/security，方便单元测试。
6. 补全 `facade.releaseIds(ids | predicate)` 与 `facade.backfillContent/generateId` 签名，删除 `releaseIds` 的“模型引用”重载。

### 4.3 ban-internal-import 配置

7. 在 `eslint.config.js` 中新增 `ban-internal-import` 规则：
   - 使用 `files: ['src/business/**/*.js']` 限定业务目录作用域；
   - 通过 `ignores` 排除内部模块、facade 入口及测试目录；
   - 与 `no-inline-sticker-regexp` 一并纳入 M1/M3 验收（规则代码 + 扫描报告）。

### 4.4 sanitizeSvg 黑名单 / DOMPurify

8. `sanitizeSvg` 实现方案明确：
   - 列出危险标签（`<script>`、`<foreignObject>`、`<use>` 指向外部等）、危险属性（`on*`、`href`/`xlink:href` 指向 `javascript:`）、危险协议（`javascript:`、`data:` 非 image、`file:`）；
   - 考虑引入 DOMPurify；无论自研还是引用库，都提供“清洗后再检测”的回归测试集（含 `<script>`、`onload`、`<style>` 危险 CSS、`<use xlink:href>` 等）。
9. `security-utils.js` 依赖 `security-constants.js` 提供的常量；`StickerFacade` 默认 security 依赖注入 `security-utils.js`；删除 `security-constants.js` re-export 函数的描述。

### 4.5 escapeCssUrl

10. 补充 `escapeCssUrl(src)` 规范：转义 CSS URL token 中的特殊字符（`"`、`'`、`\`、`)`、空白、控制字符等），确保 data URL、query string 中的 `)` 等不会破坏 `background-image: url(...)` 语法；提供单元测试。

### 4.6 版本号与里程碑对齐

11. **版本号统一**：按 `version-manage.md` 统一为 `v1.26.0-wip`（计划、文档、更新日志一致），禁止文档出现 `v2.4.0` 等不一致版本号。
12. **里程碑对齐**：计划、文档 §9 里程碑、《契约映射表》三者必须一致；若需要 M5，则将计划 `milestones` 扩展为 M1–M5，否则将文档 M4/M5 合并回 M4；修正《契约映射表》M 列标记。
13. 验收口径中引用的章节编号必须与文档实际章节一致（如 `9.1–9.3`，避免引用错位）。

### 4.7 其余第七轮意见（一并落实）

14. 统一 `serializeOne` 术语：在 §5.2 明确提供 `serializeOne(sticker)`，或删除该术语避免文档与实现不一致；展开 `serializeAll/serializeOne` 的 options schema。
15. `no-inline-sticker-regexp` 检测 `Literal` 中的正则、`RegExpLiteral` 节点、`new RegExp(...)`/`RegExp(...)` CallExpression；允许 `sticker-parser.js` 自身及测试用例中的合法正则。
16. `containerWidth === 0` 降级路径：补充 resize 后重新 clamp 的设计、事件触发时机与渲染器单元测试。
17. M4 测试清单增加 SSRF/安全测试：验证普通 http/https src 不会在前端触发 fetch，危险 data URL/SVG 会被 `assertSafeStickerData` 拦截。

## 五、合入标准（Reviewer 执行口径）

- 只允许 P0/P1 导致拒绝；P2 及以下可存在但不影响合入；
- 实现细节（同步/异步拆分、DI、ESLint 作用域、sanitizeSvg、escapeCssUrl、版本号与里程碑）必须全部明确且自洽；
- 若 `approved=false`，feedback 只列 P0/P1 且给出具体可执行修改意见。

## 六、验收标准

1. 4.1–4.7 每一条都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
2. `validateMimeType` 拆分完成，`assertSafeStickerData` 仅同步；SSRF 限制与 DNS rebinding 说明齐全。
3. `StickerFacade` 具备 DI/测试工厂，子模块 `@internal`，`ban-internal-import` 配置生效且扫描 0 命中。
4. `sanitizeSvg` 黑名单/DOMPurify 方案明确并有回归测试集。
5. `escapeCssUrl` 实现并覆盖边界测试。
6. 版本号统一为 `v1.26.0-wip`；计划/文档/《契约映射表》里程碑 M 列完全一致。
7. 所有代码补丁通过 `node --check` / `eslint` / `npm run build`。
8. 所有既有贴纸数据在阅读页与编辑器中正确渲染，无数据丢失；编辑态与阅读态显示一致（WIP 关闭）。
9. `npm run test`、`npm run build` 通过；Vitest 覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝、id 唯一性、右对齐 clamp、`escapeCssUrl`、SSRF 拦截等。
10. 更新 `sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。

## 七、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 八、参考文档

- 第七轮失败报告：`my_first_crew/output/staging/20260828211559/failure_report.md`
- 第七轮设计文档：`my_first_crew/output/flow_state/20260828211559-document.md`
- 第六轮失败报告：`my_first_crew/output/staging/20260827230527/failure_report.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`
