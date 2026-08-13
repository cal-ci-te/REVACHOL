// tests/services/article-service.test.js
import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { ArticleService } from '../../js/services/article-service.js';
import { AppState } from '../../js/core/app-state.js';
import { EventBus } from '../../js/core/event-bus.js';
import { EVENTS } from '../../js/core/event-constants.js';

// Mock 依赖
vi.mock('../../js/core/app-state.js', () => ({
  AppState: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

vi.mock('../../js/core/event-bus.js', () => ({
  EventBus: {
    emit: vi.fn(),
    on: vi.fn(),
  },
}));

vi.mock('../../js/core/event-constants.js', () => ({
  EVENTS: {
    ARTICLE_DATA_LOADED: 'article:data-loaded',
    ARTICLE_VISIBILITY_CHANGED: 'article:visibility-changed',
    ARTICLE_MADE_INVISIBLE: 'article:made-invisible',
  },
}));

vi.mock('../../js/services/notification-service.js', () => ({
  NotificationService: {
    showToast: vi.fn(),
    showVisibilityChanged: vi.fn(),
    messages: {
      visibilityAdminOnly: '需要管理员权限',
      visibilityChangedLocal: (visible) => `文章已${visible ? '可见' : '不可见'}（本地模拟）`,
    },
  },
}));

describe('ArticleService', () => {
  beforeEach(() => {
    // 重置内部状态
    ArticleService._data = [];
    ArticleService.cache = { data: null, timestamp: null };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===== getAllArticles =====
  describe('getAllArticles', () => {
    it('should return empty array when no data', () => {
      expect(ArticleService.getAllArticles()).toEqual([]);
    });

    it('should return a copy of the data array', () => {
      const mockData = [{ id: 1, title: 'Test' }];
      ArticleService._data = mockData;

      const result = ArticleService.getAllArticles();
      expect(result).toEqual(mockData);
      expect(result).not.toBe(mockData);
    });
  });

  // ===== getVisibleArticles =====
  describe('getVisibleArticles', () => {
    it('should return all articles when user is logged in', () => {
      AppState.get.mockReturnValue(true);
      const mockData = [
        { id: 1, visible: true },
        { id: 2, visible: false },
        { id: 3, visible: true },
      ];
      ArticleService._data = mockData;

      const result = ArticleService.getVisibleArticles();
      expect(result).toEqual(mockData);
      expect(result.length).toBe(3);
    });

    it('should return only visible articles when user is not logged in', () => {
      AppState.get.mockReturnValue(false);
      const mockData = [
        { id: 1, visible: true },
        { id: 2, visible: false },
        { id: 3, visible: true },
        { id: 4, visible: undefined },
      ];
      ArticleService._data = mockData;

      const result = ArticleService.getVisibleArticles();
      // visible 为 undefined（未显式标记可见）时，getVisibleArticles 视为不可见
      expect(result.length).toBe(2);
      expect(result).toEqual([
        { id: 1, visible: true },
        { id: 3, visible: true },
      ]);
    });

    it('should handle empty data', () => {
      AppState.get.mockReturnValue(false);
      ArticleService._data = [];
      expect(ArticleService.getVisibleArticles()).toEqual([]);
    });
  });

  // ===== setVisibility =====
  describe('setVisibility', () => {
    it('should return false if user is not logged in', async () => {
      AppState.get.mockReturnValue(false);
      const result = await ArticleService.setVisibility(1, true);
      expect(result).toBe(false);
    });

    it('should return false if article not found', async () => {
      AppState.get.mockReturnValue(true);
      ArticleService._data = [{ id: 1, visible: true }];

      const result = await ArticleService.setVisibility(999, false);
      expect(result).toBe(false);
    });

    it('should update visibility locally when API_BASE_URL is not configured', async () => {
      AppState.get.mockReturnValue(true);
      ArticleService._data = [
        { id: 1, visible: true },
        { id: 2, visible: true },
      ];

      const originalConfig = global.CONFIG;
      global.CONFIG = { API_BASE_URL: '' };

      const result = await ArticleService.setVisibility(1, false);

      expect(result).toBe(true);
      expect(ArticleService._data[0].visible).toBe(false);
      expect(EventBus.emit).toHaveBeenCalledWith(EVENTS.ARTICLE_VISIBILITY_CHANGED, {
        articleId: 1,
        visible: false,
        fromRemote: false,
      });

      global.CONFIG = originalConfig;
    });
  });

  // ===== fetchArticles =====
  describe('fetchArticles', () => {
    it('should return cached data if available and not expired', async () => {
      const mockData = [{ id: 1, title: 'Cached' }];
      ArticleService.cache = {
        data: mockData,
        timestamp: Date.now(),
      };
      ArticleService._data = mockData;

      const originalConfig = global.CONFIG;
      global.CONFIG = { CACHE_TTL: 60000 };

      const result = await ArticleService.fetchArticles();
      expect(result).toEqual(mockData);
      expect(ArticleService._data).toEqual(mockData);

      global.CONFIG = originalConfig;
    });

    it('should generate mock data when API_BASE_URL is not configured', async () => {
      const originalConfig = global.CONFIG;
      global.CONFIG = { API_BASE_URL: '' };

      const result = await ArticleService.fetchArticles();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('id');
      expect(result[0]).toHaveProperty('title');
      expect(result[0]).toHaveProperty('content');

      global.CONFIG = originalConfig;
    });
  });

  // ===== getStats =====
  describe('getStats', () => {
    it('should return correct statistics', () => {
      AppState.get.mockReturnValue(false);
      ArticleService._data = [
        { id: 1, visible: true, categoryName: 'Cat A' },
        { id: 2, visible: false, categoryName: 'Cat A' },
        { id: 3, visible: true, categoryName: 'Cat B' },
        { id: 4, visible: true, categoryName: 'Cat B' },
        { id: 5, visible: true, categoryName: '' },
      ];

      const stats = ArticleService.getStats();
      expect(stats.total).toBe(5);
      expect(stats.hidden).toBe(1);
    });
  });

  // ===== clearCache =====
  describe('clearCache', () => {
    it('should clear the cache', () => {
      ArticleService.cache = { data: [{ id: 1 }], timestamp: 12345 };
      ArticleService.clearCache();
      expect(ArticleService.cache).toEqual({ data: null, timestamp: null });
    });
  });

  // ===== visibility logic =====
  describe('visibility logic', () => {
    it('should correctly determine article visibility', () => {
      const articles = [
        { id: 1, visible: true },
        { id: 2, visible: false },
        { id: 3, visible: undefined },
      ];

      AppState.get.mockReturnValue(false);
      ArticleService._data = articles;

      const visible = ArticleService.getVisibleArticles();
      expect(visible.some(a => a.id === 1)).toBe(true);
      expect(visible.some(a => a.id === 2)).toBe(false);
      // visible: undefined 视为不可见
      expect(visible.some(a => a.id === 3)).toBe(false);
    });
  });
});