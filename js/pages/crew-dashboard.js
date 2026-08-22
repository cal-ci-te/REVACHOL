// /crew-dashboard 页面入口。
// 独立于主应用 SPA，复用 AppState / EventBus / ComponentManager / ApiClient /
// ThemeService 架构；通过 ComponentManager 注册并挂载 crew-dashboard 组件。
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

// 与主应用一致：自动附加 Bearer Token，401 时清除本地登录态
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
    const root = document.getElementById('crewDashboardRoot');
    if (root) {
      root.innerHTML = `<div class="crew-dashboard-error">启动失败：${err.message || err}</div>`;
    }
  });

window.addEventListener('beforeunload', () => {
  Promise.all([
    ComponentManager.unmountComponent('crew-dashboard'),
    ComponentManager.unmountComponent('crew-usage'),
  ]).catch(() => {});
});
