// ！AppState 补充测试（commit API）
// 覆盖实际存在的 commit / subscribe / unsubscribe / reset / snapshot。
// 对照 tests/core/app-state.test.js——后者使用了源码中不存在的 set()/setMultiple()。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppState } from '../../js/core/app-state.js';
import { MUTATIONS } from '../../js/core/state-mutations.js';

describe('AppState — commit() API', () => {

  beforeEach(() => {
    AppState.reset();
  });

  describe('get', () => {
    it('应返回正确值', () => {
      expect(AppState.get('isLoggedIn')).toBe(false);
      expect(AppState.get('watermarkText')).toBe('REVACHOL');
      expect(AppState.get('bgColor')).toBe('#1a1612');
    });

    it('不存在的 key 返回 undefined', () => {
      expect(AppState.get('nonexistent')).toBeUndefined();
    });
  });

  // commit — 基本 mutation
  describe('commit', () => {
    it('SET_LOGGED_IN 应更新 isLoggedIn', () => {
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
      expect(AppState.get('isLoggedIn')).toBe(true);

      AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
      expect(AppState.get('isLoggedIn')).toBe(false);
    });

    it('SET_BG_COLOR 应更新 bgColor', () => {
      AppState.commit(MUTATIONS.SET_BG_COLOR, '#ff0000');
      expect(AppState.get('bgColor')).toBe('#ff0000');
    });

    it('SET_WATERMARK_TEXT 应更新 watermarkText', () => {
      AppState.commit(MUTATIONS.SET_WATERMARK_TEXT, 'MY SITE');
      expect(AppState.get('watermarkText')).toBe('MY SITE');
    });

    it('SET_WATERMARK_OPACITY 应更新 watermarkOpacity', () => {
      AppState.commit(MUTATIONS.SET_WATERMARK_OPACITY, 0.5);
      expect(AppState.get('watermarkOpacity')).toBe(0.5);
    });

    it('SET_PANEL_COLLAPSED 应更新 panelCollapsed', () => {
      AppState.commit(MUTATIONS.SET_PANEL_COLLAPSED, false);
      expect(AppState.get('panelCollapsed')).toBe(false);
    });

    it('SET_SIDEBAR_COLLAPSED 应更新 sidebarCollapsed', () => {
      AppState.commit(MUTATIONS.SET_SIDEBAR_COLLAPSED, false);
      expect(AppState.get('sidebarCollapsed')).toBe(false);
    });

    it('SET_PUZZLE_IMAGE 应更新 puzzleImage', () => {
      AppState.commit(MUTATIONS.SET_PUZZLE_IMAGE, 'data:image/png;base64,...');
      expect(AppState.get('puzzleImage')).toBe('data:image/png;base64,...');
    });

    it('SET_PUZZLE_COMPLETED 应更新 puzzleCompleted', () => {
      AppState.commit(MUTATIONS.SET_PUZZLE_COMPLETED, true);
      expect(AppState.get('puzzleCompleted')).toBe(true);
    });

    it('SET_ARTICLES 应更新 articles', () => {
      const articles = [{ id: 1, title: 'Test' }];
      AppState.commit(MUTATIONS.SET_ARTICLES, articles);
      expect(AppState.get('articles')).toEqual(articles);
    });
  });

  // commit — 多键 mutation
  describe('commit — 多键 mutation', () => {
    it('SET_PANEL_POSITION 应更新 panelRight 和 panelBottom', () => {
      AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: 100, bottom: 50 });
      expect(AppState.get('panelRight')).toBe(100);
      expect(AppState.get('panelBottom')).toBe(50);
    });

    it('SET_PANEL_POSITION 只传 right 时只更新 right', () => {
      AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: 200 });
      expect(AppState.get('panelRight')).toBe(200);
      // 保持默认
      expect(AppState.get('panelBottom')).toBe(20);
    });

    it('SET_SIDEBAR_POSITION 应更新 sidebarLeft 和 sidebarTop', () => {
      AppState.commit(MUTATIONS.SET_SIDEBAR_POSITION, { left: 50, top: 150 });
      expect(AppState.get('sidebarLeft')).toBe(50);
      expect(AppState.get('sidebarTop')).toBe(150);
    });
  });

  // commit — SET_KEY 通用
  describe('commit — SET_KEY', () => {
    it('SET_KEY 应更新任意键', () => {
      AppState.commit(MUTATIONS.SET_KEY, { key: 'bgColor', value: '#abcdef' });
      expect(AppState.get('bgColor')).toBe('#abcdef');
    });

    it('SET_KEY payload.key 为 undefined 时不更新', () => {
      const oldValue = AppState.get('isLoggedIn');
      AppState.commit(MUTATIONS.SET_KEY, { value: 'no-key' });
      // 不应崩溃，原值不变
      expect(AppState.get('isLoggedIn')).toBe(oldValue);
    });
  });

  // commit — 未知 mutation
  describe('commit — 未知 mutation', () => {
    it('未知的 mutation type 不应崩溃，只打印警告', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(() => AppState.commit('NON_EXISTENT', 'value')).not.toThrow();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('未知 mutation')
      );
      warnSpy.mockRestore();
    });
  });

  // commit — 订阅者通知
  describe('commit — 订阅者通知', () => {
    it('单一键 mutation 应通知对应键的订阅者', () => {
      const fn = vi.fn();
      AppState.subscribe('isLoggedIn', fn);

      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);

      expect(fn).toHaveBeenCalledWith(true);
    });

    it('多键 mutation 应通知所有关联键的订阅者', () => {
      const fnRight = vi.fn();
      const fnBottom = vi.fn();
      AppState.subscribe('panelRight', fnRight);
      AppState.subscribe('panelBottom', fnBottom);

      AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: 99, bottom: 11 });

      expect(fnRight).toHaveBeenCalledWith(99);
      expect(fnBottom).toHaveBeenCalledWith(11);
    });

    it('SET_KEY 应通知 payload.key 对应的订阅者', () => {
      const fn = vi.fn();
      AppState.subscribe('watermarkText', fn);

      AppState.commit(MUTATIONS.SET_KEY, { key: 'watermarkText', value: 'NEW' });

      expect(fn).toHaveBeenCalledWith('NEW');
    });

    it('订阅者抛错不应影响 commit 执行', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      // subscribe 会立即调用 callback(this._state[key])。
      // _state['_test_throw'] 初始为 undefined → 不触发立即回调 → 不会在 subscribe 时抛错。
      // commit 时 _notify 触发回调 → 抛错被 try-catch 吞掉。
      const badFn = vi.fn((val) => {
        if (val !== undefined) throw new Error('subscriber boom');
      });
      AppState.subscribe('_test_throw', badFn);
      badFn.mockClear();

      expect(() =>
        AppState.commit(MUTATIONS.SET_KEY, { key: '_test_throw', value: 'trigger' })
      ).not.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('subscribe / unsubscribe', () => {
    it('subscribe 应立即回调当前值', () => {
      const fn = vi.fn();
      AppState.subscribe('watermarkText', fn);
      expect(fn).toHaveBeenCalledWith('REVACHOL');
    });

    it('subscribe 返回 this 支持链式', () => {
      const fn = vi.fn();
      const result = AppState.subscribe('a', fn).subscribe('b', fn);
      expect(result).toBe(AppState);
    });

    it('unsubscribe 不传 callback 时移除该键所有订阅者', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      AppState.subscribe('test', fn1);
      AppState.subscribe('test', fn2);

      AppState.unsubscribe('test');
      AppState.commit(MUTATIONS.SET_KEY, { key: 'test', value: 'new' });

      // 不再通知（只在 subscribe 时调用过一次）
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });

    it('unsubscribe 不存在的键不应报错，返回 this', () => {
      const result = AppState.unsubscribe('no_such_key');
      expect(result).toBe(AppState);
    });

    it('unsubscribe 指定 callback 只移除该回调', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      AppState.subscribe('isLoggedIn', fn1);
      AppState.subscribe('isLoggedIn', fn2);
      // 清除初始通知
      fn1.mockClear();
      fn2.mockClear();

      AppState.unsubscribe('isLoggedIn', fn1);
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledWith(true);
    });
  });

  describe('reset', () => {
    it('应恢复所有状态到默认值', () => {
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
      AppState.commit(MUTATIONS.SET_BG_COLOR, '#fff');
      AppState.commit(MUTATIONS.SET_WATERMARK_TEXT, 'changed');
      AppState.commit(MUTATIONS.SET_PANEL_COLLAPSED, false);

      AppState.reset();

      expect(AppState.get('isLoggedIn')).toBe(false);
      expect(AppState.get('bgColor')).toBe('#1a1612');
      expect(AppState.get('watermarkText')).toBe('REVACHOL');
      expect(AppState.get('panelCollapsed')).toBe(true);
    });

    it('应清空所有订阅者', () => {
      const fn = vi.fn();
      AppState.subscribe('isLoggedIn', fn);
      fn.mockClear();

      AppState.reset();
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);

      expect(fn).not.toHaveBeenCalled();
    });

    it('应返回 this 支持链式', () => {
      const result = AppState.reset();
      expect(result).toBe(AppState);
    });
  });

  describe('snapshot', () => {
    it('应返回状态的深拷贝', () => {
      AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
      AppState.commit(MUTATIONS.SET_BG_COLOR, '#123456');

      const snap = AppState.snapshot();

      expect(snap.isLoggedIn).toBe(true);
      expect(snap.bgColor).toBe('#123456');
    });

    it('修改 snapshot 不应影响原状态', () => {
      AppState.commit(MUTATIONS.SET_KEY, { key: 'testRef', value: { nested: 'old' } });
      const snap = AppState.snapshot();

      snap.testRef.nested = 'modified';
      expect(AppState.get('testRef').nested).toBe('old');
    });

    it('snapshot 返回的是独立对象（修改不互相影响）', () => {
      const snap1 = AppState.snapshot();
      const snap2 = AppState.snapshot();

      snap1.fake = 'added';
      expect(snap2.fake).toBeUndefined();
    });
  });
});
