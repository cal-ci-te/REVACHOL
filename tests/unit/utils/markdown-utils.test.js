// tests/unit/utils/markdown-utils.test.js
// 测试 Markdown→HTML 转换：_isLikelyHtml 检测、实体还原、Markdown 渲染
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import MarkdownUtils from '../../../js/utils/markdown-utils.js';

describe('MarkdownUtils', () => {
  beforeAll(() => {
    // toHTML 内部有大量 console.log，静默它们减少噪音
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('_isLikelyHtml', () => {
    it('should return false for empty/null', () => {
      expect(MarkdownUtils._isLikelyHtml('')).toBe(false);
      expect(MarkdownUtils._isLikelyHtml(null)).toBe(false);
    });

    it('should return true for block HTML', () => {
      expect(MarkdownUtils._isLikelyHtml('<p>hello</p>')).toBe(true);
    });

    it('should return true for inline HTML', () => {
      expect(MarkdownUtils._isLikelyHtml('Hello <strong>World</strong>')).toBe(
        true
      );
    });

    it('should return true for escaped HTML entities', () => {
      expect(MarkdownUtils._isLikelyHtml('&lt;h1&gt;Hi&lt;/h1&gt;')).toBe(true);
    });

    it('should return false for plain markdown', () => {
      expect(MarkdownUtils._isLikelyHtml('# heading')).toBe(false);
      expect(MarkdownUtils._isLikelyHtml('just plain text')).toBe(false);
    });
  });

  describe('toHTML', () => {
    it('should return placeholder for empty', () => {
      expect(MarkdownUtils.toHTML('')).toContain('（空内容）');
    });

    it('should convert h1 heading', () => {
      expect(MarkdownUtils.toHTML('# Title')).toContain('<h1>Title</h1>');
    });

    it('should convert h2 heading', () => {
      expect(MarkdownUtils.toHTML('## Sub')).toContain('<h2>Sub</h2>');
    });

    it('should convert bold', () => {
      expect(MarkdownUtils.toHTML('**bold**')).toContain(
        '<strong>bold</strong>'
      );
    });

    it('should convert italic', () => {
      expect(MarkdownUtils.toHTML('*italic*')).toContain('<em>italic</em>');
    });

    it('should convert inline code', () => {
      expect(MarkdownUtils.toHTML('`code`')).toContain('<code>code</code>');
    });

    it('should convert code block', () => {
      expect(MarkdownUtils.toHTML('```\ncode line\n```')).toContain(
        '<pre><code>'
      );
    });

    it('should convert blockquote', () => {
      expect(MarkdownUtils.toHTML('> quoted')).toContain(
        '<blockquote>quoted</blockquote>'
      );
    });

    it('should convert list items', () => {
      expect(MarkdownUtils.toHTML('- item1\n- item2')).toContain(
        '<li>item1</li>'
      );
    });

    it('should return existing HTML as-is', () => {
      expect(MarkdownUtils.toHTML('<p>hello</p>')).toBe('<p>hello</p>');
    });

    it('should decode entity-escaped HTML into real tags', () => {
      expect(MarkdownUtils.toHTML('&lt;h1&gt;Hello&lt;/h1&gt;')).toBe(
        '<h1>Hello</h1>'
      );
    });

    it('should preserve sticker markers in HTML content', () => {
      const input =
        '<!-- sticker:x x=1 y=2 w=10 h=10 align=left -->&lt;p&gt;text&lt;/p&gt;';
      const html = MarkdownUtils.toHTML(input);
      expect(html).toContain('<!-- sticker:x x=1 y=2 w=10 h=10 align=left -->');
      expect(html).toContain('<p>text</p>');
      expect(html).not.toContain('&lt;p&gt;');
    });

    it('should preserve sticker marker with anchor field intact', () => {
      const input =
        '<p>para</p><!-- sticker:deco_xxx x=50 y=50 w=120 h=120 align=left margin=20 anchor=p:7:p_7:before --><p>next</p>';
      expect(MarkdownUtils.toHTML(input)).toBe(input);
    });
  });
});
