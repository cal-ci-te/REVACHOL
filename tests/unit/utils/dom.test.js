// tests/unit/utils/dom.test.js
// 测试 DOM 工具：escapeHtml / stripHtml / truncateHtml
import { describe, it, expect } from 'vitest';
import { escapeHtml, stripHtml, truncateHtml } from '../../../js/utils/dom.js';

describe('dom utils', () => {
  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(escapeHtml('<div>a & b</div>')).toBe(
        '&lt;div&gt;a &amp; b&lt;/div&gt;'
      );
    });

    it('should return empty string for falsy input', () => {
      expect(escapeHtml('')).toBe('');
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should coerce non-string values', () => {
      expect(escapeHtml(123)).toBe('123');
    });
  });

  describe('stripHtml', () => {
    it('should strip HTML tags and keep text', () => {
      expect(stripHtml('<p>Hello <strong>World</strong></p>')).toBe(
        'Hello World'
      );
    });

    it('should return empty string for falsy input', () => {
      expect(stripHtml('')).toBe('');
      expect(stripHtml(null)).toBe('');
    });
  });

  describe('truncateHtml', () => {
    it('should return original HTML when text is short', () => {
      expect(truncateHtml('<p>short</p>', 50)).toBe('<p>short</p>');
    });

    it('should truncate long content to plain text', () => {
      const long = '<p>' + 'a'.repeat(200) + '</p>';
      const result = truncateHtml(long, 50);
      expect(result).not.toContain('<p>');
      expect(result.endsWith('…')).toBe(true);
      expect(result.length).toBeLessThan(60);
    });

    it('should default maxLength to 150', () => {
      const long = 'a'.repeat(300);
      const result = truncateHtml(long);
      expect(result.length).toBeLessThan(200);
    });

    it('should return empty string for falsy input', () => {
      expect(truncateHtml('')).toBe('');
    });
  });
});
