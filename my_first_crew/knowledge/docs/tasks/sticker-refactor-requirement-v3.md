# 贴纸系统彻底重构 — 任务需求（第三轮）

> 任务类型：代码重构 + 文档同步
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入，由 Planner → TextProcessor → Coder → Reviewer → Document_Admin 执行
> 适用版本：v1.26.0-wip 及之后
> 依据：
> - 第二轮任务 `20260825232625` 的《未通过审查报告》（v2 已吸收）
> - 第三轮任务 `20260827213702` 的《未通过审查报告》（本轮必须全部吸收）

---

## 一、任务背景

贴纸系统需要彻底重构：单一数据源、单一标记处理、单一渲染核心，保证文章编辑器、全屏贴纸编辑器与阅读页所见即所得，并保持既有文章/草稿数据完全兼容。

前两轮已产出逐步完善的架构方案，但 Reviewer 连续拒绝的根因已收敛为两类：

1. **文档不完整**：§3.5 及后续章节、JSDoc、里程碑交付物、模块职责说明缺失或留白，Reviewer 无法确认契约；
2. **契约与计划不对齐**：`upsertMarker/upsertMarkers`、`StickerArray`、`hydrateStickers`、`compatArticle/backfillContent`、`findAnchorEnd`、`base64urlEncode` 等接口在计划与文档中名称/签名/副作用不一致。

本轮是**收口轮**：文档必须写完整、契约必须与计划逐条映射，Reviewer 只按 P0/P1 拒绝（P2 及以下不影响合入）。

## 二、重构目标

1. 贴纸数据模型、标记格式、解析/渲染/序列化逻辑收敛到单一模块，消除跨文件重复实现。
2. 文章编辑器、全屏贴纸编辑器与阅读页共用同一套渲染核心，保证所见即所得。
3. 修复长期遗留的浮动渲染显示问题。
4. 保持既有文章与草稿数据完全兼容，任何迁移路径都不允许数据丢失。
5. 通过现有测试并补充必要的单元测试，同步更新相关文档。

## 三、前两轮失败报告强制修订要求（继续有效）

v2 已列出的全部要求（接口契约、安全、坐标与浮动数学、id 生成、渲染与性能、静态检查与测试）**本轮继续有效**，必须逐条满足，包括但不限于：

- `replaceMarkers` / `upsertMarker` / `createMarker` / `serializeOne` 行为与 JSDoc 对齐；
- model API：`getStickers/setStickers/addSticker/removeSticker/updateSticker`；
- `compatArticle` 仅返回归一化 stickers，content 回填由 `backfillContent`/`replaceMarkers` 在保存路径处理；
- `src` 白名单（http/https/data）与 MIME 白名单；SVG 采用方案 A（移除）或方案 B（清洗）二选一并显式声明；
- 坐标模型：`x` 为左边缘相对容器左侧百分比；`align:right` 使用 `margin-right: calc(${(100 - x)}% - ${displayW}px)` 并给出推导；
- id 生成：`crypto.getRandomValues(new Uint8Array(16))` + base64url，熵 ≥128 bit；
- IntersectionObserver：`rootMargin: '200px 0px'`、`threshold: 0`、支持 `root` 选项；
- 性能验收：主流桌面 50 张贴纸 p95 ≤16ms + 基准报告；
- ESLint 自定义规则 `no-inline-sticker-regexp` 并扫描全仓库；
- 50 张贴纸性能基准、SVG 注入测试、`StickerSerializeError` 测试、round-trip 测试等。

## 四、第三轮失败报告强制修订要求（本轮新增，必须满足）

以下条目全部来自第三轮 3 次 Review，是**硬性要求**；任何一条缺失都会导致本轮再次进入暂存区。

### 4.1 文档必须写完整（禁止占位）

- 文档必须完整输出全部章节（§1 背景/目标 → §2 总体架构 → §3 模块规格 → §4 数据模型与标记格式 → §5 渲染与坐标 → §6 安全策略 → §7 测试策略 → §8 性能基准 → §9 里程碑与交付物 → §10 附录/参考），**不允许“待补充/TBD/略/后续再写”等占位内容**。
- §3.5 及后续所有章节必须完整：`hydrateStickers`、`StickerArray`、`sticker-renderer.js` 坐标与性能、ESLint 规则、错误事件、SVG 降级策略等都必须有完整规格，而不是只出现在 Reviewer 意见里。
- 所有公开函数必须有完整 JSDoc：签名、参数说明、返回值、副作用、异常（如 `StickerSerializeError`）、幂等性。

### 4.2 契约必须与计划逐条映射（本轮重点）

- 交付物必须包含一张**《契约映射表》**：以表格列出计划（Planner 的 milestones/architecture）中出现的每一个模块、函数、常量、事件、文件，与文档中的对应章节/签名一一映射；没有对应项视为缺失。
- 同一接口在计划与文档中**必须同名、同签名、同语义**；存在差异必须二选一并同步修改计划与文档，禁止含糊。
- 明确以下命名决策（二选一并在文档中写死）：
  - `upsertMarker` 与 `upsertMarkers`：拆分为两个函数，或保留单一重载并明确“批量中同一 id 以最后一次为准”；
  - 纯数组工具函数：在 `sticker-model.js` 内以 `StickerArray` 命名空间导出（如 `StickerArray.upsert/remove/update`），或明确放弃命名空间并给出理由；
  - `image/jpg` 与 `image/jpeg`：按 RFC 标准只允许 `image/jpeg` 并在计划/文档/测试三处同步，或明确放行 jpg 并同步白名单正则。
