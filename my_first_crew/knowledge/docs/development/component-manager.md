# 组件统一管理系统（ComponentManager）

> 版本：v1.0.0 | 更新：2026-08-04

---

## 1. 架构设计说明

### 1.1 设计目标

REVACHOL 项目包含多个交互/装饰组件（贴纸系统、拼图、魔法箱子、健康监控），且后续将持续增加更多组件。`ComponentManager` 是这些组件的统一管理层，提供：

1. **统一注册**：所有组件通过 `ComponentManager.register()` 接入，无需修改 `app.js` 的初始化逻辑
2. **统一生命周期**：`register` → `init` → `mount` → `unmount` 四阶段模型
3. **统一状态追踪**：`registered` / `initialized` / `mounted` / `unmounted` / `error`
4. **错误隔离**：单个组件的 init/mount/unmount 失败不影响其他组件
5. **拓扑排序**：按依赖关系自动决定初始化和挂载顺序

### 1.2 生命周期模型

```
register() ──→ [registered]
                  │
              initAll() / initComponent()
                  │
                  ▼
             [initialized]
                  │
              mountAll() / mountComponent()
                  │
                  ▼
              [mounted] ←── update() 可在此阶段反复调用
                  │
              unmountAll() / unmountComponent()
                  │
                  ▼
             [unmounted]
```

任何阶段失败时进入 `[error]` 状态，保留错误信息，不影响其他组件。

### 1.3 组件描述符规范

```javascript
{
  name: 'string',              // 唯一标识，注册后不可更改
  config: {
    dependencies: ['string'],  // 依赖的其他组件名（拓扑排序依据）
    desktopOnly: boolean,      // 是否仅桌面端可用（移动端自动跳过 mount）
    requiresAuth: boolean,     // 是否需要管理员权限
  },
  init: async () => instance,           // 初始化（加载数据、检测环境）
  mount: async (instance) => instance,  // 挂载到 DOM
  unmount: async (instance) => instance,// 清理资源
  update: async (instance, payload) => instance, // 动态更新（可选）
}
```

- 所有生命周期钩子均为**异步函数**，接收上一阶段的返回值作为参数
- `init` 返回的 `instance` 会传递到 `mount` → `update` → `unmount`
- 任何钩子抛出的异常都会被捕获并记录，不会阻断其他组件

---

## 2. 如何注册新组件

### 2.1 创建适配器文件

在 `js/components/` 下新建文件，例如 `my-component.js`：

```javascript
// js/components/my-component.js
export const myComponent = {
  name: 'my-component',                // 必须：唯一名称

  config: {
    dependencies: [],                   // 留空表示无依赖
    desktopOnly: false,
    requiresAuth: false,
  },

  async init() {
    console.log('[my-component] init');
    // 加载数据、检测环境...
    return { ready: true };            // 返回实例（会传给 mount）
  },

  async mount(instance) {
    console.log('[my-component] mount');
    // 创建 DOM、绑定事件...
    instance.element = document.createElement('div');
    document.body.appendChild(instance.element);
    return instance;
  },

  async unmount(instance) {
    console.log('[my-component] unmount');
    // 清理 DOM、移除事件...
    if (instance.element) {
      instance.element.remove();
    }
    return instance;
  },

  // 可选：动态更新
  async update(instance, payload) {
    console.log('[my-component] update:', payload);
    return instance;
  },
};

export default myComponent;
```

### 2.2 注册到管理器

**方式一：在 `app.js` 中注册（推荐，适用于常驻组件）**

```javascript
// js/app.js
import { myComponent } from './components/my-component.js';

ComponentManager.register(myComponent);
```

**方式二：动态懒加载（适用于条件性启用的组件）**

```javascript
// 在需要的时候动态加载
await ComponentManager.loadComponent('my-component', './components/my-component.js');
await ComponentManager.initComponent('my-component');
await ComponentManager.mountComponent('my-component');
```

### 2.3 创建无需适配器的新组件

如果组件本身已符合描述符格式，可以直接注册：

