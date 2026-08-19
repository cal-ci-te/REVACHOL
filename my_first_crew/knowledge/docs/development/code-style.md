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

*本文档随项目规范演进持续更新。*