- 里程碑必须与计划中的 M0–M4 一一映射：文档的每个里程碑需列出**交付物清单**（模块文件、测试文件、文档章节、扫描报告），与计划 milestones 逐条对应。

### 4.3 第三轮 P1 逐条落地

1. `hydrateStickers(article)`：定义该工具函数（内部执行 `setStickers(article, resolveStickers(article))`），并明确在编辑初始化/读取路径中强制调用的时机；或在文档中显式要求调用方在读取后自行 `setStickers`，否则视为未初始化。
2. `findAnchorEnd`：补全状态机与回退契约——锚点在注释/标签内时回退到末尾并记录 warning；锚点不存在时回退到末尾；`content` 为空时返回 index 0；给出伪代码。
3. `ReplaceOptions.append=false && !markerAnchor`：必须显式抛出 `StickerSerializeError('markerAnchor', 'append=false 时必须提供有效 anchor')`，禁止静默错误。
4. 右对齐 `width` 缺失降级：优先 `naturalWidth` → `options.defaultWidth` → 触发 `onError` 并使用最小占位宽度，确保 `calc()` 始终合法。
5. SVG 降级策略不得删除旧数据：明确方案 A 拒绝 SVG 时对既有含 SVG 数据只降级展示、不写回/不删除。
6. `sticker-security.js`：显式保留 `new URL(src)` 校验逻辑，并补充 `javascript:` / `blob:` / `vbscript:` 拒绝测试。
7. `sticker-id.js`：示例中内联或引用 `base64urlEncode` 完整实现，避免实现阶段出现未定义函数。
8. 分层结构/模块索引：补充 `event-constants.js` 与 `ui-strings.js` 的职责说明（事件常量与 UI 文案统一管理）。
9. §3.4 补充 wrapper DOM 结构示意图与 `clear: both` 插入伪代码；§3.5 增加键盘与可访问性要求，或为 `Sticker` 模型增加可选 `alt` 字段并序列化为标记属性。
10. M2 里程碑测试清单增加 id 生成唯一性测试（注入 mock `crypto` 模拟冲突与正常场景）。

## 五、合入标准（Reviewer 执行口径）

- **只允许 P0/P1 导致拒绝**：P0（数据丢失、安全漏洞、核心功能不可用）、P1（明确功能缺陷、接口契约错误、会导致返工的问题）不允许存在；
- **P2 及以下不影响合入**：样式细节、体验优化、文档措辞、低风险建议可存在，必须在 issues/suggestions 中记录，但不得作为 `approved=false` 的理由；
- 若 `approved=false`，feedback 必须只列 P0/P1 且给出具体可执行修改意见。

## 六、验收标准

1. 文档全部章节完整，无占位内容；《契约映射表》覆盖计划与文档全部接口。
2. 第三轮 4.1–4.3 的每一条都能在文档/代码/测试中找到对应实现，无遗漏、无自相矛盾。
3. 所有既有贴纸数据（新旧标记、含 `stickers` 字段/仅 content 标记）在阅读页与编辑器中正确渲染，无数据丢失。
4. 编辑态与阅读态贴纸显示一致，“贴纸浮动渲染显示”WIP 关闭。
5. 全仓库不存在重复的贴纸正则、解析或渲染实现；`no-inline-sticker-regexp` 扫描 0 命中。
6. `npm run test`、`npm run build` 通过；Vitest 覆盖解析、序列化、状态同步、新旧兼容、安全注入、`StickerSerializeError`、SVG 清洗/拒绝、id 唯一性等。
7. 更新 `my_first_crew/knowledge/docs/development/sticker-editor.md`、`module-index.md`、`roadmap.md`，并按 `version-manage.md` 同步版本号与更新日志。
8. 交付物包含：完整重构方案（架构/文件清单/迁移策略/《契约映射表》）、完整代码或补丁、测试与验证结果、性能基准报告、ESLint 扫描报告、文档更新清单。

## 七、明确不做（非目标）

- 不引入 Vue/React 等前端框架，不改变项目整体技术栈。
- 不改变贴纸上传、存储、贴纸库的现有后端接口，除非重构确实需要且能证明收益。
- 不改变文章编辑器与阅读页的其他功能（标题、目录、水印、主题等）。
- 不实现贴纸图层、组合、动画、多选等新功能；本次只做重构与既有功能稳定化。

## 八、参考文档

- 第三轮失败报告：`my_first_crew/output/staging/20260827213702/failure_report.md`
- 第三轮设计文档：`my_first_crew/output/flow_state/20260827213702-document.md`
- 第二轮失败报告：`my_first_crew/output/staging/20260825232625/failure_report.md`
- `my_first_crew/knowledge/docs/development/sticker-editor.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-audit.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p0-remains.md`
- `my_first_crew/knowledge/docs/ai-collaboration/editor-sticker-p1-remains.md`
- `my_first_crew/knowledge/docs/development/code-style.md`
- `my_first_crew/knowledge/docs/development/module-index.md`
- `my_first_crew/knowledge/docs/roadmap.md`
