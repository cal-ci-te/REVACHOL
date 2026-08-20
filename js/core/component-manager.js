// 组件统一管理器 — 为所有自定义组件提供统一的生命周期、状态追踪、错误隔离。
// v1.1.0 — 新增：超时保护、remount、updateComponent、updateConfig、EventBus 自动清理、
//         COMPONENT_ALL_INITIALIZED 事件、拓扑排序缓存、同步卸载路径。
//
// 设计目标：
//   1. 统一注册：所有交互/装饰组件通过 ComponentManager.register() 接入。
//   2. 统一生命周期：register → init → mount → unmount，阶段化执行。
//   3. 统一状态追踪：registered / initialized / mounted / unmounted / error。
//   4. 错误隔离：单个组件的 init/mount/unmount 失败不影响其他组件。
//   5. 预留互动引擎接口：createInteractive / renderInteractive（后续实现）。
//
// 组件描述符规范：
//   {
//     name: string,                   // 唯一标识
//     config: {
//       dependencies: string[],       // 依赖的其他组件名
//       desktopOnly: boolean,         // 是否仅桌面端可用
//       requiresAuth: boolean,        // 是否需要管理员权限
//       initTimeout: number,          // init 超时 (ms)，默认 15000
//       mountTimeout: number,         // mount 超时 (ms)，默认 10000
//       unmountTimeout: number,       // unmount 超时 (ms)，默认 5000
//       debug: boolean,               // 开启详细日志
//     },
//     init: async () => instance,      // 初始化（加载数据、检测环境）返回实例
//     mount: async (instance) => instance, // 挂载到 DOM 返回实例
//     unmount: async (instance) => instance, // 清理资源返回实例
//     update: async (instance, payload) => instance, // 动态更新（可选）
//   }
//
// 注意：组件不需要独立版本号。版本号统一由 package.json 管理，变更追踪在 CHANGELOG 记录。

import { EventBus } from './event-bus.js';
import { EVENTS } from './event-constants.js';

const DEFAULTS = {
  initTimeout: 15000,    // init 钩子超时 15s
  mountTimeout: 10000,   // mount 钩子超时 10s
  unmountTimeout: 5000,  // unmount 钩子超时 5s
};

const STATE_LABELS = {
  registered: '已注册',
  initialized: '已初始化',
  mounted: '已挂载',
  unmounted: '已卸载',
  error: '错误',
};

/**
 * 创建带超时控制的 Promise 包装。
 * @param {Promise} promise — 原始 Promise
 * @param {number} ms — 超时毫秒数
 * @param {string} label — 超时错误描述
 * @returns {Promise}
 */
