# 贴纸 HTML 标签渲染问题排查（Flow 临时：质量审查不阻塞）

> 任务类型：渲染问题根因排查 + 修复方案产出
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入
> 说明：本轮 Flow 通过环境变量 `CREW_REVIEWER_BLOCK_DISABLED=1` 临时禁用 Reviewer 禁止合入权限，仅作为质量审查记录 issues/suggestions。

---

## 问题现象

阅读页（/detail.html）中**贴纸 HTML 标签没有渲染，贴纸仍然不可见**。编辑器与全屏贴纸编辑器同样受影响（共用渲染核心）。

## 控制台日志（用户提供）

```
detail.js:227 [UIDetail.renderContent] input len=4477 | stickerMarkers=1 | head80="<!--sticker:deco_1784802853547_wjre0p x=372 y=356 w=120 h=120 align=left margin="
markdown-utils.js:48 [MarkdownUtils.toHTML] _isLikelyHtml: true | len: 4477 | head80: "<!--sticker:deco_1784802853547_wjre0p x=372 y=356 w=120 h=120 align=left margin="
markdown-utils.js:54 [MarkdownUtils.toHTML] HTML 内容，直接返回，保留注释
detail.js:526 [UIDetail._parseStickerMarkers] 匹配到标记: index=0 | raw=<!--sticker:deco_1784802853547_wjre0p x=372 y=356 w=120 h=120 align=left margin=
detail.js:528 [UIDetail._parseStickerMarkers] 解析字段: decoId=deco_1784802853547_wjre0p | x=372 y=356 | w=120 h=120 | align=left shape=undefined vertices=undefined margin=20 | anchor={"type":"paragraph","index":0,"paragraphId":"p_0","direction":"before"}
detail.js:481 [UIDetail._renderStickersForArticle] 从 content 解析到 1 张贴纸
detail.js:484 [UIDetail._renderStickersForArticle] sticker[0]: decoId=deco_1784802853547_wjre0p | w=120 h=120 | align=left shape=undefined vertices=undefined | margin=20 x=372 y=356
detail.js:496 [UIDetail._renderStickersForArticle] 开始渲染 1 张贴纸
detail.js:501 [UIDetail._renderStickersForArticle] bodyEl=DIV.detail-body | childNodes=3
detail.js:510 [UIDetail._renderStickersForArticle] bodyEl 中注释节点总数: 1
sticker-renderer.js:190 [StickerRenderer.renderInArticle] 开始：stickers.length=1
sticker-renderer.js:218 [StickerRenderer.renderInArticle] TreeWalker 找到 1 个注释节点 | stickerMap keys=deco_1784802853547_wjre0p
sticker-renderer.js:219 [StickerRenderer.renderInArticle] 注释节点 DOM 顺序: sticker:deco_1784802853547_wjre0p@idx?
```

关键观察：
1. 标记被正确解析（decoId、x/y/w/h、anchor 均正确）。
2. `renderInArticle` TreeWalker 找到 1 个注释节点。
3. **上一版代码**：注释 nodeValue 含 `sticker:` 前缀，`parseMarkerFields` 直接解析导致 `id = "sticker:deco_..."`，与 `stickerMap` key（`deco_...`）不匹配 → 贴纸被跳过不渲染。
4. **已修复**：`stripStickerPrefix` 剥离前缀后应能匹配。但仍需排查是否还有**其他断点**导致贴纸/HTML 标签不渲染。

## 已完成的贴纸重构（M1-M4）上下文

- 新增 `js/business/sticker/`：StickerFacade（唯一入口）+ parser/serializer/model/renderer/security 内部模块
- `js/editor/sticker-renderer.js` 已收敛：
  - `_MARKER_REGEX` 引用 `facade.markerRegex`
  - `stripStickerPrefix(text)` 剥离注释 `sticker:` 前缀（非正则，避免 ESLint 冲突）
  - `_createStickerElement` → `facade.renderSticker({...sticker, src}, {containerWidth:0})`（阅读页浮动）
  - `_createEditorStickerElement` → `facade.renderSticker(..., {mode:'absolute'})`（编辑器覆盖层）
  - `renderInArticle`：TreeWalker 找注释 → 匹配 stickerMap → DecoShelf.get(id) → 替换为贴纸元素 → clearfix → observeResize
  - `reclampAll` / `observeResize`（ResizeObserver + window resize 回退）
- `sticker-facade.js`：`renderSticker` 先 `assertSafeStickerData`，再对 `data:image/svg+xml` 调 `sanitizeSvgDataUrl`
- 全量 413 测试通过、ESLint 0 errors、`npm run build` 通过

## 排查要求

请 Coder 深入排查“贴纸 HTML 标签未渲染/不可见”的根因，输出排查报告与修复方案（含代码补丁），重点覆盖：

1. **renderInArticle 断点**：`stripStickerPrefix` 后 `parseMarkerFields` 是否真的能得到 `decoId`；`stickerMap[f.id]` 是否命中；`DecoShelf.get(decoId)` 是否返回非空。
2. **元素替换**：`comment.parentNode.replaceChild(el, comment)` 是否成功；替换后的 `.article-sticker` 元素是否进入 DOM；元素是否因 `containerWidth:0` 导致 `margin` 未设置/尺寸为零而不可见。
3. **Markdown/HTML 链路**：`markdown-utils.js` 判定 `_isLikelyHtml: true` 直接返回 HTML 并“保留注释”——确认注释节点确实进入 DOM（而非被 Markdown 转义成文本）。
4. **security 断言**：`assertSafeStickerData` 是否对某些 `dataUrl`/`url` 抛异常导致 `_createStickerElement` 回退旧实现（回退是否仍能显示）。
5. **CSS 可见性**：`.article-sticker` 的 CSS（float/width/height/background-image）是否可能被容器样式（如 `overflow:hidden`、父级 `display`）隐藏；`background-image:url("...")` 转义后是否合法。
6. **三端一致性**：阅读页、文章编辑器、全屏贴纸编辑器是否都可能受影响。

## 输出格式

- 根因分析（定位到具体文件/函数/行）
- 修复方案：精确代码补丁（diff 或完整函数）
- 验证步骤：浏览器控制台检查项 + 单元测试
- 若需补充日志埋点，给出埋点位置

## 参考代码位置

- `js/ui/components/detail.js`（`_renderStickersForArticle` / `_parseStickerMarkers`）
- `js/editor/sticker-renderer.js`（`renderInArticle` / `_createStickerElement` / `stripStickerPrefix` / `reclampAll` / `observeResize`）
- `js/business/sticker/sticker-facade.js`（`renderSticker`）
- `js/business/sticker/renderer/sticker-renderer.js`（`renderSticker` / `clampX`）
- `js/business/sticker/security/security-utils.js`（`assertSafeStickerData` / `sanitizeSvgDataUrl` / `escapeCssUrl`）
- `js/utils/markdown-utils.js`（`toHTML` / `_isLikelyHtml`）
- `css/` 中 `.article-sticker` 相关样式
