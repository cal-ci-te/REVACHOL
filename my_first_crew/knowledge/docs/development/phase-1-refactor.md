# Phase 1 拼图系统重构 — 风险排查报告

> 版本：v1.9.3 | 日期：2026-07-23 | 重构范围：拼图验证码模块

---

## 一、重构概述

将拼图系统从**单例函数式**（`js/ui/components/puzzle/puzzle.js`，262 行，3 个文件）重构为**面向对象可实例化组件**，新建 `js/puzzle/` 目录（6 个文件，共 1155 行），支持多实例、配置驱动、依赖注入。

### 架构对比

```
旧架构（单例）                      新架构（可实例化）
─────────────────                  ─────────────────
initPuzzle() 函数                  Puzzle 类 (主控)
├── PuzzleRenderer (单例对象)       ├── PuzzleState (实例状态)
└── PuzzleDrag (单例对象)           ├── PuzzleRenderer (每实例独立)
                                    ├── PuzzleDrag (可销毁)
                                    ├── StorageAdapter (可插拔)
                                    └── EventEmitter (内部事件，零依赖)
```

### 向后兼容

- `initPuzzle()` 工厂函数签名不变，自动注入全局 `AppState` / `ThemeService` / `UI` 文案
- `js/app.js` 仅修改 1 行 import 路径，调用方式不变
- 旧文件 `/ui/components/puzzle/` 保留不删，无外部引用

---

## 二、文件变更清单

| 操作 | 文件 | 行数 | 说明 |
|:--:|------|:--:|------|
| ✨ | `js/puzzle/core/EventEmitter.js` | 41 | `on/off/emit/once/destroy`，每个 Puzzle 实例独立持有 |
| ✨ | `js/puzzle/core/PuzzleState.js` | 128 | 配置快照 + 图片 + 完成/进度，EventEmitter 通知变更，`exportState/importState` 序列化 |
| ✨ | `js/puzzle/core/PuzzleRenderer.js` | 151 | Canvas 三层绘制（背景→遮罩→缺口），实例级 `_gapX`/`_cachedImg`，`updateSize()` 动态尺寸 |
| ✨ | `js/puzzle/core/PuzzleDrag.js` | 184 | DOM 滑块交互，`destroy()` 完整清理 document 级监听器 |
| ✨ | `js/puzzle/StorageAdapter.js` | 48 | `save/load/remove`，默认 localStorage，`setKey()` 多实例隔离 |
| ✨ | `js/puzzle/Puzzle.js` | 620 | 主控类：生命周期/配置更新/渲染/存储 + `initPuzzle()` 桥接工厂 |
| ✏️ | `js/app.js` | 1 行 | `import` 路径 `./ui/components/puzzle/puzzle.js` → `./puzzle/Puzzle.js` |

---

## 三、修复问题清单

排查中共发现 4 个问题，已全部修复。

### 🔴 #1 — `Puzzle.once()` 抛出 TypeError

**根因**：`Puzzle.once()` 代理到 `this._state.once()`，但 `PuzzleState` 未暴露 `once` 方法。

```javascript
// 修复前 — PuzzleState 只有 on/off/emit
on(event, cb)   { this._events.on(event, cb); return this; }
off(event, cb)  { this._events.off(event, cb); return this; }
emit(event, data) { this._events.emit(event, data); }

// 修复后 — 添加 once 代理
once(event, cb)  { this._events.once(event, cb); return this; }
```

**影响范围**：`puzzle.once('complete', () => {...})` 会抛异常。当前代码中无 `once()` 调用，但 API 声明存在即应实现。

---

### 🟡 #2 — `destroy()` 不返回 `this`

**根因**：`destroy()` 末尾缺少 `return this`，破坏所有公开方法一致的链式调用约定。

```javascript
// 修复前
console.log('[Puzzle] 已销毁');
}  // ← 隐式返回 undefined

// 修复后
console.log('[Puzzle] 已销毁');
return this;
}
```

---

### 🟡 #3 — `_triggerFlash` 定时器未跟踪

**根因**：`setTimeout` 的 ID 未存储，`destroy()` 时无法清理。若在 650ms 内销毁实例，回调可能访问已移除的 DOM。

```javascript
// 修复前
_triggerFlash() {
    ...
    setTimeout(() => this._flash.classList.remove('puzzle-flash-active'), 650);
}

// 修复后
constructor() {
    ...
    this._flashTimer = null;     // 新增字段
}

_triggerFlash() {
    ...
    if (this._flashTimer) clearTimeout(this._flashTimer);
    this._flashTimer = setTimeout(() => {
        if (this._flash) this._flash.classList.remove('puzzle-flash-active');
        this._flashTimer = null;
    }, 650);
}

destroy() {
    ...
    if (this._flashTimer) {      // 新增清理
        clearTimeout(this._flashTimer);
        this._flashTimer = null;
    }
}
```

---

### 🟡 #4 — 无参构造时 `undefined` 覆盖默认值

**根因**：JavaScript 对象展开 `{...DEFAULTS, width: undefined}` 会覆盖默认值 `480`，导致 `getConfig().width` 为 `undefined`。