```javascript
ComponentManager.register({
  name: 'simple-greeter',
  config: { dependencies: [] },
  async init() { return { msg: 'Hello' }; },
  async mount(inst) { console.log(inst.msg); return inst; },
  async unmount(inst) { return inst; },
});
```

---

## 3. 如何适配现有组件

### 3.1 适配模式

现有组件（如 `DecoShelf`、`HealthMonitor`）并非按照 ComponentManager 描述符格式编写。适配器的作用是**桥接**——将现有 API 映射到标准生命周期钩子。

```javascript
// 适配器模式示例
export const existingComponentAdapter = {
  name: 'existing-component',
  config: { dependencies: [], ... },

  async init() {
    // 桥接：调用现有组件的初始化方法
    await ExistingService.initialize();
    return ExistingService; // 返回现有服务实例
  },

  async mount(service) {
    // 桥接：调用现有组件的挂载方法
    service.render();
    return service;
  },

  async unmount(service) {
    // 桥接：调用现有组件的清理方法
    service.destroy();
    return service;
  },
};
```

### 3.2 现有适配器参考

| 适配器文件 | 包装的组件 | 关键桥接 |
|-----------|-----------|---------|
| `js/components/deco-component.js` | `DecoShelf` | `loadLibrary()` → `_renderAllDecos()` |
| `js/components/puzzle-component.js` | `Puzzle` (initPuzzle) | 移动端检测 → `initPuzzle()` → `destroy()` |
| `js/components/magic-box-component.js` | `BoxManager` | `new BoxManager()` → `init()` → 事件清理 |
| `js/components/health-component.js` | `HealthMonitor` | `init()` → `start()` → `destroy()` |

---

## 4. 调试组件状态

### 4.1 浏览器控制台

```javascript
// 查看所有组件状态
window.__REVACHOL__.ComponentManager.getAllStates()
// 输出: { deco: {state:'mounted',...}, puzzle: {state:'mounted',...}, ... }

// 查看状态摘要
window.__REVACHOL__.ComponentManager.getSummary()
// 输出: { total: 4, registered: 0, initialized: 0, mounted: 4, ... }

// 获取单个组件详情
window.__REVACHOL__.ComponentManager.getState('puzzle')
// 输出: { name, state, dependencies, metrics: {initMs, mountMs}, error, ... }

// 手动触发生命周期
await window.__REVACHOL__.ComponentManager.unmountComponent('puzzle')
await window.__REVACHOL__.ComponentManager.mountComponent('puzzle')
```

### 4.2 事件监听

所有生命周期变更都通过 EventBus 广播，可在控制台监听：

```javascript
// 监听组件错误
EventBus.on('component:error', ({name, phase, error}) => {
  console.error(`组件 ${name} 在 ${phase} 阶段失败:`, error);
});

// 监听全部就绪
EventBus.on('component:all-ready', ({summary}) => {
  console.log('所有组件就绪:', summary);
});
```

### 4.3 日志前缀

所有 ComponentManager 日志使用 `[ComponentManager]` 前缀，可在控制台过滤：
- `✅` — 操作成功
- `❌` — 操作失败
- `⚠️` — 警告（如循环依赖）

---

## 5. 互动引擎预留接口

### 5.1 接口说明

`ComponentManager` 预留了三个互动引擎接口，当前为空实现（不报错），供后续"一条龙互动引擎"集成使用：

```javascript
// 创建互动配置（存储到队列）
ComponentManager.createInteractive({
  name: 'unlock-secret-door',
  type: 'state-gate',         // 状态门
  trigger: 'item:acquired',   // 触发事件
  conditions: { item: 'key' },// 触发条件
  actions: ['show:hidden-article'], // 触发后的行为
});

// 获取所有已存储的互动配置
ComponentManager.getInteractiveConfigs();

// 渲染互动引擎（后续实现）
ComponentManager.renderInteractive();

// 启用/禁用互动引擎
ComponentManager.setInteractiveEnabled(true);
```

### 5.2 与未来互动引擎的集成方式

当互动引擎实现后，`ComponentManager` 会作为其配置输入源。互动引擎读取 `_interactiveConfigs` 队列，根据配置自动创建互动组件实例。预留的接口签名保持不变，内部实现替换为：

