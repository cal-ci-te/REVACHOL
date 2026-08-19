# P1 遗留问题排查报告

> 排查日期：2026-08-05 | 版本：v1.18.1-postfix | 排查范围：9 个维度，含正则兼容性实测

---

## 执行摘要

- **排查日期**：2026-08-05
- **排查范围**：标记解析健壮性、交互体验、草稿系统、系统融合、UI/UX、性能资源、错误处理、代码质量、特殊场景
- **总体结论**：🔴 **发现 1 个 P0 级正则兼容性 bug + 3 个 P1 问题**
- **关键发现**：
  1. 🔴 **P0**：新正则不匹配旧格式标记（字段顺序差异），导致旧文章贴纸数据静默丢失
  2. **P1**：保存/发布操作无防重复机制，快速双击产生重复请求
  3. **P1**：`_renderContent` 贴纸渲染逻辑在 `article-editor-mode.js` 和 `sticker-editor-mode.js` 中重复实现
  4. **P1**：`mouseenter`/`mouseleave` 监听器注册在贴纸元素上，cleanup 时随 DOM 删除被动释放，非显式移除
  5. **P2**：多处硬编码坐标默认值 50、间距默认值 80

---

## 🔴 P0 — 正则兼容性 bug（需立即修复）

### 问题描述

P0 修复中引入的 `_MARKER_REGEX` 采用**固定字段顺序** `x → y → w → h → align`，而旧格式字段顺序为 `align → w → h`（不含 x/y）。新正则匹配旧标记时，`align` 之后的 `w=` / `h=` 字段被 `\s*-->` 闭合符拦截，导致**旧标记完全无法匹配**。

### 影响范围

- **所有修复前保存的文章**：其 content 中的 `<!-- sticker:xxx align=left w=120 h=120 -->` 标记被新正则静默跳过
- **阅读视图**：旧文章贴纸不渲染（`_parseStickerMarkers` 返回空）
- **编辑模式**：打开旧文章时 `_parseStickersFromContent` 返回空数组，贴纸层为空
- **数据积累**：`_MARKER_REGEX` 清除旧标记也失败（L771/L820），导致新旧标记混杂

### 实测确认

```
旧标记：<!-- sticker:deco_abc align=left w=120 h=120 -->
新正则：/<!--\s*sticker:([a-zA-Z0-9_-]+)(?:\s+x=(\d+))?(?:\s+y=(\d+))?(?:\s+w=(\d+))?(?:\s+h=(\d+))?(?:\s+align=(left|right))?\s*-->/g

执行结果：NULL (不匹配！)
原因：字段顺序不兼容 — 旧格式 align 在 w/h 之前，新正则 align 在 w/h 之后
```

### 修复方向

**方案 A（推荐）**：两步解析法

1. 用通用正则提取所有 sticker 注释块：`/<!--\s*sticker:(.*?)-->/g`
2. 对每个注释内容用字段解析正则提取字段：`/(\w+)=(\S+)/g`

此方案与字段顺序无关，兼容任意新旧格式，且代码更简洁。

**涉及文件**：`sticker-renderer.js`（`_MARKER_REGEX` + `parseMarkers`）、`article-editor-mode.js`（`_parseStickersFromContent` + `_buildSaveContent` 清除）、`detail.js`（`_parseStickerMarkers`）

**预期工作量**：中（半天）

**方案 B**：保留现有新正则，附加旧正则做 fallback

先尝试新正则，不匹配则尝试旧正则。维护两套正则，字段格式变更时需同步修改。

**预期工作量**：小（<2h）

---

## 一、标记解析与数据边界

### 1.1 标记解析健壮性

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 坐标值非数字 `x=abc` | ❌ P0 | 见上文 — 整个标记不匹配（非仅 x 字段） |
| 标记不完整 `<!-- sticker:xxx --!>` | ✅ | 不匹配，无副作用 |
| 多个相同贴纸 ID | ✅ | 各被解析为独立 sticker 对象 |
| 标记在代码块中 | ⚠️ P2 | `<!-- sticker:... -->` 在 `<pre>` 中不会被浏览器渲染，但正则仍匹配 |

