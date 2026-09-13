// ！管理员认证
// 登录验证已从本地 CONFIG 比对迁移到后端 Token 认证（v1.10）：
//   登录 → POST /api/auth/login 换取 Token 存入 localStorage
//   登出 → POST /api/auth/logout 使 Token 失效并清理本地状态
//   状态恢复 → 检查 localStorage 是否存在 auth_token，有则视为已登录
// 本地仅存 Token 不存凭据：Token 的真实有效性由后端在每次请求时校验。
import { Utils } from '../utils.js';
import { AppState } from '../core/app-state.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { ApiClient } from '../services/api-client.js';
import { AdminAvatar } from './avatar.js';
import { AdminPosition } from './position.js';
import { AdminUI } from './ui.js';
import { AdminEvents } from './events/index.js';
import { DecoShelf } from '../services/deco.js';
import { DecoEdit } from '../services/deco-edit.js';
import { DOMRefs } from '../core/dom-refs.js';
import { UI } from '../utils/ui-strings.js';

export const AdminAuth = {
  // 页面加载时恢复登录状态
  // 只凭 Token 存在即乐观判定为已登录，不在此发起校验请求：避免首屏多一次阻塞往返
  // 顺带清理 v1.9 遗留的 admin_logged_in 标记，防止旧标记让后续逻辑误判
  checkStatus: function () {
    console.log('[AdminAuth] 检查登录状态...');
    const token = localStorage.getItem('auth_token');
    const savedAvatar = AdminAvatar.getAvatarForUser();

    // 位置与折叠态与登录无关，先无条件恢复，保证两种状态下版式一致
    AdminPosition.loadPosition();
    AdminPosition.applyPosition();
    AdminPosition.applyCollapsedState();

    if (token) {
      localStorage.removeItem('admin_logged_in');
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
      if (savedAvatar) {
        AdminAvatar.setAvatarImage(savedAvatar);
      }
      AdminUI.showPanel();
      EventBus.emit(EVENTS.AUTH_LOGGED_IN);
      // 延迟重绑：面板内容渲染为异步，须待其插入 DOM 后再建立事件委托
      setTimeout(function () {
        if (AdminEvents) { AdminEvents.rebind(); }
      }, 200);
      console.log('[AdminAuth] 已登录（Token 有效待后端校验）');
    } else {
      AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
      AdminUI.hidePanel();
      EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
      console.log('[AdminAuth] 未登录');
    }
  },

  // 登录：调用后端 API 校验凭据，成功后存 Token
  // 401 与网络异常统一按失败处理并提示，不向调用方抛错：调用方均为 UI 事件，无更细的处置需求
  login: async function (username, password) {
    console.log('[AdminAuth] 登录请求 → POST /api/auth/login');
    try {
      const result = await ApiClient.post('/api/auth/login', { username, password });
      localStorage.setItem('auth_token', result.token);
      localStorage.setItem('user_role', result.role);
      localStorage.removeItem('admin_logged_in');

      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);

      const savedAvatar = AdminAvatar.getAvatarForUser();
      if (savedAvatar) { AdminAvatar.setAvatarImage(savedAvatar); }

      Utils.showToast(UI.notification.loginSuccess, false);
      AdminUI.showPanel();

      setTimeout(function () {
        if (AdminEvents) { AdminEvents.rebind(); }
      }, 200);

      // 关闭弹窗并清空输入：避免密码明文残留在输入框中
      const modal = DOMRefs.get(DOMRefs.login.modal);
      if (modal) modal.classList.remove('active');
      const usernameInput = DOMRefs.get(DOMRefs.login.username);
      const passwordInput = DOMRefs.get(DOMRefs.login.password);
      if (usernameInput) usernameInput.value = '';
      if (passwordInput) passwordInput.value = '';

      EventBus.emit(EVENTS.AUTH_LOGGED_IN);
      console.log('[AdminAuth] 登录成功，Token 已存储');
      return true;
    } catch (error) {
      Utils.showToast(UI.toast.loginFailed, true);
      console.log('[AdminAuth] 登录失败:', error.message);
      return false;
    }
  },

  // 登出：先退出编辑态再通知后端，最后清本地状态
  // 编辑态必须在登出前收敛：否则会留下已登出用户仍在编辑贴图的中间态
  // 后端撤销请求失败不阻塞本地清理——本地登出必须永远成功
  logout: async function () {
    console.log('[AdminAuth] 登出...');
    if (DecoShelf && DecoShelf.isEditing) {
      if (typeof DecoShelf.cancelEditing === 'function') {
        DecoShelf.cancelEditing();
      }
    }
    if (DecoEdit && DecoEdit.isActive()) {
      DecoEdit.exitEditMode(false);
    }

    const token = localStorage.getItem('auth_token');
    if (token) {
      try { await ApiClient.post('/api/auth/logout', {}); } catch (e) {
        // 后端撤销失败（如网络中断），仍继续清理本地 Token
      }
    }

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
    AdminUI.hidePanel();
    Utils.showToast(UI.notification.logoutSuccess, false);
    EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
    console.log('[AdminAuth] 已登出');
  },
};
