// tests/unit/services/storage-adapter.test.js
// 测试 StorageAdapter 边界：get 序列化/反序列化/解析失败、set/remove/clear、异常兜底
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StorageAdapter } from '../../../js/services/storage-adapter.js';

describe('StorageAdapter', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('get', () => {
    it('should return null for missing key', () => {
      expect(StorageAdapter.get('missing')).toBeNull();
    });

    it('should return default for missing key', () => {
      expect(StorageAdapter.get('missing', 'fallback')).toBe('fallback');
    });

    it('should deserialize JSON', () => {
      localStorage.setItem('rv_obj', '{"a":1}');
      expect(StorageAdapter.get('obj')).toEqual({ a: 1 });
    });

    it('should return raw string when JSON parse fails', () => {
      localStorage.setItem('rv_raw', 'not-json');
      expect(StorageAdapter.get('raw')).toBe('not-json');
    });

    it('should return parsed primitives', () => {
      localStorage.setItem('rv_num', '42');
      expect(StorageAdapter.get('num')).toBe(42);
      localStorage.setItem('rv_bool', 'true');
      expect(StorageAdapter.get('bool')).toBe(true);
      localStorage.setItem('rv_nil', 'null');
      expect(StorageAdapter.get('nil')).toBeNull();
    });
  });

  describe('set', () => {
    it('should serialize and store with rv_ prefix', () => {
      StorageAdapter.set('k', { a: 1 });
      expect(localStorage.getItem('rv_k')).toBe('{"a":1}');
    });
  });

  describe('remove', () => {
    it('should remove the prefixed item', () => {
      StorageAdapter.set('k', 'v');
      expect(StorageAdapter.get('k')).toBe('v');
      StorageAdapter.remove('k');
      expect(StorageAdapter.get('k')).toBeNull();
    });
  });

  describe('clear', () => {
    it('should remove all prefixed keys only', () => {
      StorageAdapter.set('a', 1);
      StorageAdapter.set('b', 2);
      localStorage.setItem('unrelated', 'x');
      StorageAdapter.clear();
      expect(localStorage.getItem('rv_a')).toBeNull();
      expect(localStorage.getItem('rv_b')).toBeNull();
      expect(localStorage.getItem('unrelated')).toBe('x');
    });
  });

  describe('异常兜底', () => {
    it('should return default when getItem throws', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(StorageAdapter.get('k', 'fallback')).toBe('fallback');
    });

    it('should not throw when setItem throws', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('quota');
      });
      expect(() => StorageAdapter.set('k', 'v')).not.toThrow();
    });

    it('should not throw when removeItem throws', () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('denied');
      });
      expect(() => StorageAdapter.remove('k')).not.toThrow();
    });
  });
});