### 1.2 数据迁移与兼容

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 旧文章（仅有标记，无 stickers 字段） | ❌ P0 | 标记解析失败，stickers 为空 |
| 旧文章（stickers 字段格式不符） | ✅ | `JSON.parse(JSON.stringify())` 序列化安全 |
| 旧草稿（无 stickers 字段） | ✅ | `_restoreFromDraft` 从 content 解析（但见 P0） |
| 旧草稿（stickers 为 null） | ✅ | `|| []` 防御 |

### 1.3 坐标有效性

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| x < 0 或 x > containerWidth | ✅ | 拖拽时 `Math.max(0, Math.min(...))` 钳制 |
| 容器宽度为 0 | ⚠️ P2 | `suggestPosition` 中 `containerWidth \|\| 800` 回退，但渲染 `left:0` 时贴纸不可见 |
| 坐标值非常大 999999 | ✅ | 拖拽钳制于容器内 |

---

## 二、贴纸交互与操作

### 2.1 拖拽体验

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 拖到容器外（如侧边栏） | ✅ | 边界钳制限制在容器内 |
| 拖拽中文本选中 | ❌ P1 | `onMove` 中有 `e.preventDefault()`，但 `onDown` 中未阻止 — 若拖拽起始在文字上会选中文本 |
| 快速连续拖拽 | ✅ | 无性能问题，`mousemove` 频率由浏览器控制（~60fps） |
| 边界视觉反馈 | ❌ P2 | 无视觉反馈，拖到边缘时贴纸突然停止 |

### 2.2 右键菜单

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 贴纸删除后菜单自动关闭 | ✅ | `_removeContextMenu()` 在 action 中调用 |
| 点击菜单项后关闭 | ✅ | 同上 |
| 点击空白区关闭 | ✅ | `setTimeout` + `{ once: true }` 全局 click |
| ESC 关闭菜单 | ❌ P2 | 未实现 — ESC 直接关闭整个编辑器 |
| 键盘导航 | ❌ P3 | 未实现 — 纯鼠标交互 |

### 2.3 多贴纸交互

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 重叠时正确选中 | ⚠️ P2 | z-index 由拖拽动态管理（拖拽中 z=20，释放后 z=10），先创建的贴纸在后创建的下面 |
| 右键显示在最上层 | ⚠️ P2 | 右键菜单 z=10002（全局固定），不受贴纸 z-index 影响 ✅ |
| 拖拽不干扰其他贴纸 | ✅ | 每个贴纸独立的 mousedown 处理 |
| 控制台"已放置"标记 | ✅ | 每次 refresh 基于 `_stickerData.decoId` 的 Set 重建 |

---

## 三、草稿系统

### 3.1 草稿保存

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 无内容时保存草稿 | ❌ P1 | `saveDraft()` 仅检查 `!title`，无标题不能保存，但无 title 时 toast 提示不够友好 |
| 快速连续保存 10 次 | ❌ P1 | **无防重复机制** — 每次点击都发起新 POST，草稿列表会堆积 |
| 后端返回 500 | ✅ | catch 后 `Utils.showToast(saveFailed + err.message)` |
| 网络超时 | ⚠️ P2 | 依赖 `ApiClient` 的默认超时（无自定义超时设置） |

### 3.2 草稿恢复

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| `_dirty` 正确设置 | ✅ | `_restoreFromDraft` 设置 `_dirty = true` |
| 工具栏标题/分类同步 | ✅ | `_toolbar.updateInfo()` 调用 |
| 贴纸层立即刷新 | ✅ | P1-2 修复后增加 `_refreshStickerLayer()` |
| snapshot 更新 | ⚠️ P2 | 草稿恢复后 `_snapshot` 不更新 — 未保存恢复的内容直接 ESC 不会弹确认框 |

### 3.3 草稿预览

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| HTML 安全转义 | ✅ | `Utils.escapeHtml(preview)` |
| 空列表提示 | ✅ | "暂无草稿历史" |
| 时间本地化 | ✅ | `toLocaleString('zh-CN')` |

---

## 四、系统融合边界

### 4.1 文章编辑 ↔ 贴纸编辑

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 文章内容正确传递 | ✅ | `article = { id, title, content, stickers }` |
| 取消后数据正确回滚 | ✅ | `close(false)` → `_stickerData = deepCopy(snapshot)` |
| 工具栏标题不变 | ✅ | 贴纸编辑不修改标题 |
| 保存后 `_dirty` 设置 | ⚠️ P2 | `onStickerSaved` 中 `self._dirty = true` 但未更新 `_snapshot` |

