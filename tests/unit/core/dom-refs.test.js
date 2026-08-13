// tests/unit/core/dom-refs.test.js
// 测试 DOM 引用管理：选择器结构、get/getAll/getByPath、缓存与空值处理
import { describe, it, expect, afterEach } from 'vitest';
import { DOMRefs } from '../../../js/core/dom-refs.js';

describe('DOMRefs', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('selector structure', () => {
    it('should define sidebar selectors', () => {
      expect(DOMRefs.sidebar.container).toBe('#sidebar');
      expect(DOMRefs.sidebar.directoryTree).toBe('#directoryTree');
    });

    it('should define detail selectors', () => {
      expect(DOMRefs.detail.body).toBe('#detailBody');
      expect(DOMRefs.detail.content).toBe('#detailContent');
    });

    it('should define login and admin selectors', () => {
      expect(DOMRefs.login.username).toBe('#loginUsername');
      expect(DOMRefs.admin.panel).toBe('#adminPanel');
    });
  });

  describe('get', () => {
    it('should query by selector string', () => {
      const el = document.createElement('div');
      el.id = 'sidebar';
      document.body.appendChild(el);
      expect(DOMRefs.get('#sidebar')).toBe(el);
    });

    it('should return null for non-string input', () => {
      expect(DOMRefs.get(123)).toBeNull();
      expect(DOMRefs.get(null)).toBeNull();
    });

    it('should return null for non-existent element', () => {
      expect(DOMRefs.get('#nonExistent')).toBeNull();
    });
  });

  describe('getAll', () => {
    it('should query all matching elements', () => {
      document.body.innerHTML =
        '<div class="theme-btn"></div><div class="theme-btn"></div>';
      expect(DOMRefs.getAll('.theme-btn').length).toBe(2);
    });

    it('should return null for non-string input', () => {
      expect(DOMRefs.getAll(undefined)).toBeNull();
    });
  });

  describe('getByPath', () => {
    it('should resolve a nested selector path to an element', () => {
      const el = document.createElement('input');
      el.id = 'loginUsername';
      document.body.appendChild(el);
      expect(DOMRefs.getByPath('login.username')).toBe(el);
    });

    it('should return null for invalid path', () => {
      expect(DOMRefs.getByPath('nonexistent.path')).toBeNull();
    });

    it('should return the value when path ends at a non-string', () => {
      expect(DOMRefs.getByPath('sidebar')).toBe(DOMRefs.sidebar);
    });
  });
});
