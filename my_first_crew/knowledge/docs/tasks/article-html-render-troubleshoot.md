# 文章正文 HTML 不渲染（文本按格式排列）排查（第四轮，Flow 临时：质量审查不阻塞）

> 任务类型：正文 HTML 渲染根因排查 + 修复方案产出
> 提交方式：作为 RFC-001 Flow 的 `requirement` 输入
> 说明：本轮 Flow 通过环境变量 `CREW_REVIEWER_BLOCK_DISABLED=1` 临时禁用 Reviewer 禁止合入权限。

---

## 问题现象

- 贴纸已能正确渲染且位置正确（absolute 定位），控制台**无任何报错和警告**。
- 文章正文的**文本按照格式排列但不渲染**：文字按换行/顺序排布，但 HTML 标签（`<p>`、`<div>`、`<img>` 等）没有真正生效，正文看起来像“按格式排列的纯文本”，标签内容未按 HTML 结构渲染。
- 阅读页与编辑器界面均受影响。

## 已知链路与既有日志

```
detail.js:227 [UIDetail.renderContent] input len=4477 | stickerMarkers=1 | head80="<!--sticker:... x=617 y=359 w=120 h=120 align=left margin="
markdown-utils.js:48 [MarkdownUtils.toHTML] _isLikelyHtml: true | len: 4477 | head80: "<!--sticker:... ..."
markdown-utils.js:54 [MarkdownUtils.toHTML] HTML 内容，直接返回，保留注释
detail.js:231 [UIDetail.renderContent] output len=4477 | head80="<!--sticker:... ..."
```

- `renderContent` input/output 长度相同（4477）→ `toHTML` 直接返回原始 HTML。
- 之后该 HTML 字符串被注入 `pane.innerHTML`（`detail-body`）。
- 贴纸注释节点被 `renderInArticle` 通过 TreeWalker 找到并替换为贴纸元素（已正常）。

## 排查方向

请 Coder 定位“正文 HTML 未渲染”的根因，重点覆盖：

### 方向 A：detail-body 内容注入
1. `renderContent` 返回的 HTML 字符串是通过 `pane.innerHTML = ...` 注入的，浏览器应解析为 DOM。确认注入后 `.detail-body` 内部是否为真实 HTML 元素（`<p>`、`<div>` 等），还是被当成文本节点/转义实体。
2. 是否在注入前有 `Utils.escapeHtml` / `textContent` / `createTextNode` 二次处理，导致 `<p>` 变成 `&lt;p&gt;` 文本。
3. `.detail-body` 的 CSS（如 `white-space`、`display`、`font-family`）是否让 HTML 看起来“像纯文本”。

### 方向 B：`_isLikelyHtml` 判定
1. 最近已将 `_isLikelyHtml` 改为通用注释检测 `/<!--[\s\S]*-->/`。确认对“以贴纸注释开头 + 正文 HTML”的内容返回 `true`（日志已显示 true）。
2. 若正文内容**不含贴纸注释**（普通文章），`_isLikelyHtml` 对标准 HTML（`<p>`、`<h1>`、`<img>` 等）是否返回 `true`？若返回 `false` 会走 `escapeHtml` 把标签转义成文本——这是最可能的根因。
3. 检查 `_isLikelyHtml` 的标签匹配正则是否过于严格（例如要求同时有开/闭标签、或 `trimmed` 起始必须是标签）。

### 方向 C：编辑器 html/text 模式
1. 编辑器 `_applyRenderMode`：html 模式 `innerHTML = EditorContent.renderContent(content)`；text 模式 `textContent = content`。
2. 确认 html 模式下正文标签是否被渲染；text 模式是否把 `<p>` 等当源码文本显示（这是预期还是异常）。
3. `_captureContent` / `_buildSaveContent` 在模式切换时是否把 HTML 转义或还原。

### 方向 D：其他渲染入口
1. `articles.js` 卡片预览 `MarkdownUtils.toHTML(stripMarkers(...))` → `truncateHtml(...)` → innerHTML，确认预览与详情是否都受影响。
2. `utils/dom.js` 的 `escapeHtml` 实现：是否会把 `<`、`>`、`&` 转义；被谁调用。

## 输出要求

- 每个方向的根因（精确到文件/函数/行 + 输入输出样例）。
- 修复补丁（diff 或完整函数）。
- 浏览器控制台验证命令（输入什么、观察什么 DOM 属性：`childNodes` 类型、`innerHTML`、`textContent`）。
- 若根因在 `_isLikelyHtml`，给出对“含贴纸注释 + HTML”“纯 HTML”“纯文本”三类输入的判定矩阵。

## 参考文件

- `js/utils/markdown-utils.js`（`toHTML` / `_isLikelyHtml`）
- `js/utils/dom.js`（`escapeHtml`）
- `js/ui/components/detail.js`（`renderContent` / pane.innerHTML 注入）
- `js/ui/components/articles.js`（卡片预览 `MarkdownUtils.toHTML` / `truncateHtml`）
- `js/editor/editor-content.js`（`renderContent` / `getContentHTML` / `buildSaveContent`）
- `js/editor/article-editor-mode.js`（`_applyRenderMode` html/text）
- `css/` 中 `.detail-body` 相关样式
