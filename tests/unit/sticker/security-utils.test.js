import { describe, it, expect, vi } from 'vitest';
import {
  validateDataUrlMimeType,
  assertSafeStickerData,
  escapeCssUrl,
  sanitizeSvg,
  fetchAndValidateMimeType,
} from '../../../js/business/sticker/security/security-utils.js';

describe('security-utils', () => {
  describe('validateDataUrlMimeType（同步）', () => {
    it('接受白名单内的图片 MIME', () => {
      expect(validateDataUrlMimeType('data:image/png;base64,AAAA')).toBe(true);
      expect(validateDataUrlMimeType('data:image/jpeg;base64,AAAA')).toBe(true);
      expect(validateDataUrlMimeType('data:image/webp;base64,AAAA')).toBe(true);
      expect(validateDataUrlMimeType('data:image/gif;base64,AAAA')).toBe(true);
      expect(validateDataUrlMimeType('data:image/svg+xml;base64,AAAA')).toBe(true);
    });

    it('拒绝非白名单 MIME 与非法 data URL', () => {
      expect(validateDataUrlMimeType('data:text/html;base64,AAAA')).toBe(false);
      expect(validateDataUrlMimeType('data:application/javascript;base64,AAAA')).toBe(false);
      expect(validateDataUrlMimeType('http://example.com/a.png')).toBe(false);
      expect(validateDataUrlMimeType('data:')).toBe(false);
      expect(validateDataUrlMimeType('')).toBe(false);
    });
  });

  describe('assertSafeStickerData（同步、不发起网络）', () => {
    it('接受 http/https 与合法 data URL', () => {
      expect(assertSafeStickerData({ src: 'https://a.com/s.png' })).toBe(true);
      expect(assertSafeStickerData({ src: 'http://a.com/s.png' })).toBe(true);
      expect(assertSafeStickerData({ src: 'data:image/png;base64,AAAA' })).toBe(true);
    });

    it('拒绝危险协议', () => {
      expect(() => assertSafeStickerData({ src: 'javascript:alert(1)' })).toThrow();
      expect(() => assertSafeStickerData({ src: 'vbscript:msgbox(1)' })).toThrow();
      expect(() => assertSafeStickerData({ src: 'blob:http://a.com/id' })).toThrow();
      expect(() => assertSafeStickerData({ src: 'data:text/html,<script>' })).toThrow();
      expect(() => assertSafeStickerData({ src: '' })).toThrow();
      expect(() => assertSafeStickerData({})).toThrow();
    });

    it('接受同源相对路径与协议相对路径', () => {
      expect(assertSafeStickerData({ src: '/api/decos/deco_abc/image' })).toBe(true);
      expect(assertSafeStickerData({ src: '/images/sticker.png' })).toBe(true);
      expect(assertSafeStickerData({ src: '//cdn.example.com/sticker.png' })).toBe(true);
    });
  });

  describe('escapeCssUrl', () => {
    it('转义引号、反斜杠、括号与空白', () => {
      expect(escapeCssUrl('a"b')).toBe('a%22b');
      expect(escapeCssUrl("a'b")).toBe('a%27b');
      expect(escapeCssUrl('a\\b')).toBe('a%5Cb');
      expect(escapeCssUrl('a)b')).toBe('a%29b');
      expect(escapeCssUrl('a b')).toBe('a%20b');
      expect(escapeCssUrl('a\nb')).toBe('a%0Ab');
    });

    it('保留合法百分号编码，避免二次转义', () => {
      expect(escapeCssUrl('a%20b')).toBe('a%20b');
      expect(escapeCssUrl('a%2Fb')).toBe('a%2Fb');
    });
  });

  describe('sanitizeSvg', () => {
    it('移除 script 与 on* 事件属性', () => {
      const dirty = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(2)" /></svg>';
      const clean = sanitizeSvg(dirty);
      expect(clean).not.toMatch(/<script/i);
      expect(clean).not.toMatch(/onload/i);
    });

    it('移除 javascript: href 与外部 use', () => {
      const dirty =
        '<svg xmlns="http://www.w3.org/2000/svg"><a href="javascript:alert(1)"><text>x</text></a><use href="https://evil.com/x.svg#i" /></svg>';
      const clean = sanitizeSvg(dirty);
      expect(clean).not.toMatch(/javascript:/i);
      expect(clean).not.toMatch(/<use/i);
    });

    it('协议白名单：移除 xlink:href 非白名单协议，保留 # 内部引用', () => {
      const dirty =
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="data:text/html,alert(1)"/><use xlink:href="#grad"/></svg>';
      const clean = sanitizeSvg(dirty);
      expect(clean).not.toMatch(/data:text\/html/i);
      expect(clean).toContain('#grad');
    });

    it('保留干净 SVG', () => {
      const clean = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" /></svg>';
      expect(sanitizeSvg(clean)).toContain('<rect');
    });
  });

  describe('fetchAndValidateMimeType（异步、SSRF）', () => {
    it('通过 mock fetch 校验合法图片（allowFetch: true）', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        type: 'basic',
        headers: { get: () => 'image/png' },
      });
      await expect(fetchAndValidateMimeType('https://a.com/a.png', { fetchImpl, allowFetch: true })).resolves.toBe(true);
    });

    it('默认不发起网络请求（allowFetch 缺省）', async () => {
      const fetchImpl = vi.fn();
      await expect(fetchAndValidateMimeType('https://a.com/a.png', { fetchImpl })).resolves.toBe(true);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('拒绝私有 IP 与元地址（allowFetch: true 时走 SSRF 拦截）', async () => {
      const fetchImpl = vi.fn();
      await expect(fetchAndValidateMimeType('http://127.0.0.1/x.png', { fetchImpl, allowFetch: true })).resolves.toBe(false);
      await expect(fetchAndValidateMimeType('http://169.254.169.254/latest', { fetchImpl, allowFetch: true })).resolves.toBe(false);
      expect(fetchImpl).not.toHaveBeenCalled();
    });

    it('拒绝重定向响应', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: false,
        type: 'opaqueredirect',
        headers: { get: () => '' },
      });
      await expect(fetchAndValidateMimeType('https://a.com/a.png', { fetchImpl, allowFetch: true })).resolves.toBe(false);
    });

    it('非图片 Content-Type 返回 false', async () => {
      const fetchImpl = vi.fn().mockResolvedValue({
        ok: true,
        type: 'basic',
        headers: { get: () => 'text/html' },
      });
      await expect(fetchAndValidateMimeType('https://a.com/a.png', { fetchImpl, allowFetch: true })).resolves.toBe(false);
    });
  });
});
