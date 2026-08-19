# 文章编辑模块与贴纸系统 — 全量检查报告

> 检查日期：2026-08-05 | 项目版本：v1.18.1 | 检查范围：js/editor/ + js/services/deco* + js/utils/shape-generator.js

---

## 执行摘要

- **检查日期**：2026-08-05
- **检查范围**：文章编辑模块（3 文件，~1400 行）、贴纸编辑系统（4 文件，~1500 行）、贴纸数据层（DecoShelf + DecoRepository，~1070 行）、CSS（3 文件，~370 行）
- **总体评价**：⚠️ 需关注 — 存在 **2 个 P0 严重问题 + 5 个 P1 重要问题**
- **关键发现**：
  1. **P0**：贴纸编辑保存时 `align` 方向数据丢失（`_collectStickerData` 硬编码 `align: 'left'`）
  2. **P0**：从内容标记解析贴纸时位置（x/y）无法恢复，每次刷新后贴纸回到默认位置
  3. **P1**：文章贴纸数据双源（`article.stickers` ↔ `content` 标记），存在同步断裂风险
  4. **P1**：三处独立实现贴纸标记正则，维护成本高
  5. **P1**：`ShapeGenerator` 无缓存，每次调用重新计算 16 边形顶点

---

## 一、文章编辑模块检查结果

### 1.1 模块职责分析

| 模块 | 文件 | 行数 | 核心职责 | 额外职责（问题） |
|:---|:---|:--:|:---|:---|
| ArticleEditorMode | `article-editor-mode.js` | 922 | 全屏模态编辑器入口 + 生命周期 + 保存/发布 | ⚠️ 内含贴纸渲染 + 拖拽 + 右键菜单（~130 行），应归属贴纸模块 |
| ArticleEditorToolbar | `article-editor-toolbar.js` | 209 | 悬浮工具栏（按钮 + 标题输入） | ✅ 职责单一 |
| DraftManager | `draft-manager.js` | 311 | 草稿历史面板 | ✅ 职责单一 |

**发现**：`ArticleEditorMode` 承担了三个模块的职责——编辑器生命周期、Markdown 渲染、贴纸交互（`_renderExistingStickers`、`_bindEditorStickerDrag`、`_showEditorStickerMenu`）。这是 Phase 1 "代码杂糅未做拆分"的核心表现。

### 1.2 状态一致性

| 状态 | 来源 | 更新时机 | 风险 |
|:---|:---|:---|:---|
| `_article` | `ArticleService.getAllArticles().find()` | `open()` 赋值，`close()` 清空 | ✅ |
| `_dirty` | 手动标记 | `_inputHandler`、`setTitle`、拖拽、贴纸变更 | ✅ |
| `_snapshot` | `{ title, content }` | `open()` 快照，`saveDraft()`/`saveAndPublish()` 更新 | ⚠️ 快照仅含 title+content，不含 stickers — 贴纸修改不触发 `hasChanges()` 为 true |

**问题 1（P1）**：`_snapshot` 不包含 `stickers` 字段。用户只修改贴纸（不改标题/内容）时，`hasChanges()` 返回 `false`，ESC 退出不弹确认对话框，修改静默丢失。

**严重程度**：P1
**影响范围**：仅修改贴纸后未保存的场景
**修改方向**：`_snapshot` 扩展为 `{ title, content, stickers }`，`hasChanges()` 增加贴纸对比逻辑
**涉及文件**：`article-editor-mode.js`（open/snapshot/hasChanges）
**预期工作量**：小（<2h）

### 1.3 生命周期管理

| 阶段 | 操作 | 清理项 | 完备性 |
|:---|:---|:---|:---|
| `open()` | 创建 overlay + article + toolbar + draftManager | — | ✅ |
| `close(save)` | 可选保存 → cleanup | overlay、toolbar、draftManager、事件监听器、overflow | ✅ |
| `_cleanup()` | 逐一移除 DOM + 取消事件绑定 | escHandler、inputHandler、pasteHandler、右键菜单、overlay、toolbar、draftManager | ✅ |