```javascript
// 修复前 — 直接传入，undefined 会覆盖默认值
this._state = new PuzzleState({
    width: options.width,   // undefined
    height: options.height, // undefined
    ...
});

// 修复后 — 新增 _pickDefined() 过滤
_pickDefined(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        if (obj[key] !== undefined) result[key] = obj[key];
    }
    return result;
}

this._state = new PuzzleState(this._pickDefined({
    width: options.width,   // undefined → 被过滤
    height: options.height, // undefined → 被过滤
    ...
}));
```

**验证**：`new Puzzle()` 无参时 `getConfig().width` 正确返回 `480`。

---

## 四、12 项无问题确认

| # | 检查项 | 方法 | 结果 |
|:--:|--------|------|:--:|
| 1 | 旧路径引用 | `grep -r "ui/components/puzzle" js/` | ✅ 无外部引用，旧文件已孤儿化 |
| 2 | 全局变量污染 | 审查 `window.*` 赋值 | ✅ 仅 `window.__puzzleInstance`，destroy 时 `delete` |
| 3 | 循环依赖 | 追踪 import 链 | ✅ 单向：Puzzle → core/*，无反向依赖 |
| 4 | article-editor 引用 | `grep puzzle js/pages/article-editor.js` | ✅ 不引用 puzzle 模块 |
| 5 | 事件隔离 | 验证内部 emit 不触发全局 EventBus | ✅ 独立 EventEmitter 实例 |
| 6 | off() 清理 | 注册回调 → off → emit | ✅ 回调正确移除 |
| 7 | 页面边界校验 | `new Puzzle({ width: 3000 })` | ✅ throws 明确错误信息 |
| 8 | 类型校验 | `new Puzzle({ width: 'abc' })` | ✅ throws "必须是有效数字" |
| 9 | 错误恢复（非法图片） | `new Puzzle({ image: 'invalid' })` | ✅ 不崩溃，降级纯色背景 |
| 10 | 状态序列化往返 | `exportState → importState` | ✅ 完整恢复 width/height/image/completed |
| 11 | destroy 幂等性 | 连续两次 `destroy()` | ✅ 不崩溃 |
| 12 | ESM 导入 | `node --input-type=module -e "await import(...)"` | ✅ 6 个模块全部通过 |

---

## 五、遗留低优先级项（2 个）

### 🟢 #1 — 多实例 DOM ID 冲突

**问题**：所有 Puzzle 实例共享硬编码 DOM ID（`puzzleWidget`、`puzzleCanvas`、`puzzleBlock`、`puzzleFlash`、`puzzleSlider`、`puzzleTrack`、`puzzleThumb`、`puzzleHint`、`puzzleResetBtn`），`document.getElementById()` 在多实例场景下仅返回首个匹配元素。

**影响**：当前项目仅通过 `initPuzzle()` 创建单个实例，无实际影响。

**计划**：Phase 2 中改为 `${prefix}-${instanceId}` 动态 ID 生成。

---

### 🟢 #2 — 旧文件未删除

**问题**：`js/ui/components/puzzle/` 下 3 个旧文件（`puzzle.js`、`puzzle-renderer.js`、`puzzle-drag.js`）已变为孤儿代码，无任何外部 `import` 引用。

**影响**：Vite tree-shaking 会在生产构建中自动排除未引用的模块。源码层面有轻微混淆风险。

**计划**：Phase 3 统一清理。

---

## 六、API 变更说明

### 新增公开 API（Puzzle 类）

```javascript
// 构造
new Puzzle({ width, height, blockSize, gapSize, overhang, position, image, storageKey, autoSave, theme, storage, mountPoint, insertPosition, uiStrings })

// 生命周期
puzzle.init()        // 创建 DOM → 绑定交互 → 渲染
puzzle.render()      // 手动触发渲染
puzzle.reset()       // 重置缺口位置 + 拼图块归零
puzzle.destroy()     // 完整清理 DOM/事件/定时器/监听器

// 配置更新
puzzle.setSize(w, h)        // 更新 Canvas 尺寸（含边界校验）
puzzle.setOverhang(px)      // 更新溢出距离
puzzle.setPosition(x, y)    // 更新坐标模式位置
puzzle.updateConfig({...})  // 批量更新

// 图片
puzzle.setImage(dataUrl)    // 设置拼图背景图片

// 事件
puzzle.on('complete', cb)   // 拼图完成
puzzle.on('progress', cb)   // 进度变化
puzzle.once('render', cb)   // 单次渲染后触发

// 存储
puzzle.save()               // 手动保存状态到 localStorage
puzzle.load()               // 从 localStorage 恢复状态
puzzle.exportState()        // 导出可序列化状态对象
puzzle.importState(data)    // 导入状态对象

// 查询
puzzle.isCompleted()        // 是否已完成
puzzle.getProgress()        // 进度 0–1
puzzle.getConfig()          // 当前配置快照
puzzle.getImage()           // 当前图片 dataUrl
```

### 保持兼容的 API

```javascript
// 签名不变，内部自动注入全局服务
initPuzzle({ x: 525, y: 450 })            // 坐标模式
initPuzzle('.hero-section', 'afterend')    // 流式模式
```
