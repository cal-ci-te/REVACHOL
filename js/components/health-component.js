// ！健康监控组件适配
// 把 HealthMonitor 包装成 ComponentManager 标准组件：组件只管启停时机，探测与退避逻辑在 service 层。
import { HealthMonitor } from '../services/health-monitor.js';

export var healthComponent = {
  name: 'health',

  config: {
    dependencies: [],
    desktopOnly: false,
    requiresAuth: false,
  },

  // 初始化监控
  init: async function () {
    HealthMonitor.init();
    console.log('[health-component] init: 监控已初始化');
    return HealthMonitor;
  },

  // 启动自动轮询
  // 延迟 1s 启动：首屏资源与文章请求优先，避免健康探测抢占带宽
  mount: async function (instance) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        if (instance && typeof instance.start === 'function') {
          instance.start();
          console.log('[health-component] mount: 自动轮询已启动');
        }
        resolve(instance);
      }, 1000);
    });
  },

  // 停止监控
  unmount: async function (instance) {
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
      console.log('[health-component] unmount: 监控已停止');
    }
    return instance;
  },
};

export default healthComponent;