**评估**：生命周期管理完整，无已知资源泄漏。

### 1.4 键盘快捷键

| 快捷键 | 作用 | 实现位置 | 状态 |
|:---|:---|:---|:---|
| `Ctrl+E`（主页面） | 打开编辑器 | `js/app.js` L342-352 | ✅ 带输入框保护 |
| `Escape` | 关闭（带未保存确认） | `_bindKeys()` L554-565 | ✅ |
| `Ctrl+S` | 保存草稿 | `_bindKeys()` L568-571 | ✅ |
| `Ctrl+Enter` | 发布 | `_bindKeys()` L574-577 | ✅ |

### 1.5 错误处理

| 场景 | 处理方式 | 评估 |
|:---|:---|:---|
| 文章不存在 | `open()` 中 `Utils.showToast('文章不存在')` | ✅ |
| 草稿保存失败 | catch 后 `Utils.showToast(...)` | ✅ |
| 发布失败 | catch 后 `Utils.showToast(...)` | ✅ |
| 草稿列表加载失败 | DraftManager 显示"加载失败" | ✅ |
| 草稿删除失败 | DraftManager 显示错误 toast | ✅ |
| `getContentHTML()` 时 _contentEl 为 null | 返回 `''` | ✅ |
| 贴纸编辑 → API 同步失败 | catch 静默，仅 log | ⚠️ 无用户提示 |

**问题 2（P2）**：`_openStickers()` 中贴纸同步到后端的 API 调用失败时（L830-840）静默处理，用户不知道数据未保存到服务器。

**严重程度**：P2
**修改方向**：catch 中加入 `Utils.showToast` 提示
**涉及文件**：`article-editor-mode.js` L838-840
**预期工作量**：小（<0.5h）

---

## 二、贴纸系统检查结果

### 2.1 贴纸来源追踪

```
贴纸图片上传
  │
  ▼
DecoShelf.upload(file, name)
  ├── Canvas 压缩为 WebP（quality 0.6）
  ├── 生成临时 ID: 'deco_{timestamp}_{random}'
  └── DecoRepository.save(item)
        │
        ▼
      _postToServer(item)
        ├── POST /api/decos { name, base64 }
        ├── 后端: Buffer.from(base64) → storage.upload() → SQLite INSERT
        └── 返回: { id, dataUrl: '/api/decos/{id}/image' }
              │
              ▼
            _cache.push({ id, name, dataUrl, position: null, style: 'fixed' })
            _syncToStorage() → localStorage('deco_library')

贴纸数据读取
  │
  ▼
DecoShelf.get(decoId) / DecoShelf.getAll()
  │
  ▼
DecoRepository.get(id) / getAll()
  ├── 返回 _cache（内存，首次从 localStorage 加载）
  └── dataUrl: '/api/decos/{id}/image'（图片路由，非 base64）
```

### 2.2 贴纸存储方式

| 存储层 | 位置 | 数据格式 | 用途 |
|:---|:---|:---|:---|
| **图片文件** | `backend/uploads/decos/`（本地）或 S3 Bucket（RustFS） | WebP 二进制 | 贴纸图片本体 |
| **元数据** | SQLite `decos` 表 | `{ id, name, position(JSON), style, image_path }` | 服务端权威数据 |
| **前端缓存** | `localStorage['deco_library']` | `Array<{id, name, position, style, ...}>`（不含 dataUrl） | 离线/快速加载 |
| **内存缓存** | `DecoRepository._cache` | `Array<{id, name, position, style, dataUrl}>`（含图片路由） | 运行时 |
| **失败队列** | `localStorage['deco_sync_fail_queue']` | `Array<id>` | 网络恢复后重试 PUT |

### 2.3 文章内贴纸数据流

