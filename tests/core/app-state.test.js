// tests/core/app-state.test.js
// AppState 实际 API 为 commit(mutation, payload)，不存在 set()/setMultiple()。
// 本文件测试真实的 get / commit(SET_KEY) / subscribe / unsubscribe / reset / snapshot。
// 更完整的 mutation 覆盖见 tests/unit/app-state.test.js。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { AppState } from '../../js/core/app-state.js';
import { MUTATIONS } from '../../js/core/state-mutations.js';

// 辅助函数：等价于 AppState.set(key, value)，内部走真实的 commit(SET_KEY, ...)
const setKey = (key, value) => AppState.commit(MUTATIONS.SET_KEY, { key, value });

describe('AppState', () => {
  beforeEach(() => {
    // 每个测试前重置状态，保证测试隔离
    AppState.reset();
  });

  // ===== 基本 get / commit =====
  describe('get and commit', () => {
    it('should set and get a value', () => {
      setKey('isLoggedIn', true);
      expect(AppState.get('isLoggedIn')).toBe(true);
    });

    it('should return undefined for non-existent key', () => {
      expect(AppState.get('non_existent_key')).toBeUndefined();
    });

    it('should overwrite existing value', () => {
      setKey('panelCollapsed', true);
      expect(AppState.get('panelCollapsed')).toBe(true);

      setKey('panelCollapsed', false);
      expect(AppState.get('panelCollapsed')).toBe(false);
    });
  });

  // ===== 设置多个键 =====
  describe('setting multiple keys', () => {
    it('should set multiple key-value pairs via SET_KEY', () => {
      setKey('isLoggedIn', true);
      setKey('panelCollapsed', false);
      setKey('testValue', 42);

      expect(AppState.get('isLoggedIn')).toBe(true);
      expect(AppState.get('panelCollapsed')).toBe(false);
      expect(AppState.get('testValue')).toBe(42);
    });
  });

  // ===== subscribe =====
  describe('subscribe', () => {
    it('should call callback when state changes', () => {
      const fn = vi.fn();
      AppState.subscribe('testKey', fn);

      setKey('testKey', 'new value');
      expect(fn).toHaveBeenCalledWith('new value');
    });

    it('should call callback immediately with current value on subscription', () => {
      const fn = vi.fn();
      setKey('testKey', 'current value');

      AppState.subscribe('testKey', fn);
      expect(fn).toHaveBeenCalledWith('current value');
    });

    it('should always notify on commit (even if value unchanged)', () => {
      const fn = vi.fn();
      AppState.subscribe('testKey', fn);

      setKey('testKey', 'value');
      expect(fn).toHaveBeenCalledTimes(1);

      setKey('testKey', 'value');
      expect(fn).toHaveBeenCalledTimes(2); // commit 总是通知
    });

    it('should support multiple subscribers for same key', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      AppState.subscribe('testKey', fn1);
      AppState.subscribe('testKey', fn2);

      setKey('testKey', 'new');
      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should support chaining', () => {
      const fn = vi.fn();
      const result = AppState.subscribe('test', fn).subscribe('test2', fn);
      expect(result).toBe(AppState);
    });
  });

  // ===== unsubscribe =====
  describe('unsubscribe', () => {
    it('should remove specific callback', () => {
      const fn = vi.fn();
      AppState.subscribe('testKey', fn);

      setKey('testKey', 'first');
      expect(fn).toHaveBeenCalledTimes(1);

      AppState.unsubscribe('testKey', fn);
      setKey('testKey', 'second');
      expect(fn).toHaveBeenCalledTimes(1); // 不再被调用
    });

    it('should remove all callbacks for a key when no callback specified', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      AppState.subscribe('testKey', fn1);
      AppState.subscribe('testKey', fn2);

      AppState.unsubscribe('testKey');
      setKey('testKey', 'new');
      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });

    it('should do nothing if key does not exist', () => {
      const result = AppState.unsubscribe('non_existent_key');
      expect(result).toBe(AppState);
    });

    it('should support chaining', () => {
      const result = AppState.unsubscribe('test');
      expect(result).toBe(AppState);
    });
  });

  // ===== reset =====
  describe('reset', () => {
    it('should reset all state to default values', () => {
      setKey('isLoggedIn', true);
      setKey('panelCollapsed', false);
      setKey('panelRight', 100);

      AppState.reset();

      expect(AppState.get('isLoggedIn')).toBe(false);
      expect(AppState.get('panelCollapsed')).toBe(true);
      expect(AppState.get('panelRight')).toBe(20);
    });

    it('should clear all subscribers', () => {
      const fn = vi.fn();
      AppState.subscribe('testKey', fn);
      AppState.reset();

      setKey('testKey', 'new');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should support chaining', () => {
      const result = AppState.reset();
      expect(result).toBe(AppState);
    });
  });

  // ===== snapshot =====
  describe('snapshot', () => {
    it('should return a copy of the state', () => {
      setKey('isLoggedIn', true);
      setKey('panelCollapsed', false);

      const snap = AppState.snapshot();
      expect(snap.isLoggedIn).toBe(true);
      expect(snap.panelCollapsed).toBe(false);
    });

    it('should return a deep copy (not a reference)', () => {
      setKey('testKey', { nested: 'value' });
      const snap = AppState.snapshot();

      // 修改 snapshot 不应影响原状态
      snap.testKey.nested = 'modified';
      expect(AppState.get('testKey').nested).toBe('value');
    });
  });

  // ===== error handling =====
  describe('error handling', () => {
    it('should handle subscriber errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Subscriber error');
      });

      AppState.subscribe('testKey', fn);
      // 应该不抛出错误
      expect(() => setKey('testKey', 'value')).not.toThrow();

      consoleSpy.mockRestore();
    });
  });
});
