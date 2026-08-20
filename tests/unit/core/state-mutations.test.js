// tests/unit/core/state-mutations.test.js
// 测试 mutation 常量集合与 mutationFor 生成器
import { describe, it, expect } from 'vitest';
import { MUTATIONS, mutationFor } from '../../../js/core/state-mutations.js';

describe('state-mutations', () => {
  describe('MUTATIONS 常量', () => {
    it('should export all mutation type constants', () => {
      expect(MUTATIONS.SET_LOGGED_IN).toBe('SET_LOGGED_IN');
      expect(MUTATIONS.SET_PANEL_POSITION).toBe('SET_PANEL_POSITION');
      expect(MUTATIONS.SET_SIDEBAR_COLLAPSED).toBe('SET_SIDEBAR_COLLAPSED');
      expect(MUTATIONS.SET_WATERMARK_TEXT).toBe('SET_WATERMARK_TEXT');
      expect(MUTATIONS.SET_BG_COLOR).toBe('SET_BG_COLOR');
      expect(MUTATIONS.SET_ARTICLES).toBe('SET_ARTICLES');
      expect(MUTATIONS.SET_KEY).toBe('SET_KEY');
      expect(MUTATIONS.SET_PUZZLE_IMAGE).toBe('SET_PUZZLE_IMAGE');
      expect(MUTATIONS.SET_PUZZLE_COMPLETED).toBe('SET_PUZZLE_COMPLETED');
    });

    it('should contain 20 mutation types', () => {
      expect(Object.keys(MUTATIONS)).toHaveLength(20);
    });
  });

  describe('mutationFor', () => {
    it('should generate SET_ prefixed uppercase type', () => {
      expect(mutationFor('key')).toBe('SET_KEY');
      expect(mutationFor('bgColor')).toBe('SET_BGCOLOR');
    });

    it('should uppercase the given key', () => {
      expect(mutationFor('loggedIn')).toBe('SET_LOGGEDIN');
    });
  });
});