```
文章数据（双源并存）
  ├── article.stickers: Array<{ decoId, x, y, width, height, align, margin, shape, vertices }>
  └── article.content: "...<!-- sticker:xxx align=left w=120 h=120 -->..."
```

**保存流程**：
```
StickerEditorMode._saveStickersToArticle()
  ├── _collectStickerData() → 从 DOM 收集位置 → _stickerData
  ├── article.stickers = JSON.parse(JSON.stringify(_stickerData))  ← 更新 stickers 字段
  ├── content.replace(_MARKER_REGEX, '')                           ← 清除旧标记
  ├── content += StickerRenderer.createMarker(s.decoId, s)         ← 追加新标记
  └── article.content = content.trim()
```

**恢复流程**：
```
ArticleEditorMode.open(articleId)
  ├── if (!article.stickers || !article.stickers.length)
  │     article.stickers = _parseStickersFromContent(article.content)
  │       └── ⚠️ 问题：x=50, y=50+idx*80（丢失了保存时的真实位置）
  └── 快照 snapshot = { title, content }（不含 stickers）
```

### 2.4 关键问题：P0 — 贴纸位置丢失

**问题 3（P0）**：`_parseStickersFromContent()` 和 `detail.js` 的 `_parseStickerMarkers()` 从内容标记解析贴纸时，位置（x/y）硬编码为 `(50, 50+idx*80)`，而非从标记中读取。

**根因**：贴纸标记格式 `<!-- sticker:xxx align=left w=120 h=120 -->` 中没有 x/y 字段。标记只记录了 `align`/`w`/`h`，位置信息仅在 `article.stickers` 数组中。

**影响**：
- 页面刷新后，如果 `article.stickers` 为空（后端只返回 content），贴纸位置回退到默认值
- 详情页阅读视图的贴纸位置不准确（`detail.js` `_parseStickerMarkers` 同样的问题）

**当前行为**：位置丢失，贴纸回到默认排列位置
**期望行为**：位置应从 `article.stickers` 字段恢复，content 标记仅作辅助

**严重程度**：P0
**修改方向**：
1. 标记格式增加 x/y 字段：`<!-- sticker:xxx x=200 y=300 w=120 h=120 align=left -->`
2. 或在解析时优先使用 `article.stickers`（当 stickers 字段可用时），content 标记仅作兜底
**涉及文件**：`article-editor-mode.js`（`_parseStickersFromContent`, `_buildSaveContent`）、`detail.js`（`_parseStickerMarkers`）、`sticker-renderer.js`（`createMarker`）
**预期工作量**：中（半天）

### 2.5 关键问题：P0 — align 方向丢失

**问题 4（P0）**：`StickerEditorMode._collectStickerData()`（L783-801）硬编码 `align: 'left'`，用户通过右键菜单切换的浮动方向在保存时丢失。

```javascript
// L794: 永远返回 'left'
align: 'left',
```

**影响**：
- 用户在贴纸编辑器中通过右键切换为 `right` 浮动后保存，方向未持久化
- 再次编辑时贴纸回到 `left` 浮动

**严重程度**：P0
**修改方向**：`_collectStickerData()` 中从元素的 `dataset.align` 或从 `_stickerData` 数组中读取实际 align 值
**涉及文件**：`sticker-editor-mode.js` L794
**预期工作量**：小（<1h）

### 2.6 16 边形文字绕排

| 检查项 | 状态 | 详情 |
|:---|:---:|:---|
| ShapeGenerator 正确生成 16 边形顶点 | ✅ | `circle()` 生成圆顶点，`_toCssPolygon()` 输出 `polygon(x1px y1px, ...)` |
| shape-outside 和 clip-path 正确应用 | ⚠️ | `StickerShape.buildFloatStyles` 生成 CSS，但**当前贴纸编辑模式未使用它**—贴纸以 `position:absolute` 渲染而非 `float` |
| 浮动方向切换 | ⚠️ | 右键菜单可切换 `stickerData.align`，但 DOM 贴纸使用 `position:absolute`，切换无视觉效果 |
| 多张贴纸无相互干扰 | ✅ | `suggestPosition()` 有重叠检测 + 向下偏移策略 |
| 形状生成缓存 | ❌ | 每次调用 `forSticker()` 重新计算 — **见问题 5** |