### 4.2 文章编辑 ↔ 草稿系统

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 草稿恢复后贴纸一致 | ⚠️ | 取决于 P0 修复（旧标记解析） |
| 修改后保存草稿不覆盖贴纸 | ✅ | `_buildSaveContent()` 从 `article.stickers` 重建标记 |
| 草稿恢复后 ESC 确认 | ⚠️ P2 | `_snapshot` 未更新于草稿恢复后 |

---

## 五、UI/UX 体验

### 5.1 视觉反馈

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 贴纸拖拽阴影/缩放 | ⚠️ P2 | 有 cursor 变化 + 边框高亮，无阴影/缩放 |
| 贴纸悬停边框高亮 | ✅ | `mouseenter` → `borderColor: var(--color-accent)` |
| 保存草稿成功 Toast | ✅ | `Utils.showToast(UI.editor.saveSuccess)` |
| 发布成功 Toast | ✅ | `Utils.showToast(UI.editor.publishSuccess)` |
| 操作失败 Toast | ✅ | `Utils.showToast(...error...)` |

### 5.2 键盘快捷键

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| Ctrl+S 保存提示 | ✅ | Toast 显示 |
| Ctrl+Enter 发布提示 | ✅ | Toast 显示 |
| ESC 双击窗口提示 | ✅ | "再按一次 ESC 放弃更改" |
| contentEditable 中不触发 | ❌ P2 | `_bindKeys` 不检查 `contentEditable` — 输入 `s` 时误触 Ctrl+S |

### 5.3 响应式

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| ≤768px 自动隐藏编辑器 | ⚠️ | CSS `@media (max-width: 768px) { display: none }` 隐藏，但 JS 仍可 open |
| 贴纸编辑模式自动禁用 | ✅ | `open()` 中 `window.innerWidth <= 768` 检查 + toast 提示 |
| 移动端友好提示 | ✅ | "贴纸编辑功能仅支持桌面端" |

---

## 六、性能与资源

### 6.1 渲染性能

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 长文章（5000字）编辑 | ⚠️ | `_renderContent` 使用多次 `String.replace`，大文本性能可接受 |
| 20+ 贴纸拖拽 | ✅ | 每张贴纸独立 `mousemove` 处理，无批量更新 |
| 50+ 贴纸库打开 | ⚠️ P2 | 控制台每项都创建 DOM 元素，大量贴纸时可能卡顿 |

### 6.2 内存管理

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 反复打开/关闭 | ⚠️ P1 | `_cleanup()` 中 `innerHTML = ''` 清贴纸层，但贴纸元素上的 `mouseenter`/`mouseleave`/`mousedown`/`contextmenu` 监听器随着 DOM 删除被动释放，非显式 `removeEventListener` |
| 主题切换重绘 | ✅ | CSS 变量切换，贴纸无 JS 重绘 |

### 6.3 网络请求

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 保存草稿多余请求 | ✅ | 单次 POST |
| 发布多余请求 | ✅ | 单次 PUT + fetchArticles |
| 草稿列表缓存 | ❌ P2 | 每次 `refresh()` 都重新请求 API |

---

## 七、错误处理

### 7.1 数据异常

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| content 为 null/undefined | ✅ | `\|\| ''` + 空内容占位符 |
| stickers 为 null/undefined | ✅ | `\|\| []` 防御 |
| 贴纸库加载失败 | ⚠️ P2 | catch 静默，控制台显示"贴纸库为空" |
| 图片加载失败 | ⚠️ P2 | `background-image` 静默失败，无占位符 |

### 7.2 网络异常

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 保存草稿超时 | ⚠️ P2 | 无自定义超时，依赖 fetch 默认超时 |
| 发布超时 | ⚠️ P2 | 同上 |
| 离线保存 | ❌ P3 | 无离线支持 |

### 7.3 用户操作防护

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 快速双击保存草稿 | ❌ P1 | 无防重复 — 每次点击发送新请求 |
| 快速双击发布 | ❌ P1 | 同上 |
| 浏览器刷新未保存提示 | ❌ P3 | 无 `beforeunload` 事件 |

---

## 八、代码质量

### 8.1 硬编码值

