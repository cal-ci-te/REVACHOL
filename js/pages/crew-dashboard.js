// ！Crew Dashboard 页面入口
// 独立于主应用 SPA 的第二个入口，复用 AppState / EventBus / ComponentManager / ApiClient / ThemeService。
// 单独入口而非复用主 SPA：Dashboard 仅管理员访问，独立打包可避免普通访客为它加载组件与样式。
import { AppState } from '../core/app-state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { ComponentManager } from '../core/component-manager.js';
import { ApiClient } from '../services/api-client.js';
import { ThemeService } from '../services/theme-service.js';
import { crewDashboardComponent } from '../components/crew-dashboard-component.js';
import { crewUsageComponent } from '../components/crew-usage-component.js';

console.log('🚀 [crew-dashboard] 页面入口已加载');

// 补上 Bearer Token 并统一处理 401
// 与主应用保持一致：Dashboard 独立入口无法复用主应用的拦截器实例，此处重复注册一份
ApiClient.useRequestInterceptor((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.options.headers = {
      ...config.options.headers,
      Authorization: `Bearer ${token}`,
    };
  }
  return config;
});
ApiClient.useResponseInterceptor(
  (data) => data,
  async (error) => {
    // 401 视为登录态失效：清掉令牌并广播登出，避免页面停留在半登录状态
    if (error.status === 401) {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
      EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
    }
    return Promise.reject(error);
  }
);

// 从 localStorage 恢复登录状态
if (localStorage.getItem('auth_token')) {
  AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
}

ThemeService.init();

// 按 crew-dashboard → crew-usage 顺序串行挂载
// usage 组件依赖 dashboard 先建好容器 #crewUsageContainer，故不能并行
ComponentManager
  .register(crewDashboardComponent)
  .register(crewUsageComponent)
  .initComponent('crew-dashboard')
  .then((ok) => {
    if (!ok) throw new Error('crew-dashboard 组件初始化失败');
    return ComponentManager.mountComponent('crew-dashboard');
  })
  .then((ok) => {
    if (!ok) throw new Error('crew-dashboard 组件挂载失败');
    console.log('[crew-dashboard] 组件已就绪');
    return ComponentManager.initComponent('crew-usage');
  })
  .then((ok) => {
    if (!ok) throw new Error('crew-usage 组件初始化失败');
    return ComponentManager.mountComponent('crew-usage');
  })
  .then((ok) => {
    if (!ok) throw new Error('crew-usage 组件挂载失败');
    console.log('[crew-usage] Token 消耗仪表盘已就绪');
  })
  .catch((err) => {
    console.error('[crew-dashboard] 启动失败:', err);
    // 兜底渲染错误文案：链式 then 中断时页面会是空白，用户无从判断失败原因
    const root = document.getElementById('crewDashboardRoot');
    if (root) {
      root.innerHTML = `<div class="crew-dashboard-error">启动失败：${err.message || err}</div>`;
    }
  });

// 页面卸载时释放 WebSocket 与订阅
window.addEventListener('beforeunload', () => {
  Promise.all([
    ComponentManager.unmountComponent('crew-dashboard'),
    ComponentManager.unmountComponent('crew-usage'),
  ]).catch(() => {});
});