**问题 5（P1）**：`ShapeGenerator.forSticker()` 每次调用重新计算 16 边形顶点，无缓存。对于 16 边形来说计算量很小（一次循环），但频繁调用（每次渲染、每次 `_refreshConsoleGallery` 中不涉及但理论上可优化）。

**实际影响**：低（16 顶点 × 三角函数 ≈ 微秒级），但架构上缺乏缓存机制。
**严重程度**：P2
**修改方向**：在 `StickerShape` 层添加 `Map<shapeKey, result>` 缓存
**预期工作量**：小（<1h）

**问题 6（P1）**：贴纸编辑器中的贴纸使用 `position:absolute` 渲染（`sticker-editor-mode.js` L258-270），而 `StickerShape.buildFloatStyles()` 生成的是 `float` + `shape-outside` 样式。**编辑模式下的贴纸不使用 shape-outside 文字绕排**。这意味着用户在编辑器中看到的贴纸位置可能与阅读视图不一致。

**严重程度**：P1
**修改方向**：统一编辑和阅读模式的渲染方式 — 要么都用 absolute（阅读视图需要调整贴纸容器为 relative），要么编辑模式也使用 float + shape-outside
**预期工作量**：大（1-2 天）

---

## 三、系统融合检查结果（文章编辑 ↔ 贴纸编辑 ↔ 草稿）

### 3.1 入口/出口数据流

```
用户点击 Ctrl+E
  │
  ▼
ArticleEditorMode.open(articleId)
  ├── article = ArticleService.getAllArticles().find()
  ├── if no stickers: parse from content markers
  ├── snapshot = { title, content }（不含 stickers ⚠️）
  └── 创建 overlay + 渲染文章 + 贴纸层（只读）

用户点击「📌 贴纸」
  │
  ▼
ArticleEditorMode._openStickers()
  ├── saveDraft()（先保存当前草稿）
  ├── 构造 article = { id, title, content, stickers }
  ├── 监听 STICKER_EDITOR_SAVED + STICKER_EDITOR_CLOSED
  └── StickerEditorMode.open(article, cursorY)

用户在贴纸编辑器中调整 → 点击「✅ 确认」
  │
  ▼
StickerEditorMode.close(true)
  ├── _saveStickersToArticle()
  │     ├── _collectStickerData() → 从 DOM 收集（⚠️ align 丢失）
  │     ├── article.stickers = deepCopy(stickerData)
  │     ├── content 标记更新
  │     └── emit STICKER_EDITOR_SAVED { articleId, stickers }
  └── cleanup()

  ▼
ArticleEditorMode._openStickers 中的 onStickerSaved 回调
  ├── article.stickers = data.stickers
  ├── article.content 标记更新
  ├── _refreshStickerLayer()（清除旧贴纸 → 重新渲染）
  └── ApiClient.put() 持久化到后端

用户点击「🚀 发布」
  │
  ▼
ArticleEditorMode.saveAndPublish()
  ├── _buildSaveContent()
  │     ├── getContentHTML()
  │     ├── 清除旧标记
  │     ├── 从 article.stickers 生成新标记
  │     └── 拼接返回
  └── ApiClient.put('/api/articles/:id', { title, content, category })
```

### 3.2 数据流断裂点

**断裂点 1（P0）**：贴纸位置仅存在于 `article.stickers` 数组，content 标记不含 x/y → 刷新后 stickers 为空时位置丢失（见问题 3）

**断裂点 2（P1）**：`_snapshot` 不含 stickers → hasChanges 对贴纸修改不敏感（见问题 1）

