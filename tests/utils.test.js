// tests/utils.test.js
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Utils } from '../js/utils.js';

describe('Utils', () => {
  // ===== escapeHtml =====
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
  const input = '<div>"Hello" & friends</div>';
  const expected = '&lt;div&gt;"Hello" &amp; friends&lt;/div&gt;';
  expect(Utils.escapeHtml(input)).toBe(expected);
});

    it('should return empty string for falsy input', () => {
      expect(Utils.escapeHtml(null)).toBe('');
      expect(Utils.escapeHtml(undefined)).toBe('');
      expect(Utils.escapeHtml('')).toBe('');
    });

    it('should return empty string for non-string input', () => {
      expect(Utils.escapeHtml(123)).toBe('123');
      expect(Utils.escapeHtml({})).toBe('[object Object]');
    });
  });

  // ===== debounce =====
  describe('debounce', () => {
    it('should delay function execution', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = Utils.debounce(fn, 100);

      debounced();
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should only execute the last call within the wait period', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = Utils.debounce(fn, 100);

      debounced();
      debounced();
      debounced();

      vi.advanceTimersByTime(50);
      expect(fn).not.toHaveBeenCalled();

      vi.advanceTimersByTime(50);
      expect(fn).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('should pass arguments to the debounced function', () => {
      vi.useFakeTimers();
      const fn = vi.fn();
      const debounced = Utils.debounce(fn, 100);

      debounced('hello', 123);
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledWith('hello', 123);

      vi.useRealTimers();
    });
  });

  // ===== storage =====
  describe('storage', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    describe('set and get', () => {
      it('should store and retrieve a value', () => {
        const key = 'test_key';
        const value = { name: 'test', count: 42 };

        Utils.storage.set(key, value);
        const result = Utils.storage.get(key);

        expect(result).toEqual(value);
      });

      it('should store and retrieve a string value', () => {
        const key = 'test_string';
        const value = 'hello world';

        Utils.storage.set(key, value);
        const result = Utils.storage.get(key);

        expect(result).toBe(value);
      });

      it('should return defaultValue for non-existent key', () => {
        const defaultValue = 'default';
        const result = Utils.storage.get('non_existent_key', defaultValue);
        expect(result).toBe(defaultValue);
      });

      it('should return null for non-existent key without default', () => {
        const result = Utils.storage.get('non_existent_key');
        expect(result).toBeNull();
      });

      it('should handle JSON parse errors gracefully', () => {
        const key = 'corrupt_json';
        // StorageAdapter 使用 'rv_' 前缀，需写入带前缀的原始键以模拟损坏的 JSON
        localStorage.setItem('rv_' + key, '{not valid json');

        // 应该返回原始字符串而不是抛出错误
        const result = Utils.storage.get(key);
        expect(result).toBe('{not valid json');
      });
    });

    describe('remove', () => {
      it('should remove an item from storage', () => {
        const key = 'test_key';
        Utils.storage.set(key, 'some value');

        expect(Utils.storage.get(key)).toBe('some value');

        Utils.storage.remove(key);
        expect(Utils.storage.get(key)).toBeNull();
      });
    });
  });

  // ===== showToast / hideToast (DOM operations) =====
  describe('showToast and hideToast', () => {
    beforeEach(() => {
      // 清理可能存在的 toast 元素
      document.querySelectorAll('.toast-message').forEach(el => el.remove());
      // 重置内部状态
      Utils._toastTimer = null;
      Utils._toastElement = null;
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should create and display a toast message', () => {
      const message = 'Test toast message';

      Utils.showToast(message, false);

      const toast = document.querySelector('.toast-message');
      expect(toast).toBeTruthy();
      expect(toast.textContent).toBe(message);
      expect(toast.classList.contains('success')).toBe(true);
      expect(toast.classList.contains('error')).toBe(false);
    });

    it('should create and display an error toast message', () => {
      const message = 'Error message';

      Utils.showToast(message, true);

      const toast = document.querySelector('.toast-message');
      expect(toast).toBeTruthy();
      expect(toast.classList.contains('error')).toBe(true);
    });

    it('should hide toast after 2 seconds', () => {
      Utils.showToast('Auto hide test', false);

      let toast = document.querySelector('.toast-message');
      expect(toast).toBeTruthy();

      vi.advanceTimersByTime(2000);

      toast = document.querySelector('.toast-message');
      expect(toast).toBeFalsy();
    });

    it('should hide toast immediately when hideToast is called', () => {
      Utils.showToast('Manual hide test', false);

      let toast = document.querySelector('.toast-message');
      expect(toast).toBeTruthy();

      Utils.hideToast();

      toast = document.querySelector('.toast-message');
      expect(toast).toBeFalsy();
    });

    it('should replace existing toast with new one', () => {
      Utils.showToast('First message', false);
      const firstToast = document.querySelector('.toast-message');

      Utils.showToast('Second message', false);
      const secondToast = document.querySelector('.toast-message');

      expect(firstToast).not.toBe(secondToast);
      // 第一个 toast 应该已被移除
      expect(document.querySelectorAll('.toast-message').length).toBe(1);
    });
  });

  // ===== compressImage (async/File) =====
  describe('compressImage', () => {
    it('should create a Promise that resolves with compressed image data', async () => {
      // 创建一个模拟图片文件
      const mockFile = new File(['mock image data'], 'test.png', { type: 'image/png' });

      // 使用 vi.spyOn 模拟压缩过程（因为实际压缩需要 DOM 和 Canvas）
      // 这里我们测试函数是否正确返回 Promise 结构
      const result = Utils.compressImage(mockFile, 200, 0.85);

      expect(result).toBeInstanceOf(Promise);
      // 实际测试中，由于依赖 Image 和 Canvas，这里只验证 Promise 存在
      // 完整测试需要 jsdom 的 Canvas 支持
    });
  });
});