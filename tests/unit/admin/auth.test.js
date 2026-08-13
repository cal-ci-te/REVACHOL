// tests/unit/admin/auth.test.js
// 测试前端管理员认证：login/logout/checkStatus（Token 存储、状态提交、事件触发）
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../js/services/api-client.js', () => ({
  ApiClient: { post: vi.fn() },
}));
vi.mock('../../../js/core/app-state.js', () => ({
  AppState: { commit: vi.fn() },
}));
vi.mock('../../../js/core/event-bus.js', () => ({
  EventBus: { emit: vi.fn() },
}));
vi.mock('../../../js/admin/avatar.js', () => ({
  AdminAvatar: { getAvatarForUser: vi.fn(), setAvatarImage: vi.fn() },
}));
vi.mock('../../../js/admin/position.js', () => ({
  AdminPosition: {
    loadPosition: vi.fn(),
    applyPosition: vi.fn(),
    applyCollapsedState: vi.fn(),
  },
}));
vi.mock('../../../js/admin/ui.js', () => ({
  AdminUI: { showPanel: vi.fn(), hidePanel: vi.fn() },
}));
vi.mock('../../../js/admin/events/index.js', () => ({
  AdminEvents: { rebind: vi.fn() },
}));
vi.mock('../../../js/services/deco.js', () => ({
  DecoShelf: { isEditing: false, cancelEditing: vi.fn() },
}));
vi.mock('../../../js/services/deco-edit.js', () => ({
  DecoEdit: { isActive: vi.fn(() => false), exitEditMode: vi.fn() },
}));
vi.mock('../../../js/core/dom-refs.js', () => ({
  DOMRefs: {
    get: vi.fn(() => null),
    login: { modal: '#x', username: '#u', password: '#p' },
  },
}));
vi.mock('../../../js/utils/ui-strings.js', () => ({
  UI: {
    notification: { loginSuccess: 'login ok', logoutSuccess: 'logout ok' },
    toast: { loginFailed: 'login failed' },
  },
}));
vi.mock('../../../js/utils.js', () => ({
  Utils: { showToast: vi.fn() },
}));

import { AdminAuth } from '../../../js/admin/auth.js';
import { ApiClient } from '../../../js/services/api-client.js';
import { AppState } from '../../../js/core/app-state.js';
import { EventBus } from '../../../js/core/event-bus.js';
import { MUTATIONS } from '../../../js/core/state-mutations.js';
import { EVENTS } from '../../../js/core/event-constants.js';
import { AdminUI } from '../../../js/admin/ui.js';
import { Utils } from '../../../js/utils.js';

describe('AdminAuth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('login', () => {
    it('should store token and set logged in', async () => {
      ApiClient.post.mockResolvedValue({ token: 'abc123', role: 'admin' });
      const result = await AdminAuth.login('admin', 'admin123');
      expect(result).toBe(true);
      expect(localStorage.getItem('auth_token')).toBe('abc123');
      expect(localStorage.getItem('user_role')).toBe('admin');
      expect(AppState.commit).toHaveBeenCalledWith(MUTATIONS.SET_LOGGED_IN, true);
      expect(EventBus.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGGED_IN);
      expect(AdminUI.showPanel).toHaveBeenCalled();
    });

    it('should return false and toast on failure', async () => {
      ApiClient.post.mockRejectedValue(new Error('401'));
      const result = await AdminAuth.login('admin', 'wrong');
      expect(result).toBe(false);
      expect(Utils.showToast).toHaveBeenCalled();
      expect(localStorage.getItem('auth_token')).toBeNull();
    });
  });

  describe('logout', () => {
    it('should clear token and set logged out', async () => {
      localStorage.setItem('auth_token', 'abc');
      ApiClient.post.mockResolvedValue({ success: true });
      await AdminAuth.logout();
      expect(localStorage.getItem('auth_token')).toBeNull();
      expect(AppState.commit).toHaveBeenCalledWith(MUTATIONS.SET_LOGGED_IN, false);
      expect(EventBus.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGGED_OUT);
      expect(AdminUI.hidePanel).toHaveBeenCalled();
    });

    it('should not call logout API when no token', async () => {
      await AdminAuth.logout();
      expect(ApiClient.post).not.toHaveBeenCalled();
    });
  });

  describe('checkStatus', () => {
    it('should restore logged in when token exists', () => {
      localStorage.setItem('auth_token', 'abc');
      AdminAuth.checkStatus();
      expect(AppState.commit).toHaveBeenCalledWith(MUTATIONS.SET_LOGGED_IN, true);
      expect(EventBus.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGGED_IN);
    });

    it('should set logged out when no token', () => {
      AdminAuth.checkStatus();
      expect(AppState.commit).toHaveBeenCalledWith(MUTATIONS.SET_LOGGED_IN, false);
      expect(EventBus.emit).toHaveBeenCalledWith(EVENTS.AUTH_LOGGED_OUT);
    });
  });
});
