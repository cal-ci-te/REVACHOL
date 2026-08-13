// tests/unit/services/visibility-service.test.js
// 测试可见性服务：管理员/访客权限判断、可见性过滤、可见性切换
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../js/core/app-state.js', () => ({
  AppState: { get: vi.fn() },
}));
vi.mock('../../../js/services/article-service.js', () => ({
  ArticleService: { setVisibility: vi.fn() },
}));
vi.mock('../../../js/services/notification-service.js', () => ({
  NotificationService: {
    showToast: vi.fn(),
    showVisibilityChanged: vi.fn(),
    messages: {
      visibilityAdminOnly: 'admin only',
      visibilityChanged: (v) => `changed ${v}`,
    },
  },
}));

import { VisibilityService } from '../../../js/services/visibility-service.js';
import { AppState } from '../../../js/core/app-state.js';
import { ArticleService } from '../../../js/services/article-service.js';
import { NotificationService } from '../../../js/services/notification-service.js';

describe('VisibilityService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('canModify / isAdmin', () => {
    it('should return true when logged in', () => {
      AppState.get.mockReturnValue(true);
      expect(VisibilityService.canModify()).toBe(true);
      expect(VisibilityService.isAdmin()).toBe(true);
    });

    it('should return false when not logged in', () => {
      AppState.get.mockReturnValue(false);
      expect(VisibilityService.canModify()).toBe(false);
      expect(VisibilityService.isAdmin()).toBe(false);
    });
  });

  describe('isVisible', () => {
    it('should return true for admin regardless', () => {
      AppState.get.mockReturnValue(true);
      expect(VisibilityService.isVisible(1, [])).toBe(true);
    });

    it('should return true for visible article (guest)', () => {
      AppState.get.mockReturnValue(false);
      expect(VisibilityService.isVisible(1, [{ id: 1, visible: true }])).toBe(true);
    });

    it('should return false for invisible article (guest)', () => {
      AppState.get.mockReturnValue(false);
      expect(VisibilityService.isVisible(1, [{ id: 1, visible: false }])).toBe(false);
    });

    it('should return false for missing article', () => {
      AppState.get.mockReturnValue(false);
      expect(VisibilityService.isVisible(99, [])).toBe(false);
    });
  });

  describe('getVisibleArticles', () => {
    it('should return all for admin', () => {
      AppState.get.mockReturnValue(true);
      const list = [{ id: 1 }, { id: 2 }];
      expect(VisibilityService.getVisibleArticles(list)).toEqual(list);
    });

    it('should filter invisible for guest', () => {
      AppState.get.mockReturnValue(false);
      const list = [
        { id: 1, visible: true },
        { id: 2, visible: false },
        { id: 3 },
      ];
      expect(VisibilityService.getVisibleArticles(list)).toEqual([
        { id: 1, visible: true },
        { id: 3 },
      ]);
    });
  });

  describe('toggleVisibility', () => {
    it('should return false and toast for guest', async () => {
      AppState.get.mockReturnValue(false);
      const result = await VisibilityService.toggleVisibility(1, [
        { id: 1, visible: true },
      ]);
      expect(result).toBe(false);
      expect(NotificationService.showToast).toHaveBeenCalled();
    });

    it('should return false when article missing', async () => {
      AppState.get.mockReturnValue(true);
      const result = await VisibilityService.toggleVisibility(99, []);
      expect(result).toBe(false);
    });

    it('should use provided setVisibilityFn', async () => {
      AppState.get.mockReturnValue(true);
      const fn = vi.fn().mockResolvedValue(true);
      const result = await VisibilityService.toggleVisibility(
        1,
        [{ id: 1, visible: true }],
        fn
      );
      expect(fn).toHaveBeenCalledWith(1, false);
      expect(result).toBe(true);
    });

    it('should fallback to ArticleService.setVisibility', async () => {
      AppState.get.mockReturnValue(true);
      ArticleService.setVisibility.mockResolvedValue(true);
      const result = await VisibilityService.toggleVisibility(1, [
        { id: 1, visible: false },
      ]);
      expect(ArticleService.setVisibility).toHaveBeenCalledWith(1, true);
      expect(result).toBe(true);
    });
  });
});
