# HTML 标签渲染问题排查（第三轮，Flow 临时：质量审查不阻塞）

> 任务类型：HTML 渲染管线的根因排查 + 修复方案产出
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入
> 说明：本轮 Flow 通过环境变量 `CREW_REVIEWER_BLOCK_DISABLED=1` 临时禁用 Reviewer 禁止合入权限。

---

## 背景

贴纸重构 M1-M4、8 项 P1 修复、阅读页绝对定位 coordinate 修复已完成（贴纸位置已正确）。但文章和编辑器中 **HTML 标签的渲染仍然不正确**。

## 已知链路状态

- `markdown-utils.toHTML` 的 `_isLikelyHtml=true` 时直接返回原始 HTML（不转义），注释节点保留（**正常**）。
- 项目未使用 DOMPurify 库；前端通过 `Utils.escapeHtml` 手动转义 + innerHTML 注入。
- 编辑器（`editor-content.js`）的 `toDOMContent`/`buildSaveContent` 在 html/text 模式切换时处理贴纸标记。

## 控制台日志（无异常）

```
detail.js:227 [UIDetail.renderContent] input len=4477 | stickerMarkers=1 | head80="<!--sticker:deco_1784802853547_wjre0p x=617 y=359 w=120 h=120 align=left margin="
markdown-utils.js:48 [MarkdownUtils.toHTML] _isLikelyHtml: true | len: 4477 | head80: "<!--sticker:deco_1784802853547_wjre0p x=617 y=359 w=120 h=120 align=left margin="
markdown-utils.js:54 [MarkdownUtils.toHTML] HTML 内容，直接返回，保留注释
detail.js:231 [UIDetail.renderContent] output len=4477 | head80="<!--sticker:deco_1784802853547_wjre0p x=617 y=359 w=120 h=120 align=left margin="
```

注意：input 和 output 长度相同（4477），说明 toHTML 未做任何修改。注入 innerHTML 后浏览器解析 HTML。

## 排查要求

请 Coder 深入排查以下方向，输出根因报告与修复方案：

### 方向 A：文章阅读页 HTML 渲染

1. `renderContent` 返回的 HTML 字符串 → innerHTML 注入 `.detail-body`。浏览器解析时，HTML 标签（`<p>`、`<div>`、`<img>` 等）是否正常？哪些标签显示异常？
2. CSS（`@media`、`display`、`overflow`）是否隐藏了某些 HTML 标签？
3. 注入时是否经过 `Utils.escapeHtml` 二次转义？`escapeHtml` 的实现是否将 `<` 转义为 `&lt;`？
4. 贴纸注释 `<!-- sticker:... -->` 在 DOM 中是以 `Node.COMMENT_NODE` 还是以文本节点存在？

### 方向 B：编辑器 html/text 模式

1. `editor-content.js` 的 `toDOMContent`（text→html 模式）和 `buildSaveContent`（html→text 模式）对贴纸标记的处理：
   - html 模式下，贴纸标记是否被替换为 `span.sticker-placeholder` 或保留为注释？
   - text 模式下，贴纸标记是否被转义为 `&lt;!-- sticker:... --&gt;` 文本而非保留为注释？
   - 模式切换时，贴纸标记是“丢失”/“重复”/“被转义”？
2. `Utils.escapeHtml` 是否在 text 模式下被调用，导致 `<!--` 转义为 `&lt;!--`？

### 方向 C：`Utils.escapeHtml` 与 `_isLikelyHtml` 联动

1. 非 HTML 内容走 `escapeHtml` 流程时，`<!-- sticker:... -->` 是否被当成纯文本转义？
2. `_isLikelyHtml` 的判断分支是否覆盖了“内容以贴纸注释开头但无其他 HTML 标签”的场景（如纯贴纸占位符的文章）？

## 输出要求

- 每个方向的根因（精确到函数/行）
- 修复补丁（diff 或完整函数）
- 浏览器控制台验证步骤（F12 输入什么命令、观察什么属性）

## 参考文件

- `js/utils/markdown-utils.js`（toHTML / _isLikelyHtml）
- `js/utils.js`（escapeHtml 工具函数）
- `js/ui/components/detail.js`（renderContent / _renderStickersForArticle）
- `js/editor/editor-content.js`（toDOMContent / buildSaveContent / parseStickersFromContent）
- `js/editor/content-builder.js`（build）
- `js/editor/sticker-renderer.js`（_createStickerElement / renderInArticle）