**断裂点 3（P1）**：`DraftManager._restoreFromDraft()` 恢复草稿时只恢复 `title` + `content`，不恢复 `stickers`。如果草稿保存时 content 中包含贴纸标记，恢复后标记仍在 content 中，但 `article.stickers` 数组不会被填充，导致编辑模式中贴纸层不显示。

```javascript
// draft-manager.js L728-739
_restoreFromDraft(draft) {
    this._titleEl.textContent = draft.title;
    this._contentEl.innerHTML = this._renderContent(draft.content);  // 只恢复内容
    // ⚠️ 未恢复 draft.stickers 或从 content 重新解析 stickers
}
```

**严重程度**：P1
**修改方向**：`_restoreFromDraft` 中增加贴纸恢复：尝试从 `draft.stickers` 恢复，或调用 `_parseStickersFromContent(draft.content)` 重新解析
**涉及文件**：`article-editor-mode.js` L728-739、`draft-manager.js`
**预期工作量**：中（半天）

### 3.3 事件通信

| 事件 | 发送方 | 监听方 | 状态 |
|:---|:---|:---|:---|
| `EDITOR_OPENED` | ArticleEditorMode.open() | 全局 EventBus | ✅ |
| `EDITOR_CLOSED` | ArticleEditorMode.close() | 全局 EventBus | ✅ |
| `STICKER_EDITOR_OPENED` | StickerEditorMode.open() | 全局 EventBus | ✅ |
| `STICKER_EDITOR_CLOSED` | StickerEditorMode.close() | ArticleEditorMode._openStickers | ✅ |
| `STICKER_EDITOR_SAVED` | StickerEditorMode._saveStickersToArticle() | ArticleEditorMode._openStickers | ✅ |

**注意**：`STICKER_EDITOR_CLOSED` 事件的 `off` 清理在 `onStickerSaved`（L844-845）和 `onStickerClosed`（L849-850）中都有。但如果在 `onStickerSaved` 被调用后（已 `off`），`onStickerClosed` 中的 `off` 调用是冗余但无害的。

---

## 四、CSS 与主题检查结果

### 4.1 CSS 变量使用

| 文件 | 全部使用 `var(--color-*)` | 硬编码色值 | 评估 |
|:---|:---|:---|:---|
| `article-editor.css` | ✅ | 无 | 全部使用变量 + fallback |
| `sticker-editor.css` | ✅ | 无 | ✅ |
| `sticker-float.css` | 部分 | 三主题适配使用硬编码 `drop-shadow` | ⚠️ 三主题阴影值硬编码但合理 |

**问题 7（P2）**：`css/components/sticker-float.css` L82-94 中三个主题的 `drop-shadow` 值硬编码：
```css
[data-theme="dark"] .article-sticker { filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4)); }
```
这在当前三主题场景下无问题，但如果新增主题需要手动添加规则。

**严重程度**：P2（低优先）
**修改方向**：可抽象为主题 CSS 变量，但三主题当前已覆盖，不急

### 4.2 样式组织

| 项目 | 状态 |
|:---|:---:|
| 编辑模式样式在 `css/editor/` 下 | ✅ |
| 贴纸浮动样式在 `css/components/` 下 | ✅ |
| 样式泄漏（编辑模式影响主页面） | ✅ 无 — 使用 `#article-editor-*` / `#sticker-editor-*` ID 限定 |
| 移动端隐藏编辑模式 | ✅ `@media (max-width: 768px) { display: none }` |

### 4.3 动画与过渡

| 动画 | 方式 | 文件 | 评估 |
|:---|:---|:---|:---|
| 光标脉冲 | CSS `@keyframes sticker-cursor-pulse` | `sticker-editor.css` | ✅ |
| 贴纸入场 | CSS `@keyframes sticker-appear` | `sticker-editor.css` | ✅ |
| 贴纸文字绕排入场 | CSS `@keyframes sticker-float-in` | `sticker-float.css` | ✅ |
| 控制台折叠/展开 | JS 切换 `width` + `display`，CSS `transition: width 0.2s` | inline + admin.css | ✅ |