function withTimeout(promise, ms, label) {
  if (!ms || ms <= 0) return promise;
  return new Promise(function (resolve, reject) {
    const timer = setTimeout(function () {
      reject(new Error(label || '操作超时 (' + ms + 'ms)'));
    }, ms);
    promise.then(function (result) {
      clearTimeout(timer);
      resolve(result);
    }).catch(function (err) {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export var ComponentManager = {
  _registry: new Map(),
  _interactiveConfigs: [],
  _interactiveEnabled: false,
  _sortedOrder: null,
  _dirty: true,
  _eventTokens: new Map(),  // name → [{ eventName, callback }]

  // =========================================================================
  //  注册
  // =========================================================================

  register: function (descriptor) {
    if (!descriptor || !descriptor.name) {
      console.error('[ComponentManager] register: 缺少 name 字段');
      return this;
    }

    const name = descriptor.name;

    if (this._registry.has(name)) {
      console.warn('[ComponentManager] 组件已注册，跳过:', name);
      return this;
    }

    const config = descriptor.config || {};
    const entry = {
      name: name,
      config: {
        dependencies: Array.isArray(config.dependencies) ? config.dependencies : [],
        desktopOnly: !!config.desktopOnly,
        requiresAuth: !!config.requiresAuth,
      },
      instance: null,
      state: 'registered',
      error: null,
      lastStateChange: Date.now(),
      hooks: {
        init: descriptor.init || null,
        mount: descriptor.mount || null,
        unmount: descriptor.unmount || null,
        update: descriptor.update || null,
      },
      options: {
        initTimeout: (config.initTimeout != null ? config.initTimeout : DEFAULTS.initTimeout),
        mountTimeout: (config.mountTimeout != null ? config.mountTimeout : DEFAULTS.mountTimeout),
        unmountTimeout: (config.unmountTimeout != null ? config.unmountTimeout : DEFAULTS.unmountTimeout),
        debug: !!config.debug,
      },
      metrics: { initMs: null, mountMs: null, unmountMs: null },
    };

    this._registry.set(name, entry);
    this._dirty = true;

    console.log('[ComponentManager] 组件已注册:', name,
      entry.config.desktopOnly ? '(仅桌面端)' : '',
      entry.config.dependencies.length > 0 ? '依赖: ' + entry.config.dependencies.join(', ') : '');

    EventBus.emit(EVENTS.COMPONENT_REGISTERED, { name: name, config: entry.config });
    return this;
  },

  trackEvents: function (name, tokens) {
    if (!tokens || !Array.isArray(tokens)) return this;
    if (!this._eventTokens.has(name)) this._eventTokens.set(name, []);
    tokens.forEach(function (t) { this._eventTokens.get(name).push(t); }, this);
    return this;
  },

  // =========================================================================
  //  批量操作
  // =========================================================================

  initAll: async function (options) {
    const filter = options && options.filter ? new Set(options.filter) : null;
    const force = options && options.force;
    const order = this._getTopologicalOrder();
    const results = { success: 0, failed: 0, skipped: 0, details: [] };

    console.log('[ComponentManager] initAll 开始，共 ' + order.length + ' 个组件');

    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      if (filter && !filter.has(name)) continue;
      const entry = this._registry.get(name);
      if (!entry) continue;
      if (!force && entry.state !== 'registered') {
        results.skipped++;
        results.details.push({ name: name, ok: null, skipped: true });
        continue;
      }
      const ok = await this._tryInit(entry);
      results.details.push({ name: name, ok: ok });
      ok ? results.success++ : results.failed++;
    }

    console.log('[ComponentManager] initAll 完成: 成功 ' + results.success +
      ', 失败 ' + results.failed + ', 跳过 ' + results.skipped);

    EventBus.emit(EVENTS.COMPONENT_ALL_INITIALIZED, {
      summary: this.getSummary(),
      details: results,
    });

    return results;
  },

  mountAll: async function (options) {
    const filter = options && options.filter ? new Set(options.filter) : null;
    const order = this._getTopologicalOrder();
    const results = { success: 0, failed: 0, skipped: 0, details: [] };

    console.log('[ComponentManager] mountAll 开始');

    for (let i = 0; i < order.length; i++) {
      const name = order[i];
      if (filter && !filter.has(name)) continue;
      const entry = this._registry.get(name);
      if (!entry || entry.state !== 'initialized') {
        if (entry) results.skipped++;
        continue;
      }

      if (entry.config.desktopOnly && this._isMobile()) {
        console.log('[ComponentManager] 移动端跳过挂载:', name);
        entry.state = 'unmounted';
        entry.lastStateChange = Date.now();
        results.details.push({ name: name, ok: true, skipped: 'mobile' });
        results.skipped++;
        continue;
      }

      const ok = await this._tryMount(entry);
      results.details.push({ name: name, ok: ok });
      ok ? results.success++ : results.failed++;
    }

    console.log('[ComponentManager] mountAll 完成: 成功 ' + results.success +
      ', 失败 ' + results.failed + ', 跳过 ' + results.skipped);

    EventBus.emit(EVENTS.COMPONENT_ALL_READY, {
      summary: this.getSummary(),
      details: results,
    });

    return results;
  },

  unmountAll: async function (options) {
    const filter = options && options.filter ? new Set(options.filter) : null;
    const useSync = options && options.sync;
    const self = this;

    const entries = [];
    this._registry.forEach(function (entry) {
      if (entry.state === 'mounted' || entry.state === 'error') entries.push(entry);
    });
    entries.reverse();

    const results = { success: 0, failed: 0, details: [] };

    console.log('[ComponentManager] unmountAll 开始 (' + (useSync ? '同步' : '异步') + '模式)');

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (filter && !filter.has(entry.name)) continue;

      EventBus.emit(EVENTS.COMPONENT_BEFORE_DESTROY, { name: entry.name });
      self._autoCleanupEvents(entry.name);

      var ok;
      if (useSync) {
        ok = self._tryUnmountSync(entry);
      } else {
        ok = await self._tryUnmount(entry);
      }
      results.details.push({ name: entry.name, ok: ok });
      ok ? results.success++ : results.failed++;
    }

    console.log('[ComponentManager] unmountAll 完成: 成功 ' + results.success +
      ', 失败 ' + results.failed);
    return results;
  },

  updateAll: async function (payload) {
    const entries = [];
    this._registry.forEach(function (entry) {
      if (entry.state === 'mounted') entries.push(entry);
    });
    const results = { success: 0, failed: 0 };

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (typeof entry.hooks.update === 'function') {
        try {
          entry.instance = await entry.hooks.update(entry.instance, payload);
          console.log('[ComponentManager] update:', entry.name);
          results.success++;
        } catch (err) {
          console.error('[ComponentManager] update 失败:', entry.name, err);
          results.failed++;
        }
      }
    }
    return results;
  },

  // =========================================================================
  //  单个操作
  // =========================================================================

  initComponent: async function (name) {
    const entry = this._registry.get(name);
    if (!entry || entry.state !== 'registered') {
      console.warn('[ComponentManager] initComponent: 无法初始化', name);
      return false;
    }
    return this._tryInit(entry);
  },

  mountComponent: async function (name) {
    const entry = this._registry.get(name);
    if (!entry || entry.state !== 'initialized') {
      console.warn('[ComponentManager] mountComponent: 无法挂载', name);
      return false;
    }
    if (entry.config.desktopOnly && this._isMobile()) {
      console.log('[ComponentManager] 移动端跳过挂载:', name);
      entry.state = 'unmounted';
      entry.lastStateChange = Date.now();
      return true;
    }
    return this._tryMount(entry);
  },

  unmountComponent: async function (name) {
    const entry = this._registry.get(name);
    if (!entry || (entry.state !== 'mounted' && entry.state !== 'error')) {
      console.warn('[ComponentManager] unmountComponent: 无法卸载', name);
      return false;
    }
    EventBus.emit(EVENTS.COMPONENT_BEFORE_DESTROY, { name: name });
    this._autoCleanupEvents(name);
    return this._tryUnmount(entry);
  },

  remountComponent: async function (name) {
    const entry = this._registry.get(name);
    if (!entry || entry.state !== 'unmounted') {
      console.warn('[ComponentManager] remountComponent: 状态不允许:', name,
        entry ? entry.state : '不存在');
      return false;
    }

    entry.state = 'registered';
    entry.error = null;
    entry.instance = null;
    entry.lastStateChange = Date.now();

    const initOk = await this._tryInit(entry);
    if (!initOk) return false;

    if (entry.config.desktopOnly && this._isMobile()) {
      entry.state = 'unmounted';
      entry.lastStateChange = Date.now();
      console.log('[ComponentManager] remountComponent: 移动端跳过挂载:', name);
      return true;
    }

    return this._tryMount(entry);
  },

  updateConfig: function (name, partialConfig) {
    const entry = this._registry.get(name);
    if (!entry) {
      console.warn('[ComponentManager] updateConfig: 组件不存在:', name);
      return false;
    }
    if (!partialConfig) return false;

    if (partialConfig.desktopOnly !== undefined) entry.config.desktopOnly = !!partialConfig.desktopOnly;
    if (partialConfig.requiresAuth !== undefined) entry.config.requiresAuth = !!partialConfig.requiresAuth;
    if (partialConfig.dependencies !== undefined) {
      entry.config.dependencies = Array.isArray(partialConfig.dependencies)
        ? partialConfig.dependencies : [];
      this._dirty = true;
    }
    if (partialConfig.initTimeout !== undefined) entry.options.initTimeout = partialConfig.initTimeout;
    if (partialConfig.mountTimeout !== undefined) entry.options.mountTimeout = partialConfig.mountTimeout;
    if (partialConfig.unmountTimeout !== undefined) entry.options.unmountTimeout = partialConfig.unmountTimeout;
    if (partialConfig.debug !== undefined) entry.options.debug = !!partialConfig.debug;

    console.log('[ComponentManager] updateConfig:', name, partialConfig);
    EventBus.emit(EVENTS.COMPONENT_CONFIG_CHANGED, { name: name, config: Object.assign({}, entry.config) });
    return true;
  },

  updateComponent: async function (name, payload) {
    const entry = this._registry.get(name);
    if (!entry || entry.state !== 'mounted') {
      console.warn('[ComponentManager] updateComponent: 组件不可更新:', name);
      return false;
    }
    if (typeof entry.hooks.update !== 'function') return false;

    try {
      entry.instance = await entry.hooks.update(entry.instance, payload);
      console.log('[ComponentManager] updateComponent:', name);
      return true;
    } catch (err) {
      console.error('[ComponentManager] updateComponent 失败:', name, err);
      return false;
    }
  },

  // =========================================================================
  //  查询
  // =========================================================================

  getComponent: function (name) {
    const entry = this._registry.get(name);
    return entry ? entry.instance : null;
  },

  getState: function (name) {
    const entry = this._registry.get(name);
    if (!entry) return null;
    return {
      name: entry.name,
      state: entry.state,
      stateLabel: STATE_LABELS[entry.state] || '未知',
      dependencies: entry.config.dependencies,
      desktopOnly: entry.config.desktopOnly,
      requiresAuth: entry.config.requiresAuth,
      error: entry.error,
      lastStateChange: entry.lastStateChange,
      metrics: Object.assign({}, entry.metrics),
    };
  },

  getAllStates: function () {
    const result = {};
    this._registry.forEach(function (entry, name) {
      result[name] = ComponentManager.getState(name);
    });
    return result;
  },

  getSummary: function () {
    let registered = 0, initialized = 0, mounted = 0, unmounted = 0, error = 0;
    this._registry.forEach(function (entry) {
      switch (entry.state) {
        case 'registered': registered++; break;
        case 'initialized': initialized++; break;
        case 'mounted': mounted++; break;
        case 'unmounted': unmounted++; break;
        case 'error': error++; break;
      }
    });
    return { total: this._registry.size, registered: registered, initialized: initialized,
      mounted: mounted, unmounted: unmounted, error: error };
  },

  has: function (name) { return this._registry.has(name); },

  loadComponent: async function (name, modulePath) {
    if (this._registry.has(name)) {
      console.warn('[ComponentManager] loadComponent: 组件已存在:', name);
      return false;
    }
    try {
      const mod = await import(modulePath);
      const descriptor = mod.default || mod[name + 'Component'] || mod[name];
      if (!descriptor || !descriptor.name) {
        console.error('[ComponentManager] loadComponent: 模块未导出有效组件描述符:', modulePath);
        return false;
      }
      this.register(descriptor);
      return true;
    } catch (err) {
      console.error('[ComponentManager] loadComponent: 动态加载失败:', modulePath, err);
      return false;
    }
  },

  reset: function () {
    this._registry.clear();
    this._interactiveConfigs = [];
    this._interactiveEnabled = false;
    this._sortedOrder = null;
    this._dirty = true;
    this._eventTokens.clear();
    console.log('[ComponentManager] 已重置');
    return this;
  },

  // =========================================================================
  //  内部 — 生命周期执行
  // =========================================================================

  _tryInit: async function (entry) {
    if (typeof entry.hooks.init !== 'function') {
      entry.state = 'initialized';
      entry.lastStateChange = Date.now();
      EventBus.emit(EVENTS.COMPONENT_INITIALIZED, { name: entry.name });
      return true;
    }

    const start = performance.now();
    try {
      if (entry.options.debug) console.log('[ComponentManager] 初始化组件:', entry.name);
      const promise = entry.hooks.init();
      entry.instance = entry.options.initTimeout
        ? await withTimeout(promise, entry.options.initTimeout,
            'init 超时 (' + entry.options.initTimeout + 'ms)')
        : await promise;
      entry.state = 'initialized';
      entry.lastStateChange = Date.now();
      entry.metrics.initMs = Math.round(performance.now() - start);
      console.log('[ComponentManager] ✅ 初始化成功:', entry.name,
        '(' + entry.metrics.initMs + 'ms)');
      EventBus.emit(EVENTS.COMPONENT_INITIALIZED,
        { name: entry.name, instance: entry.instance });
      return true;
    } catch (err) {
      entry.state = 'error';
      entry.error = err.message || String(err);
      entry.lastStateChange = Date.now();
      entry.metrics.initMs = Math.round(performance.now() - start);
      console.error('[ComponentManager] ❌ 初始化失败:', entry.name, err);
      EventBus.emit(EVENTS.COMPONENT_ERROR,
        { name: entry.name, phase: 'init', error: entry.error });
      return false;
    }
  },

  _tryMount: async function (entry) {
    if (typeof entry.hooks.mount !== 'function') {
      entry.state = 'mounted';
      entry.lastStateChange = Date.now();
      EventBus.emit(EVENTS.COMPONENT_MOUNTED, { name: entry.name });
      return true;
    }

    const start = performance.now();
    try {
      if (entry.options.debug) console.log('[ComponentManager] 挂载组件:', entry.name);
      const promise = entry.hooks.mount(entry.instance);
      entry.instance = entry.options.mountTimeout
        ? await withTimeout(promise, entry.options.mountTimeout,
            'mount 超时 (' + entry.options.mountTimeout + 'ms)')
        : await promise;
      entry.state = 'mounted';
      entry.lastStateChange = Date.now();
      entry.metrics.mountMs = Math.round(performance.now() - start);
      console.log('[ComponentManager] ✅ 挂载成功:', entry.name,
        '(' + entry.metrics.mountMs + 'ms)');
      EventBus.emit(EVENTS.COMPONENT_MOUNTED,
        { name: entry.name, instance: entry.instance });
      return true;
    } catch (err) {
      entry.state = 'error';
      entry.error = err.message || String(err);
      entry.lastStateChange = Date.now();
      entry.metrics.mountMs = Math.round(performance.now() - start);
      console.error('[ComponentManager] ❌ 挂载失败:', entry.name, err);
      EventBus.emit(EVENTS.COMPONENT_ERROR,
        { name: entry.name, phase: 'mount', error: entry.error });
      return false;
    }
  },

  _tryUnmount: async function (entry) {
    this._cleanupErrorState(entry);

    if (typeof entry.hooks.unmount !== 'function') {
      entry.state = 'unmounted';
      entry.instance = null;
      entry.lastStateChange = Date.now();
      EventBus.emit(EVENTS.COMPONENT_UNMOUNTED, { name: entry.name });
      return true;
    }

    const start = performance.now();
    try {
      if (entry.options.debug) console.log('[ComponentManager] 卸载组件:', entry.name);
      const promise = entry.hooks.unmount(entry.instance);
      await (entry.options.unmountTimeout
        ? withTimeout(promise, entry.options.unmountTimeout,
            'unmount 超时 (' + entry.options.unmountTimeout + 'ms)')
        : promise);
      entry.state = 'unmounted';
      entry.instance = null;
      entry.error = null;
      entry.lastStateChange = Date.now();
      entry.metrics.unmountMs = Math.round(performance.now() - start);
      console.log('[ComponentManager] ✅ 卸载成功:', entry.name,
        '(' + entry.metrics.unmountMs + 'ms)');
      EventBus.emit(EVENTS.COMPONENT_UNMOUNTED, { name: entry.name });
      return true;
    } catch (err) {
      entry.state = 'error';
      entry.error = err.message || String(err);
      entry.lastStateChange = Date.now();
      entry.metrics.unmountMs = Math.round(performance.now() - start);
      console.error('[ComponentManager] ❌ 卸载失败:', entry.name, err);
      EventBus.emit(EVENTS.COMPONENT_ERROR,
        { name: entry.name, phase: 'unmount', error: entry.error });
      return false;
    }
  },

  _tryUnmountSync: function (entry) {
    this._cleanupErrorState(entry);

    if (typeof entry.hooks.unmount !== 'function') {
      entry.state = 'unmounted';
      entry.instance = null;
      entry.lastStateChange = Date.now();
      return true;
    }

    try {
      const result = entry.hooks.unmount(entry.instance);
      if (result && typeof result.then === 'function') {
        result.catch(function (err) {
          console.error('[ComponentManager] unmount 异步错误:', entry.name, err);
        });
      }
      entry.state = 'unmounted';
      entry.instance = null;
      entry.error = null;
      entry.lastStateChange = Date.now();
      console.log('[ComponentManager] ✅ 同步卸载:', entry.name);
      return true;
    } catch (err) {
      entry.state = 'error';
      entry.error = err.message || String(err);
      entry.lastStateChange = Date.now();
      console.error('[ComponentManager] ❌ 同步卸载失败:', entry.name, err);
      return false;
    }
  },

  _cleanupErrorState: function (entry) {
    if (entry.state === 'error' && typeof entry.hooks.unmount === 'function'
        && entry.instance !== null) {
      try { entry.hooks.unmount(entry.instance); } catch (e) { /* ignore */ }
    }
  },

  _autoCleanupEvents: function (name) {
    const tokens = this._eventTokens.get(name);
    if (!tokens || tokens.length === 0) return;
    tokens.forEach(function (t) {
      try { EventBus.off(t.eventName, t.callback); } catch (e) { /* ignore */ }
    });
    this._eventTokens.delete(name);
    if (tokens.length > 0) {
      console.log('[ComponentManager] 已清理 EventBus 订阅:', name,
        '(' + tokens.length + ' 个)');
    }
  },

  // =========================================================================
  //  内部 — 拓扑排序（带缓存）
  // =========================================================================

  _getTopologicalOrder: function () {
    if (!this._dirty && this._sortedOrder) return this._sortedOrder;

    const names = [];
    this._registry.forEach(function (_, n) { names.push(n); });

    const adj = new Map();
    const inDegree = new Map();

    names.forEach(function (n) { adj.set(n, []); inDegree.set(n, 0); });

    names.forEach(function (n) {
      const entry = this._registry.get(n);
      (entry.config.dependencies || []).forEach(function (dep) {
        if (this._registry.has(dep)) {
          adj.get(dep).push(n);
          inDegree.set(n, (inDegree.get(n) || 0) + 1);
        } else {
          console.warn('[ComponentManager] 依赖不存在:', n, '→', dep);
        }
      }, this);
    }, this);

    const queue = [];
    inDegree.forEach(function (deg, name) {
      if (deg === 0) queue.push(name);
    });

    const result = [];
    while (queue.length > 0) {
      const name = queue.shift();
      result.push(name);
      adj.get(name).forEach(function (neighbor) {
        const newDeg = inDegree.get(neighbor) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      });
    }

    if (result.length < names.length) {
      const unresolved = names.filter(function (n) { return result.indexOf(n) === -1; });
      console.warn('[ComponentManager] ⚠️ 存在循环依赖！已解析:', result.length,
        '/', names.length, '| 未解析:', unresolved.join(', '));
    }

    this._sortedOrder = result;
    this._dirty = false;
    return result;
  },

  _isMobile: function () {
    return window.innerWidth <= 768 ||
      ('ontouchstart' in window) ||
      navigator.maxTouchPoints > 0;
  },

  // =========================================================================
  //  预留 — 一条龙互动引擎接口
  // =========================================================================

  createInteractive: function (config) {
    if (!config || !config.name) {
      console.warn('[ComponentManager] createInteractive: 缺少 name 字段');
      return this;
    }
    this._interactiveConfigs.push(Object.assign({}, config, { created: Date.now() }));
    console.warn('[ComponentManager] 互动引擎未启用，配置已存储:', config.name,
      '(当前队列长度: ' + this._interactiveConfigs.length + ')');
    return this;
  },

  renderInteractive: function () {
    console.warn('[ComponentManager] 互动引擎未启用，请等待实现。' +
      '已存储 ' + this._interactiveConfigs.length + ' 个互动配置。');
    return this;
  },

  getInteractiveConfigs: function () {
    return this._interactiveConfigs.slice();
  },

  setInteractiveEnabled: function (enabled) {
    this._interactiveEnabled = !!enabled;
    console.log('[ComponentManager] 互动引擎:', enabled ? '已启用' : '已禁用');
    return this;
  },

  clearInteractiveConfigs: function () {
    this._interactiveConfigs = [];
    console.log('[ComponentManager] 互动配置队列已清空');
    return this;
  },
};

export default ComponentManager;
