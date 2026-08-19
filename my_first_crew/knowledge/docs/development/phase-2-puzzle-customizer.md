# Phase 2 拼图自定义面板 — 开发文档

> 版本：v1.10.0 | 日期：2026-07-23 | 阶段：管理面板改造

---

## 一、功能概述

Phase 2 将管理面板中拼图模块的交互从两个简单按钮（上传/重置）升级为完整的**模态浮层自定义面板**。管理员可以在面板中实时调整拼图的所有可配置参数（尺寸、块大小、溢出距离、位置模式、图片），修改即时预览，确认后持久化保存。

### 与 Phase 1 的关系

```
Phase 1（核心重构）                    Phase 2（管理面板）
─────────────────                    ─────────────────
Puzzle 类（可实例化）      ←──→      PuzzleCustomizer 面板
  ├── setSize(w, h)                    ├── 宽度/高度 数字输入
  ├── setOverhang(px)                  ├── 溢出距离 滑块
  ├── setPosition(x, y)                ├── 位置模式 切换 + X/Y 输入
  ├── updateConfig({ blockSize })      ├── 块尺寸 数字输入
  ├── setImage(dataUrl)                ├── 图片 上传/重置
  ├── save() / load()                  └── 应用→save / 取消→restore
  └── getConfig()              ←──    读取当前配置填充面板
```

---

## 二、文件结构

### 新增文件

| 文件 | 行数 | 职责 |
|------|:--:|------|
| `js/admin/puzzle/PuzzleEntry.js` | 56 | 生成入口按钮 HTML（替代旧上传/重置按钮），暴露 `getPuzzleInstance()` 和 `updatePuzzlePreview()` |
| `js/admin/puzzle/PuzzleCustomizer.js` | 478 | 模态浮层面板：打开/关闭/ESC、全参数控件、实时预览、边界校验、应用/重置/取消、快照恢复 |
| `css/components/puzzle-customizer.css` | 256 | 面板样式：遮罩层、面板主体、输入/滑块/按钮控件、三套主题变量适配、入场动画、响应式 |

### 修改文件

| 文件 | 变更量 | 说明 |
|------|:--:|------|
| `js/admin/panel/render.js` | +6 / -37 | 新增 `PuzzleEntry` + `PuzzleCustomizer` 导入；旧 HTML 替换为 `${renderPuzzleEntry()}`；旧文件上传 handler 替换为 `bindPuzzleFileUpload()`；旧 unbindEvents 中 puzzle 清理已移除 |
| `js/admin/panel/events/index.js` | +4 / -11 | 旧 `upload-puzzle-image` + `reset-puzzle-image` handler 替换为 `open-puzzle-customizer`（动态 import 懒加载）；移除不再需要的 `AppState` / `MUTATIONS` 导入 |

---

## 三、使用流程

### 3.1 打开面板

```
1. 管理员登录 → 打开管理面板
2. 滚动到"拼图自定义"区域
3. 看到 🧩 拼图自定义 按钮 + 当前配置预览（如"480×180"）
4. 点击按钮 → 动态 import PuzzleCustomizer → 打开模态浮层
5. 面板自动读取当前拼图实例配置并填充所有输入框
6. CSS 首次动态注入（`<link id="puzzle-customizer-css">`），后续复用
```

### 3.2 调整参数

```
实时预览模式：每次参数变更立即应用到拼图实例
  ┌─────────────┐     input/change      ┌─────────────┐
  │ 面板控件     │ ──────────────────→  │ _validate    │
  │ - 宽度 600  │                       │ AndPreview() │
  │ - 高度 300  │ ←── 错误提示 ─────── │              │
  │ - 块 72     │                       │ _preview()   │
  │ - 溢出 150  │                       │   ↓          │
  │ - 坐标模式  │                       │ puzzle.set*()│
  └─────────────┘                       └──────┬──────┘
                                               ↓
                                        拼图实时更新
```

### 3.3 应用 / 取消 / 重置

| 操作 | 行为 |
|------|------|
| **✅ 应用** | 校验 → `puzzle.save()` 持久化 → 更新入口预览 → 关闭面板 |
| **取消 / ✕ / ESC / 点击遮罩** | `_restoreSnapshot()` 撤销所有实时预览更改 → 关闭面板 |
| **↺ 重置** | 恢复默认配置 480×180 + 流式模式 + 清除图片 → 实时预览更新（不关闭，可继续调整） |

---

## 四、面板控件详表

