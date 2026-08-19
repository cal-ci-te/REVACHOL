# 文章内贴纸系统 — 开发者文档

> 版本：v1.0.0 | 更新：2026-08-04

---

## 概述

文章内贴纸系统允许管理员在文章编辑器中通过沉浸式全屏界面，将已上传的贴纸（来自 `DecoShelf` 库）放置到文章内容中。贴纸以 CSS `float` + `shape-outside` 方式渲染，实现文字绕排效果。

### 架构

```
article-editor.html / article-editor.js  （入口按钮 + 事件绑定）
        │
        ▼
StickerEditorMode  （全屏覆盖层 + 控制台 + 拖拽 + 保存）
        │
        ├──▶ DecoService / DecoEdit（复用现有贴纸库和交互）
        ├──▶ StickerRenderer（贴纸 DOM 创建 + 标记解析）
        ├──▶ StickerShape（浮动形状 + shape-outside CSS）
        └──▶ ShapeGenerator（16边形多边形生成）
```

---

## 文件清单

| 文件 | 说明 | 行数 |
|------|------|:--:|
| `js/editor/sticker-editor-mode.js` | 沉浸式编辑模式核心（覆盖层、工具、控制台、拖拽、保存） | ~420 |
| `js/editor/sticker-renderer.js` | 贴纸 DOM 创建、标记解析、文章内渲染 | ~150 |
| `js/editor/sticker-shape.js` | 浮动形状配置、位置推荐 | ~80 |
| `js/utils/shape-generator.js` | 16边形多边形顶点生成（圆形/椭圆/圆角矩形） | ~120 |
| `css/editor/sticker-editor.css` | 编辑模式覆盖层、控制台、动画样式 | ~180 |
| `css/components/sticker-float.css` | 文字绕排 float + shape-outside 样式 | ~100 |

### 已有文件修改

| 文件 | 变更 |
|------|------|
| `js/core/event-constants.js` | 新增 `STICKER_EDITOR_OPENED/CLOSED/SAVED` 事件常量 |
| `js/utils/ui-strings.js` | 新增 `stickerEditor` 文案对象（15 个字符串） |
| `article-editor.html` | 新增 `📌 添加贴纸` 按钮 + CSS 引用 |
| `js/pages/article-editor.js` | 新增 `StickerEditorMode` 导入 + 按钮事件绑定 |

---

## 数据模型

贴纸数据存储在文章对象中：

```javascript
{
  id: 1,
  title: '角色介绍',
  content: '这是角色背景故事...\n<!-- sticker:deco_abc align=left w=120 h=120 -->',
  stickers: [
    {
      decoId: 'deco_abc',      // 对应 DecoService 中的贴纸 ID
      x: 200,                   // 编辑模式下相对于文章容器的 X 位置（px）
      y: 300,                   // 相对于文章容器的 Y 位置（px）
      width: 120,               // 贴纸宽度（px）
      height: 120,              // 贴纸高度（px）
      align: 'left',            // 浮动方向: 'left' | 'right'
      margin: 20,               // 文字间距（px）
      shape: 'circle',          // 形状类型: 'circle' | 'ellipse' | 'rounded-rect'
      vertices: 16,             // shape-outside polygon 顶点数量
    },
  ],
}
```

### 贴纸占位标记

贴纸在文章内容中以 HTML 注释标记的形式存储，格式：

```
<!-- sticker:decoId align=left w=120 h=120 -->
```

- `decoId`：贴纸库中的贴纸 ID
- `align`：浮动方向（left/right），默认 left
- `w`/`h`：宽度/高度（px），默认 120

---

## 事件系统

| 事件 | 触发时机 | payload |
|------|---------|---------|
| `STICKER_EDITOR_OPENED` | 打开编辑模式 | `{ articleId }` |
| `STICKER_EDITOR_CLOSED` | 关闭编辑模式 | `{ articleId, saved: bool, stickers? }` |
| `STICKER_EDITOR_SAVED` | 确认保存贴纸 | `{ articleId, stickers: Array }` |

---

## 使用方式

### 打开贴纸编辑

1. 在文章编辑器中选中一篇文章
2. 点击工具栏中的"📌 添加贴纸"按钮
3. 进入全屏编辑模式

### 添加贴纸

1. 在右下角控制台的贴纸库中点击贴纸缩略图
2. 贴纸出现在文章容器中（默认位置或避让已有贴纸）
3. 拖拽贴纸到期望位置
4. 右键贴纸可切换浮动方向或删除

### 保存与取消

- 点击底部工具栏"✅ 确认"：保存所有贴纸位置，写回文章数据
- 点击"❌ 取消"或按 ESC：放弃所有更改，恢复编辑前状态

---

## 文字绕排机制

贴纸使用 CSS `float` + `shape-outside: polygon(...)` 实现文字绕排：

1. `ShapeGenerator.forSticker(w, h, 'circle', 16)` 生成 16 个顶点的 polygon 字符串
2. 16 边形在视觉上近似圆形，CSS `shape-outside` 的性能可接受
3. 贴纸元素设置 `float: left` 或 `float: right`
4. 文字自动绕过 `shape-outside` 定义的区域

### 形状类型

| 类型 | 说明 |
|------|------|
| `circle` | 默认，16边形近似圆形 |
| `ellipse` | 椭圆，填充整个贴纸区域 |
| `rounded-rect` | 圆角矩形，4 个角各 4 个顶点 |

---

## 移动端

- `≤768px` 或触屏设备：隐藏"添加贴纸"按钮
- 如果通过其他方式进入编辑模式，显示提示"贴纸编辑功能仅支持桌面端"
- 文章详情页的贴纸在移动端自动缩小至 80px

---

## 主题适配

所有贴纸编辑模式 UI 元素使用 CSS 变量（`var(--color-*)`），自动适配三套主题（暗色/亮色/低保真）。贴纸浮动元素包含主题特定的 `filter` 属性调节阴影效果。

---

## 扩展指南

### 新增形状类型

1. 在 `ShapeGenerator` 中添加新的形状生成方法
2. 在 `StickerShape.buildFloatStyles()` 中添加形状分支
3. 在 `sticker` 数据模型中更新 `shape` 字段

### 自定义贴纸交互

贴纸的拖拽和右键菜单逻辑位于 `StickerEditorMode` 中：
- `_bindStickerDrag(el)` — 拖拽处理
- `_showStickerContextMenu(x, y, data, el)` — 右键菜单

---

*本文档随贴纸系统迭代持续更新。*