| 值 | 出现次数 | 位置 | 建议 |
|:---|:--:|:---|:---|
| `50`（坐标默认值） | 5 处 | `_parseStickersFromContent`, `createMarker`, `_renderExistingStickers`, `parseMarkers`, `detail.js` | 提取为 `StickerShape.DEFAULT_X` / `DEFAULT_Y` |
| `80`（间距默认值） | 3 处 | `_parseStickersFromContent` 中的 `y = 50 + idx * 80` | 提取为 `StickerShape.DEFAULT_GAP` |
| `800`（容器宽度默认值） | 1 处 | `sticker-shape.js` `suggestPosition` | 提取为 `StickerShape.DEFAULT_CONTAINER_WIDTH` |
| `1500`（双击超时） | 1 处 | `sticker-editor-mode.js` ESC 窗口 | 提取为 `ESC_DOUBLE_PRESS_WINDOW` |

### 8.2 重复代码

| 重复片段 | 位置 1 | 位置 2 | 建议 |
|:---|:---|:---|:---|
| **`_renderContent` Markdown→HTML** | `article-editor-mode.js` L241-276 | `sticker-editor-mode.js` L175-207 | 提取到 `js/utils/markdown-renderer.js` |
| **贴纸标记解析** | `article-editor-mode.js` L404-419 | `detail.js` L517-533 | ✅ 已修复（统一用 `_MARKER_REGEX`） |
| **浮动方向切换** | `sticker-editor-mode.js` L371-374 | `article-editor-mode.js` L518 | 同上逻辑，两个上下文各一份 |

### 8.3 注释与文档

| 检查项 | 状态 | 说明 |
|:---|:---:|:---|
| 公共函数 JSDoc | ✅ | `open`, `close`, `createMarker`, `parseMarkers` 等 |
| 复杂逻辑注释 | ⚠️ | `_collectStickerData` 新增的 dataMap 逻辑无注释 |
| 文件头模块说明 | ✅ | 全部文件有模块说明 |

---

## 九、问题汇总

### P0 — 需立即修复

| # | 问题 | 影响 | 修复方向 |
|:--:|:---|:---|:---|
| P0-1 | **新正则不匹配旧格式标记** | 所有修复前保存的文章贴纸数据丢失 | 两步解析法：通用提取 + 字段解析（见§P0 详情） |

### P1 — 建议本周修复

| # | 问题 | 影响 | 修复方向 |
|:--:|:---|:---|:---|
| P1-1 | **保存/发布无防重复** | 快速双击产生重复请求、重复草稿 | `saveDraft()`/`saveAndPublish()` 增加 `_saving` 锁 |
| P1-2 | **`_renderContent` 重复实现** | 两处独立维护 Markdown 解析，修改需同步 | 提取到 `js/utils/markdown-renderer.js` |
| P1-3 | **贴纸 mouseenter/mouseleave 被动释放** | 贴纸元素上的监听器随 DOM 删除时被动 GC，非显式移除 | `_refreshStickerLayer()` 前遍历移除监听器 |

### P2 — 可延后处理

| # | 问题 |
|:--:|:---|
| P2-1 | 硬编码默认值 50/80/800 未提取为常量 |
| P2-2 | 拖拽起在文字上会选中文本（`onDown` 缺 `preventDefault` 对于文本节点） |
| P2-3 | 拖到边界无视觉反馈 |
| P2-4 | ESC 不关闭右键菜单 |
| P2-5 | `_snapshot` 在草稿恢复后未更新 |
| P2-6 | contentEditable 中未拦截键盘快捷键 |
| P2-7 | 贴纸库加载失败静默 |
| P2-8 | 草稿列表无缓存 |

---

## 十、验证清单

- [ ] **P0-1**：旧格式标记 `<!-- sticker:xxx align=left w=120 h=120 -->` 被正确解析
- [ ] **P0-1**：新格式标记 `<!-- sticker:xxx x=200 y=300 w=120 h=120 align=left -->` 被正确解析
- [ ] **P0-1**：含旧标记的文章在阅读视图中贴纸正确渲染
- [ ] **P0-1**：含旧标记的文章在编辑模式中贴纸层正确显示
- [ ] **P1-1**：快速双击"保存草稿"只发送 1 次请求
- [ ] **P1-2**：修改 Markdown 解析逻辑后两个编辑器一致生效
- [ ] 拖拽贴纸时文本不被选中
- [ ] 50+ 张贴纸库打开流畅