| 控件 | DOM ID | 类型 | 范围 | 校验 |
|------|--------|------|------|------|
| 宽度 | `pzWidth` | `<input type="number">` | 200 – (window.innerWidth-40) | 超出显示红色边框 + 错误提示 |
| 高度 | `pzHeight` | `<input type="number">` | 80 – (window.innerHeight-100) | 同上 |
| 块尺寸 | `pzBlockSize` | `<input type="number">` | 40 – 200 | 静默钳制（校验失败回落 draft 值） |
| 溢出距离 | `pzOverhang` | `<input type="range">` | 0 – 500 | 滑块 + 数值显示 |
| 位置模式 | `pzModeFlow` / `pzModeCoord` | 按钮切换 | 流式 / 坐标 | 切换时动态重建位置输入行 |
| 位置 X | `pzPosX` | `<input type="number">` | 0 – (window.innerWidth-40) | 仅坐标模式显示 |
| 位置 Y | `pzPosY` | `<input type="number">` | 0 – (window.innerHeight-100) | 仅坐标模式显示 |
| 图片 | `pzUploadBtn` / `pzResetImgBtn` | 按钮 | image/* | 复用 AdminAvatar.openCustomCrop(8:3) |
| 应用 | `pzApplyBtn` | 按钮 | — | 保存 + 关闭 |
| 重置 | `pzResetBtn` | 按钮 | — | 恢复默认 + 预览更新 |
| 取消 | `pzCancelBtn` | 按钮 | — | 恢复快照 + 关闭 |

---

## 五、关键技术决策

### 5.1 懒加载

`PuzzleCustomizer.js`（478 行）不随管理面板启动加载，而是在用户点击"🧩 拼图自定义"按钮时通过动态 `import()` 按需加载，减少管理面板首屏加载体积。

```javascript
// js/admin/panel/events/index.js
'open-puzzle-customizer': async function () {
    const { handleOpenPuzzleCustomizer } = await import('../../puzzle/PuzzleCustomizer.js');
    handleOpenPuzzleCustomizer();
},
```

### 5.2 快照恢复机制

面板打开时保存配置快照（`_snapshot`），关闭/取消时调用 `_restoreSnapshot()` 将所有参数恢复到打开前的状态。这解决了实时预览直接修改拼图实例导致的"取消后无法回退"问题。

```
open() → snapshot ← close() → restoreSnapshot()
          ↓
       实时预览修改 puzzle 实例
          ↓
       apply() → save()（跳过恢复）
       cancel() / ESC / 遮罩 → restoreSnapshot()
```

### 5.3 CSS 动态注入

面板样式不依赖构建系统，首次打开时通过 `_ensureCSS()` 动态创建 `<link>` 标签注入。所有颜色使用 CSS 变量（`var(--color-*)`），自动适配三套主题。

---

## 六、风险排查结果

### 修复的问题

| # | 等级 | 问题 | 修复 |
|---|:---:|------|------|
| 1 | 🟡 | 取消/关闭面板不恢复原始配置 | 打开时保存 `_snapshot`，`close()` 中调用 `_restoreSnapshot()` 恢复尺寸/位置/溢出/块大小 |
| 2 | 🟡 | 无 ESC 键关闭面板 | 新增 `_escHandler`，`_bindEvents()` 注册 `keydown` 监听，`close()` 中 `removeEventListener` 清理 |
| 3 | 🟡 | CSS 文件路径未确认 | 将 `puzzle-customizer.css` 部署至 `css/components/` 目录，`_ensureCSS()` 引用 `/css/components/puzzle-customizer.css` |

### 无问题确认项（7 项）

| # | 检查项 | 结果 |
|:--:|--------|:--:|
| 1 | 旧 `puzzleUploadBtn` / `puzzleResetDefaultBtn` / `puzzleFileInput` ID 残留 | ✅ 0 个残留，旧 HTML 已完全替换 |
| 2 | 旧 `upload-puzzle-image` / `reset-puzzle-image` action 残留 | ✅ 0 个残留，handler 已替换为 `open-puzzle-customizer` |
| 3 | 旧 `assetUploadBtn` / `assetFileInput` ID | ✅ 保留正确，这是贴纸（deco）上传功能，与拼图无关 |
| 4 | 新入口 3 个 ID 引用完整性 | ✅ `openPuzzleCustomizerBtn` / `puzzleConfigPreview` / `puzzleCustomizerFileInput` 全部正确引用 |
| 5 | 文件上传防重复绑定 | ✅ `input._pzHandler` 标记，重新渲染时先移除旧 handler |
| 6 | 面板重复打开守卫 | ✅ `_visible` 标志，已打开时直接返回 |
| 7 | 边界校验覆盖 input 事件 | ✅ 宽度/高度/块尺寸变更均触发 `_validateAndPreview()` |