---

## 五、性能检查结果

### 5.1 内存泄漏

| 检查项 | 状态 | 详情 |
|:---|:---:|:---|
| ArticleEditorMode 事件监听器清理 | ✅ | escHandler、inputHandler、pasteHandler 均在 `_cleanup()` 中移除 |
| StickerEditorMode 事件监听器清理 | ✅ | escHandler、document 级 drag 监听器在 onUp 中移除 |
| 定时器清理 | ✅ | `_escPressTimer`、`_flashTimer` 在 cleanup 中 clearTimeout |
| DOM 元素清理 | ✅ | overlay、toolbar、console、contextMenu 均有 remove |
| 贴纸拖拽监听器清理 | ⚠️ | 贴纸元素上的 `mousedown` 监听器随元素 remove 时解除（DOM 自动 GC） |

**问题 8（P2）**：`StickerEditorMode._renderExistingStickers()` 和 `_addSticker()` 为每个贴纸元素绑定 `mouseenter`/`mouseleave`/`mousedown`/`contextmenu` 事件。当 `_stickerLayer.innerHTML = ''` 清除所有贴纸时（`_refreshStickerLayer` L865），这些监听器随 DOM 元素被 GC。但如果频繁增删贴纸，旧的监听器仍绑定在已移除的元素上，需等待 GC。

**严重程度**：P2
**修改方向**：`_refreshStickerLayer()` 前先遍历现有贴纸元素调用 `removeEventListener`，或使用事件委托模式
**预期工作量**：小（<1h）

### 5.2 渲染性能

| 操作 | 开销 | 问题 |
|:---|:---|:---|
| `_refreshConsoleGallery()` | 重建整个贴纸库 DOM | ⚠️ 每次增删贴纸都完全重建画廊（`innerHTML = ''` → `forEach` 创建所有项） |
| `_refreshStickerLayer()` | 清空+重建贴纸 DOM | ⚠️ 同 `innerHTML = ''` → `_renderExistingStickers` 重新创建 |

**问题 9（P2）**：控制台贴纸库在每次 `_refreshConsoleGallery()` 中完全重建，而不是增量更新"已放置"标记。

**严重程度**：P2
**修改方向**：增量更新 — 只更新 `isPlaced` 状态变化的贴纸项
**预期工作量**：小（<1h）

### 5.3 重复正则定义

**问题 10（P1）**：贴纸标记正则 `_MARKER_REGEX` 在 **三个地方** 独立定义：

| 文件 | 行号 | 变量 |
|:---|:---|:---|
| `sticker-renderer.js` | L21 | `_MARKER_REGEX` |
| `article-editor-mode.js` | L387 | 内联正则 `/<!--\s*sticker:.*?-->/g`（仅清除用） |
| `article-editor-mode.js` | L407 | 内联正则（`_parseStickersFromContent`） |
| `detail.js` | L519 | 内联正则（`_parseStickerMarkers`） |

维护成本高，修改标记格式需改 4 处。

**严重程度**：P1
**修改方向**：统一导出 `StickerRenderer._MARKER_REGEX`，所有解析/清除复用同一个正则
**涉及文件**：`article-editor-mode.js`、`detail.js`
**预期工作量**：小（<1h）

---

## 六、错误处理与边界检查结果

### 6.1 数据异常

| 场景 | 处理 | 评估 |
|:---|:---|:---|
| 文章内容为空 | `_renderContent('')` 返回"（空内容）" | ✅ |
| 贴纸库为空 | 控制台显示"贴纸库为空，请先在管理面板上传贴纸" | ✅ |
| 贴纸图片加载失败 | 无专门处理，`background-image` 静默失败 | ⚠️ |
| 文章无贴纸进入贴纸编辑 | 正常显示空画布 + 控制台 | ✅ |
| decoId 对应的贴纸不存在 | `StickerRenderer` 打印 warn 并跳过 | ✅ |

