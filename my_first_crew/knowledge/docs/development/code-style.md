# REVACHOL 代码规范

> 版本：v1.0.0 | 更新：2026-08-04

---

## 版本号管理规范

### 项目版本号

- 项目统一版本号定义在 `package.json` 的 `version` 字段
- 所有版本信息从 `package.json` 读取
- **禁止在组件/模块中定义独立的版本号变量**（如 `_componentVersion`、`VERSION`、`version: 'x.x.x'` 等）

### 变更追踪

- 所有变更通过项目整体 CHANGELOG 追踪
- 组件级别的变更在 CHANGELOG 中按子标题分类记录
- 代码内注释描述功能变更即可，不需要标注版本号

### 为什么这样做

1. 项目是单体应用，不是组件库，无需独立版本号
2. 减少维护认知负担（单一版本号来源）
3. 避免版本号不一致的混乱
4. CHANGELOG 已足够承载组件级变更信息

### 正确做法

如需在代码中获取项目版本号（如日志输出），统一从 `package.json` 读取：

```javascript
// 方式一：Vite 环境变量（前端）
const version = import.meta.env.npm_package_version || '0.0.0';

// 方式二：后端
const { version } = require('../package.json');
```

### 错误示例

```javascript
// ❌ 禁止
const VERSION = '1.2.0';
const _componentVersion = '2.0.0';
export default { config: { version: '1.0.0' } };
```

---

## 事件命名规范

- 使用 `域:动作` 格式（如 `article:visibility-changed`、`auth:logged-in`）
- 事件常量定义在 `js/core/event-constants.js` 的 `EVENTS` 对象中
- 模块间通信通过 `EventBus.emit()` / `EventBus.on()`，不直接调用对方的方法

---

## 状态管理规范

- 全局状态通过 `AppState.commit(mutation, payload)` 修改
- 状态订阅通过 `AppState.subscribe(key, callback)`
- 不允许直接修改 `AppState._state` 对象

---

## 文件引用

- 使用相对路径 import（如 `../core/event-bus.js`）
- 不依赖路径别名（项目未配置 alias）
- ESM 导入必须包含 `.js` 后缀

---

## 注释规范

本项目注释统一为「三层结构 + 只写为什么」，权威样例见 `js/core/event-bus.js`。

### 形式要求

- 仅使用语言自身的行注释：JS/TS/CSS 用 `//`，Python 用 `#`
- **禁止**块注释与 JSDoc（`/* */`、`/** */`）、分隔线（`// =====`）、emoji、作者/日期/修改记录/@author/@param/@returns
- 中文注释；标识符、API 名、报错文案保持英文；句末使用全角标点（：，。）；代码片段内保持英文标点

### 三层结构

1. **模块头**（文件顶部，第一行固定为 `// ！<模块定位>`）：说明模块是什么、为什么存在
2. **成员标签**（函数/类/常量上方）：动宾短语 ≤12 字，**不加句末标点**
3. **决策理由**（贴近关键代码）：
   - 有取舍时：`选择 A 而非 B：<理由>`
   - 有约束/坑时：`<做法>：<后果或约束>`

一行写不下就换行续写，不要写超长行，也不要用行尾注释。

### 只写为什么

只解释「为什么这样做」与「约束」，不复述「代码做了什么」。自检方法：若没有这条注释，读者会不会卡住或改错？不会就不写。对照 `js/core/event-bus.js` 中 `once`、`clear` 没有任何注释——这是正确示范。

### 正确示例

```javascript
// ！模块内通信
// 发布-订阅事件总线。用于跨模块松耦合通信（如登录→UI刷新、可见性变更→目录树更新）。
// 选择自研而非使用 CustomEvent/DOM 事件：避免 DOM 依赖，保持纯数据流，便于单元测试。
export const EventBus = {
  // 登记事件
  on(eventName, callback) { ... },
  // 取消登记事件
  off(eventName, callback) { ... },
  emit(eventName, data) {
    if (!this._events[eventName]) return;
    // 逐个 try-catch：确保一个回调报错不影响其他回调执行
    ...
  },
  once(eventName, callback) { ... },
  clear() { this._events = {}; return this; },
};
```

### 错误示例

以下为项目真实代码中已清理的反例：

```javascript
// ❌ 版本变更记录混入模块头（违反「不标注版本号、不写修改记录」）
// 组件统一管理器 — 为所有自定义组件提供统一的生命周期、状态追踪、错误隔离。
// v1.1.0 — 新增：超时保护、remount、updateComponent、updateConfig……

// ❌ JSDoc 逐参数翻译（违反「禁止 @param/@returns、禁止复述」）
/**
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的 HTML 字符串
 */
export function escapeHtml(text) { ... }

// ❌ 空 catch 使用块注释（违反「仅允许行注释」）
try { EventBus.off(name, cb); } catch (e) { /* ignore */ }
```

---

*本文档随项目规范演进持续更新。*
