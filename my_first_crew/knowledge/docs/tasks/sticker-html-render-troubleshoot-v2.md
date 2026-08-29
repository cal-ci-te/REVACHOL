# 贴纸位置偏差与 HTML 标签渲染问题排查（第二轮，Flow 临时：质量审查不阻塞）

> 任务类型：渲染问题根因排查 + 修复方案产出
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入
> 说明：本轮 Flow 通过环境变量 `CREW_REVIEWER_BLOCK_DISABLED=1` 临时禁用 Reviewer 禁止合入权限，仅作为质量审查记录 issues/suggestions。

---

## 问题现象（第二轮）

贴纸**已经能创建 DOM 元素**（120×120、float:left、background-image 已加载），但仍有：

1. **贴纸实际位置与放置位置不符**：
   - 标记/编辑器放置坐标：`x=617 y=359`
   - 阅读页渲染后：`rect.left=53 rect.top=150`
2. **HTML 标签在文章阅读和编辑界面的渲染仍然不正确**（具体表现：HTML 结构/标签显示异常）。

## 最新控制台日志

```
detail.js:528 [UIDetail._parseStickerMarkers] 解析字段: decoId=deco_1784802853547_wjre0p | x=617 y=359 | w=120 h=120 | align=left margin=20 | anchor={"type":"paragraph","index":0,"paragraphId":"p_0","direction":"before"}
detail.js:484 [UIDetail._renderStickersForArticle] sticker[0]: decoId=deco_1784802853547_wjre0p | w=120 h=120 | align=left margin=20 x=617 y=359
detail.js:510 [UIDetail._renderStickersForArticle] bodyEl 中注释节点总数: 1
sticker-renderer.js:238 [StickerRenderer.renderInArticle] TreeWalker 找到 1 个注释节点 | stickerMap keys=deco_1784802853547_wjre0p
sticker-renderer.js:239 [StickerRenderer.renderInArticle] 注释节点 DOM 顺序: deco_1784802853547_wjre0p@idx0
sticker-renderer.js:264 [StickerRenderer.renderInArticle] deco=deco_1784802853547_wjre0p | name=1 | hasDataUrl=true | hasUrl=false | sticker.keys=decoId,x,y,width,height,w,h,align,margin,pos,anchor
sticker-renderer.js:272 [StickerRenderer.renderInArticle] 创建元素: tagName=DIV | className=article-sticker | imgSrc前40=/api/decos/deco_1784802853547_wjre0p/ima
sticker-renderer.js:288 [StickerRenderer.renderInArticle] replaceChild 完成: parentNode=DIV.detail-body | offsetWidth=120 offsetHeight=120 | compWidth=120px compHeight=120px | compFloat=left compDisplay=block | compBackground=url("http://localhost:3000/api/decos/deco_17848028 | rect.top=150 rect.left=53
```

## 已确认的链路状态

- `markdown-utils.toHTML`：`_isLikelyHtml=true` → 直接返回原始 HTML，保留注释节点（**正常**）。
- `renderInArticle`：TreeWalker 找到注释 → `stripStickerPrefix` 后 `decoId` 命中 stickerMap → `DecoShelf.get` 命中 → `_createStickerElement` 成功创建元素 → `replaceChild` 成功（**贴纸元素已进入 DOM**）。
- 元素计算样式：`width=120px height=120px float=left display=block background-image=url("http://localhost:3000/api/decos/...")`（**元素可见**）。

## 需要排查的关键问题

### 问题 A：阅读页浮动布局与编辑器绝对坐标不一致（位置偏差）

- 编辑器/标记中的 `x=617 y=359` 是**绝对坐标**（编辑器覆盖层 left/top px）。
- 阅读页当前用 **float + margin** 布局（`renderSticker` 浮动模式），`x` 被当作百分比 clamp 后生成 `margin-left`。
- 结果：`rect.left=53` 与放置坐标 `617` 差异巨大。
- 需要 Coder 给出**三端所见即所得**的方案：
  - 阅读页是否应改用**绝对定位/百分比定位**复现编辑器坐标？还是保留浮动绕排但定义“位置”语义（如贴纸相对所在段落的位置）？
  - 若保留浮动，应明确 `x/y` 在阅读页的语义与映射公式，避免用户误解。
  - 若改为绝对定位，需处理文字绕排、多贴纸重叠、resize clamp。

### 问题 B：HTML 标签在阅读/编辑界面渲染不正确

- 文章内容是 HTML（`_isLikelyHtml=true` 直接返回）。
- 需要排查：HTML 标签（`<p>`、`<div>`、`<img>`、`<span>` 等）在阅读页/编辑器中的渲染管线：
  - `detail.js renderContent` → `markdown-utils.toHTML` → 注入 `.detail-body` 之间是否有 DOMPurify / sanitize / innerHTML 处理，是否破坏标签结构？
  - 编辑器（html/text 双模式）读取 HTML 时是否把标签当文本或转义？
  - 贴纸注释在 HTML 中被渲染成什么（注释节点？文本？被 sanitizer 移除？）。

## 排查要求

1. 给出**位置偏差的根因**（精确到函数/样式）与**三端位置语义统一方案**（含代码补丁）。
2. 给出 **HTML 标签渲染不正确**的根因（精确到渲染管线环节）与修复补丁。
3. 若 `containerWidth` 在 rAF 时仍为 0/不正确，定位并修复宽度传递。
4. 输出浏览器控制台验证步骤（应观察哪些日志/元素属性）。

## 参考代码

- `js/ui/components/detail.js`（renderContent / _renderStickersForArticle / _parseStickerMarkers）
- `js/editor/sticker-renderer.js`（renderInArticle / _createStickerElement / reclampAll / observeResize）
- `js/business/sticker/renderer/sticker-renderer.js`（renderSticker 浮动/absolute 模式、clampX、reClamp）
- `js/utils/markdown-utils.js`（toHTML / _isLikelyHtml）
- `js/editor/` 相关编辑器渲染（html/text 模式）
- `css/` 中 `.detail-body` / `.article-sticker` 样式