### 6.2 网络异常

| 场景 | 处理 | 评估 |
|:---|:---|:---|
| 保存草稿 API 失败 | `Utils.showToast(UI.editor.saveFailed + err.message)` | ✅ |
| 发布 API 失败 | `Utils.showToast(UI.editor.publishFailed + err.message)` | ✅ |
| 加载草稿列表 API 失败 | DraftManager 显示"加载失败" | ✅ |
| 删除草稿 API 失败 | DraftManager 显示删除失败 toast | ✅ |
| 贴纸同步后端失败 | **静默忽略**，仅 console.error | ⚠️ P2 |

### 6.3 用户操作

| 场景 | 处理 | 评估 |
|:---|:---|:---|
| 未保存按 ESC | `confirm(UI.editor.unsavedConfirm)` | ✅ |
| 未保存点击退出 | `confirm(UI.editor.unsavedConfirm)` | ✅ |
| 双击 ESC（贴纸编辑器） | 计数机制 → 第二次 ESC 直接关闭 | ✅ |
| 点击覆盖层空白区（贴纸编辑器） | `close(false)` | ✅ |

---

## 七、问题汇总（按优先级）

### P0 — 严重问题（必须立即修复）

| # | 问题 | 位置 | 影响 |
|:--:|:---|:---|:---|
| P0-1 | **贴纸位置（x/y）丢失**：从 content 标记解析贴纸时位置硬编码为 `(50, 50+idx*80)`，标记格式不含 x/y 字段 | `article-editor-mode.js` L404-419, `detail.js` L517-531 | 页面刷新后贴纸位置回到默认值 |
| P0-2 | **align 方向丢失**：`_collectStickerData()` 硬编码 `align: 'left'`，右键菜单切换的方向未保存 | `sticker-editor-mode.js` L794 | 用户切换的浮动方向无法持久化 |

### P1 — 重要问题（建议本周修复）

| # | 问题 | 位置 | 影响 |
|:--:|:---|:---|:---|
| P1-1 | **snapshot 不含 stickers**：`hasChanges()` 对纯贴纸修改不敏感 | `article-editor-mode.js` L106-110, L426-434 | 仅修改贴纸后 ESC 不弹确认框 |
| P1-2 | **草稿恢复不恢复贴纸**：`_restoreFromDraft()` 不填充 `article.stickers` | `article-editor-mode.js` L728-739 | 草稿恢复后编辑器中贴纸层为空 |
| P1-3 | **贴纸数据双源并存**：`article.stickers` 和 `content` 标记独立维护，可能不同步 | `article-editor-mode.js` L383-396、L812-823 | 数据一致性风险 |
| P1-4 | **编辑模式与阅读视图渲染不一致**：编辑用 absolute 定位，阅读用 float 绕排 | `sticker-editor-mode.js` L258-270 vs `sticker-renderer.js` L130-143 | 所见非所得 |
| P1-5 | **正则重复定义**：同一标记格式的 4 处独立实现 | 表格见 §5.3 | 维护成本 |

### P2 — 轻微问题（可延后处理）

| # | 问题 | 位置 |
|:--:|:---|:---|
| P2-1 | 贴纸同步后端失败静默 | `article-editor-mode.js` L838-840 |
| P2-2 | ShapeGenerator 无缓存 | `shape-generator.js` |
| P2-3 | 控制台画廊完全重建（非增量） | `sticker-editor-mode.js` L582-648 |
| P2-4 | 贴纸元素的旧事件监听器需等 GC | `sticker-editor-mode.js` L239-291 |
| P2-5 | `drop-shadow` 三主题硬编码 | `sticker-float.css` L82-94 |

