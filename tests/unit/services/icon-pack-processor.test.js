// 图标包前端处理器单测
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import JSZip from 'jszip';
import {
  checkPngMagic,
  scanSvgSecurity,
  detectSvgSize,
  inspectZipFile,
  buildNormalizedZip,
} from '../../../js/services/icon-pack-processor.js';

const PNG_1X1_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function pngBuffer() {
  return Buffer.from(PNG_1X1_BASE64, 'base64');
}

async function makeZipFile(files) {
  const zip = new JSZip();
  Object.entries(files).forEach(([name, content]) => zip.file(name, content));
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  return new File([buf], 'test.zip', { type: 'application/zip' });
}

// jsdom 不真正解码图片：用可立即 onload 的 Image mock 支撑 detectPngSize
const RealImage = global.Image;
const RealURL = global.URL;

beforeEach(() => {
  global.URL = {
    ...RealURL,
    createObjectURL: () => 'blob:test',
    revokeObjectURL: () => {},
  };
  global.Image = class {
    constructor() {
      this.naturalWidth = 1;
      this.naturalHeight = 1;
      this.width = 1;
      this.height = 1;
    }
    set src(_v) {
      queueMicrotask(() => {
        if (this.onload) this.onload();
      });
    }
    get src() { return 'blob:test'; }
  };
});

afterEach(() => {
  global.Image = RealImage;
  global.URL = RealURL;
});

describe('checkPngMagic', () => {
  it('valid PNG signature passes', () => {
    expect(checkPngMagic(pngBuffer())).toBe(true);
  });
  it('invalid PNG signature fails', () => {
    expect(checkPngMagic(Buffer.from('not a png!!'))).toBe(false);
    expect(checkPngMagic(Buffer.alloc(0))).toBe(false);
  });
});

describe('scanSvgSecurity', () => {
  it('returns hits for script/onload/javascript', () => {
    expect(scanSvgSecurity('<svg><script>alert(1)</script></svg>')).toContain('<script');
    expect(scanSvgSecurity('<svg onload="alert(1)"></svg>')).toContain('事件属性');
    expect(scanSvgSecurity('<svg><a href="javascript:alert(1)">x</a></svg>')).toContain('javascript:');
  });
  it('returns empty for safe svg', () => {
    expect(scanSvgSecurity('<svg xmlns="http://www.w3.org/2000/svg"><rect width="64" height="64"/></svg>')).toEqual([]);
  });
});

describe('detectSvgSize', () => {
  it('parses width/height attributes', () => {
    expect(detectSvgSize('<svg width="32" height="48"></svg>')).toEqual({ width: 32, height: 48 });
  });
  it('parses viewBox when width/height absent', () => {
    expect(detectSvgSize('<svg viewBox="0 0 100 200"></svg>')).toEqual({ width: 100, height: 200 });
  });
  it('returns null when cannot detect', () => {
    expect(detectSvgSize('<svg></svg>')).toBeNull();
  });
});

describe('inspectZipFile', () => {
  it('extracts key from subdirectory and ignores non-images', async () => {
    const file = await makeZipFile({
      'sub/dir/site.png': pngBuffer(),
      'readme.txt': 'hello',
    });
    const report = await inspectZipFile(file);
    expect(report.errors).toEqual([]);
    expect(report.icons.some((i) => i.key === 'site' && i.entryName === 'sub/dir/site.png')).toBe(true);
    expect(report.icons.some((i) => i.entryName === 'readme.txt')).toBe(false);
  });

  it('collects unknown keys', async () => {
    const file = await makeZipFile({ 'foo.png': pngBuffer() });
    const report = await inspectZipFile(file);
    expect(report.unknownKeys).toContain('foo');
    expect(report.icons.some((i) => i.key === 'foo')).toBe(true);
  });

  it('collects missing keys (site)', async () => {
    const file = await makeZipFile({ 'box-lid.svg': '<svg width="64" height="64"></svg>' });
    const report = await inspectZipFile(file);
    expect(report.missingKeys).toContain('site');
    expect(report.missingKeys).toContain('arrow');
  });

  it('reports out-of-range svg dimensions', async () => {
    const file = await makeZipFile({ 'site.svg': '<svg width="32" height="32"></svg>' });
    const report = await inspectZipFile(file);
    expect(report.outOfRange.some((o) => o.name === 'site.svg' && o.width === 32)).toBe(true);
    expect(report.warnings.some((w) => w.includes('site.svg'))).toBe(true);
  });

  it('reports entries limit error', async () => {
    const files = {};
    for (let i = 0; i < 201; i++) files[`f${i}.png`] = pngBuffer();
    const file = await makeZipFile(files);
    const report = await inspectZipFile(file);
    expect(report.errors.some((e) => e.includes('条目数'))).toBe(true);
  });

  it('reports single file size limit error', async () => {
    const big = Buffer.alloc(5 * 1024 * 1024 + 1, 0x61);
    const file = await makeZipFile({ 'big.png': big });
    const report = await inspectZipFile(file);
    expect(report.errors.some((e) => e.includes('单文件上限'))).toBe(true);
  }, 20000);

  it('blocks fake png via magic check', async () => {
    const file = await makeZipFile({ 'fake.png': 'not a png' });
    const report = await inspectZipFile(file);
    expect(report.errors.some((e) => e.includes('PNG 签名'))).toBe(true);
  });

  it('blocks dangerous svg', async () => {
    const file = await makeZipFile({ 'evil.svg': '<svg><script>alert(1)</script></svg>' });
    const report = await inspectZipFile(file);
    expect(report.errors.some((e) => e.includes('SVG 包含危险内容'))).toBe(true);
  });
});

describe('buildNormalizedZip', () => {
  it('flattens subdirectory entries to {key}.{ext}', async () => {
    const file = await makeZipFile({
      'a/b/site.svg': '<svg width="64" height="64"></svg>',
      'ignored.txt': 'x',
    });
    const outZip = await buildNormalizedZip(file);
    expect(outZip.file('site.svg')).toBeTruthy();
    expect(outZip.file('a/b/site.svg')).toBeFalsy();
    expect(outZip.file('ignored.txt')).toBeFalsy();
  });

  it('keeps png content when compressPng=false', async () => {
    const file = await makeZipFile({ 'site.png': pngBuffer() });
    const outZip = await buildNormalizedZip(file, { compressPng: false });
    expect(outZip.file('site.png')).toBeTruthy();
  });
});
