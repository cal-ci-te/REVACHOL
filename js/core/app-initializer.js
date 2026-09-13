// ！应用启动编排
// 按依赖拓扑排序初始化各模块，避免手动维护启动顺序。
// 选择自研拓扑排序而非硬编码顺序：新增模块只需声明 dependencies，无需改动启动列表。
import { EventBus } from './event-bus.js';
import { EVENTS } from './event-constants.js';

export const AppInitializer = {
  _modules: [],
  _initialized: false,

  // 登记启动模块
  register: function (name, initFn, dependencies) {
    this._modules.push({
      name: name,
      init: initFn,
      dependencies: dependencies || [],
      loaded: false,
    });
    return this;
  },

  // 启动全部模块
  start: function () {
    if (this._initialized) {
      console.warn('[AppInitializer] 已经启动，跳过');
      return;
    }

    console.log('[AppInitializer] 开始启动应用...');
    const sorted = this._topologicalSort();
    // 逐个 try-catch：单个模块初始化失败不阻断后续模块
    sorted.forEach(function (module) {
      try {
        console.log('[AppInitializer] 初始化模块:', module.name);
        module.init();
        module.loaded = true;
      } catch (e) {
        console.error('[AppInitializer] 模块初始化失败:', module.name, e);
      }
    });
    this._initialized = true;
    console.log('[AppInitializer] 应用启动完成');
    EventBus.emit(EVENTS.APP_STARTED);
  },

  // 按依赖拓扑排序
  _topologicalSort: function () {
    const visited = {};
    const result = [];
    const self = this;

    function visit(name) {
      // 标记 visiting：递归再次遇到同一模块即存在循环依赖
      if (visited[name] === 'visiting') {
        throw new Error('循环依赖检测到: ' + name);
      }
      if (visited[name] === 'visited') return;
      visited[name] = 'visiting';

      const module = self._modules.find(function (m) {
        return m.name === name;
      });
      if (module) {
        module.dependencies.forEach(function (dep) {
          visit(dep);
        });
        result.push(module);
      }
      visited[name] = 'visited';
    }

    this._modules.forEach(function (module) {
      visit(module.name);
    });
    return result;
  },

  // 查询模块状态
  getStatus: function () {
    const status = {};
    this._modules.forEach(function (m) {
      status[m.name] = m.loaded ? '✅' : '⏳';
    });
    return status;
  },
};