---

## 八、修改方向建议

### 短期（1-3 天）

```
优先级 1：修复 P0 问题
  ├── P0-1: 标记格式增加 x/y → _parseStickersFromContent 正确读取
  │        涉及: article-editor-mode.js, detail.js, sticker-renderer.js
  │        工作量: 中（半天）
  └── P0-2: _collectStickerData 从 _stickerData 读取 align
            涉及: sticker-editor-mode.js L794
            工作量: 小（<1h）

优先级 2：修复 P1 问题
  ├── P1-1: snapshot 含 stickers → hasChanges 检测贴纸变更
  │        涉及: article-editor-mode.js
  │        工作量: 小（<2h）
  ├── P1-2: _restoreFromDraft 恢复 stickers
  │        涉及: article-editor-mode.js L728-739
  │        工作量: 中（半天）
  └── P1-5: 统一 MARKER_REGEX
            涉及: sticker-renderer.js（导出）, article-editor-mode.js, detail.js（导入）
            工作量: 小（<1h）
```

### 中期（1-2 周）

```
优先级 3：数据架构优化
  ├── P1-3: 贴纸数据单源化 — 以 article.stickers 为权威源，content 标记为持久化辅助
  │        涉及: article-editor-mode.js, sticker-editor-mode.js, detail.js
  │        工作量: 大（1-2天）
  └── P1-4: 统一编辑/阅读渲染方式
            涉及: sticker-editor-mode.js, sticker-renderer.js
            工作量: 大（1-2天）

优先级 4：模块拆分
  └── 将 ArticleEditorMode 中的贴纸逻辑（_renderExistingStickers, _bindEditorStickerDrag,
      _showEditorStickerMenu, _refreshStickerLayer, _parseStickersFromContent）
      抽取为独立的 article-editor-stickers.js 模块
      工作量: 中（半天）
```

### 长期（1 个月+）

```
├── ShapeGenerator 缓存 + 多形状支持优化
├── 控制台增量渲染（虚拟列表）
├── 贴纸旋转 + 更多形状（心形、星形）
└── 移动端贴纸编辑（当前完全禁用）
```

---

## 九、验证清单

### P0 修复验证

- [ ] P0-1：保存贴纸位置后刷新页面，贴纸位置正确恢复（不是默认 (50, 50+idx*80)）
- [ ] P0-2：在贴纸编辑器中切换贴纸为 right 浮动 → 保存 → 阅读视图贴纸在右侧浮
- [ ] P0-2：保存后再次进入贴纸编辑器，align 保持为 right

### P1 修复验证

- [ ] P1-1：只修改贴纸（不改标题/内容）→ 按 ESC 弹出未保存确认对话框
- [ ] P1-2：保存含贴纸的草稿 → 恢复草稿 → 编辑器中贴纸层正确显示
- [ ] P1-2：草稿恢复后的贴纸位置与保存时一致
- [ ] P1-5：所有贴纸标记解析使用 `StickerRenderer._MARKER_REGEX`

### 回归测试

- [ ] 文章编辑：创建文章 → 编辑 → 保存草稿 → 刷新 → 草稿可恢复
- [ ] 文章编辑：发布 → 阅读视图中显示贴纸
- [ ] 贴纸编辑：打开贴纸编辑器 → 添加贴纸 → 拖拽 → 确认 → 返回编辑器
- [ ] 贴纸编辑：切换浮动方向 → 保存 → 关闭 → 再次打开确认方向保持
- [ ] 键盘快捷键：Ctrl+E / ESC / Ctrl+S / Ctrl+Enter 全部正常
- [ ] 三主题：dark/light/lofi 下编辑器和贴纸编辑样式正常
- [ ] 移动端：编辑器功能不可用（不崩溃、不显示）
- [ ] 草稿管理：保存/恢复/删除草稿正常
- [ ] 草稿恢复含贴纸：贴纸数据完整