```javascript
// 未来实现（示意）
createInteractive(config) {
  const engine = this._interactionEngine;
  if (!engine) {
    this._interactiveConfigs.push(config); // 推迟到引擎就绪
    return this;
  }
  engine.register(config); // 直接注册到引擎
  return this;
}
```

---

## 6. 测试验证清单

### 6.1 基础验证

- [ ] 所有 4 个组件能正常注册（控制台输出 `[ComponentManager] 组件已注册:` 4 行）
- [ ] 页面加载后所有组件自动初始化和挂载（`initAll` / `mountAll` 日志）
- [ ] 通过 `window.__REVACHOL__.ComponentManager.getAllStates()` 可查看完整状态
- [ ] `getSummary()` 返回 `{ total: 4, mounted: 4 }`（桌面端）

### 6.2 错误隔离验证

在控制台中手动触发单个组件失败：
```javascript
// 模拟：将 puzzle 组件的 mount 钩子改为抛异常
const cm = window.__REVACHOL__.ComponentManager;
const entry = cm._registry.get('puzzle');
const orig = entry.hooks.mount;
entry.hooks.mount = () => { throw new Error('模拟失败'); };

// 重新挂载 puzzle（预期：puzzle 失败，其他组件正常）
await cm.unmountComponent('puzzle');
await cm.mountComponent('puzzle');
// 检查其他组件是否依然 mounted
cm.getAllStates();
// 恢复
entry.hooks.mount = orig;
```

### 6.3 移动端验证

- [ ] 移动端视口（≤768px）下 `puzzle` 和 `magic-box` 自动跳过挂载
- [ ] `deco` 和 `health` 在移动端正常挂载

### 6.4 清理验证

- [ ] 关闭页面时 `beforeunload` 触发 `unmountAll()`
- [ ] 控制台输出 `[ComponentManager] ✅ 卸载成功:` 4 行

### 6.5 互动引擎接口验证

```javascript
const cm = window.__REVACHOL__.ComponentManager;

// 创建互动配置（不应报错）
cm.createInteractive({ name: 'test-gate', type: 'state-gate' });
cm.createInteractive({ name: 'test-dialogue', type: 'dialogue' });

// 读取
console.log(cm.getInteractiveConfigs()); // 输出 2 条配置

// 渲染（应输出警告但不报错）
cm.renderInteractive();

// 清空
cm.clearInteractiveConfigs();
console.log(cm.getInteractiveConfigs()); // 输出 []
```

---

## 7. 文件清单

| 文件 | 说明 | 行数 |
|------|------|:--:|
| `js/core/component-manager.js` | 核心管理器（注册/生命周期/拓扑排序/错误隔离/互动引擎预留） | ~420 |
| `js/components/deco-component.js` | 贴纸系统适配器 | ~55 |
| `js/components/puzzle-component.js` | 拼图组件适配器 | ~55 |
| `js/components/magic-box-component.js` | 魔法箱子适配器 | ~60 |
| `js/components/health-component.js` | 健康监控适配器 | ~40 |
| `js/core/event-constants.js` | 新增 7 个 `COMPONENT_*` 事件常量 | +9 |
| `js/utils/ui-strings.js` | 新增 `componentManager` 文案对象（27 个字符串） | +27 |
| `js/app.js` | 集成 ComponentManager 注册 + initAll + mountAll + beforeunload | +30 |

---

## 8. 扩展指南 — 新增组件步骤

```
1. 创建 js/components/new-component.js
2. 按描述符规范实现 init / mount / unmount 钩子
3. 在 app.js 中添加 import 和 ComponentManager.register(newComponent)
4. 在 ui-strings.js 中添加文案（如需要）
5. 在 event-constants.js 中添加专属事件（如需要）
6. 刷新页面验证
```

没有其他步骤。不需要修改 bootstrap、路由或后端代码。

---

*本文档随 ComponentManager 版本更新而维护。最新版本以仓库中的 `docs/development/component-manager.md` 为准。*
