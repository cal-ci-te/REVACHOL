// 图标包前端处理器 — 纯逻辑，可在浏览器与单元测试（jsdom）中运行。
// 职责：遍历 zip、安全性校验、尺寸检测、键名匹配、PNG 压缩、生成规范化 zip。
import JSZip from 'jszip';
import {
  ICON_PACK_KEY_SET,
  ICON_PACK_SIZE_RANGE,
  ICON_PACK_MAX_DIM,
  ICON_PACK_LIMITS,
} from './icon-pack-keys.js';
import { escapeHtml } from '../utils/dom.js';

const IMAGE_EXT_RE = /\.(png|svg)$/i;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const SVG_PATTERNS = [
  { label: '<script', regex: /<script/i },
  { label: '事件属性', regex: /on\w+\s*=/i },
  { label: 'javascript:', regex: /javascript:/i },
  { label: '<foreignObject', regex: /<foreignObject/i },
  { label: '<!ENTITY', regex: /<!ENTITY/i },
  { label: '<iframe', regex: /<iframe/i },
  { label: '<object', regex: /<object/i },
];

/** 从 entry 名提取图标键（basename 去扩展名，支持子目录） */
function extractKey(entryName) {
  return entryName.split('/').pop().replace(/\.(png|svg)$/i, '');
}

/** 读取 File/Blob 为 ArrayBuffer（兼容无 arrayBuffer 的旧环境） */
async function fileToArrayBuffer(file) {
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  if (file && typeof file === 'string') return null;
  return null;
}

/**
 * PNG 8 字节签名校验
 * @param {Uint8Array|ArrayBuffer|Buffer} bytes
 * @returns {boolean}
 */
export function checkPngMagic(bytes) {
  if (!bytes || bytes.length < 8) return false;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return PNG_SIGNATURE.every((byte, i) => view[i] === byte);
}

/**
 * SVG 安全扫描
 * @param {string} text
 * @returns {string[]} 命中项；空数组 = 安全
 */
export function scanSvgSecurity(text) {
  if (typeof text !== 'string') return [];
  const hits = [];
  SVG_PATTERNS.forEach(({ label, regex }) => {
    if (regex.test(text)) hits.push(label);
  });
  return hits;
}

/**
 * PNG 尺寸检测（浏览器 Image 解码）
 * @param {Blob} blob
 * @returns {Promise<{width:number,height:number}>}
 */
export function detectPngSize(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e || new Error('PNG 解码失败'));
    };
    img.src = url;
  });
}

/**
 * SVG 尺寸检测：解析 width/height/viewBox
 * @param {string} text
 * @returns {{width:number,height:number}|null}
 */
export function detectSvgSize(text) {
  if (typeof text !== 'string') return null;

  const parseLen = (raw) => {
    if (!raw) return null;
    const m = String(raw).trim().match(/^([\d.]+)(px|pt|em|%)?$/i);
    if (!m) return null;
    return parseFloat(m[1]);
  };

  const widthRaw = /<svg[^>]*\swidth=["']([^"']+)["']/i.exec(text);
  const heightRaw = /<svg[^>]*\sheight=["']([^"']+)["']/i.exec(text);
  const width = parseLen(widthRaw && widthRaw[1]);
  const height = parseLen(heightRaw && heightRaw[1]);
  if (width && height) return { width, height };

  // viewBox：min-x min-y width height
  const vb = /<svg[^>]*\sviewBox=["']([^"']+)["']/i.exec(text);
  if (vb) {
    const parts = vb[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return {
        width: Math.abs(parts[2] - parts[0]),
        height: Math.abs(parts[3] - parts[1]),
      };
    }
  }
  return null;
}

/**
 * PNG 等比缩小：任一边 > maxDim 时 Canvas 缩放，否则原样返回
 * @param {Blob} blob
 * @param {number} maxDim
 * @returns {Promise<Blob>}
 */
export async function resizePng(blob, maxDim = ICON_PACK_MAX_DIM) {
  if (!blob || typeof URL === 'undefined' || typeof Image === 'undefined') return blob;
  const size = await detectPngSize(blob);
  const max = Math.max(size.width, size.height);
  if (max <= maxDim) return blob;

  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = (e) => reject(e || new Error('图片加载失败'));
      el.src = url;
    });
    const scale = maxDim / max;
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, width, height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((out) => {
        if (out) resolve(out);
        else reject(new Error('PNG 压缩失败'));
      }, 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * 遍历 zip 检查：返回错误/警告/图标元数据
 * @param {File|Blob} file
 * @returns {Promise<{errors:string[],warnings:string[],icons:Array,missingKeys:string[],unknownKeys:string[],outOfRange:Array}>}
 */
export async function inspectZipFile(file) {
  const errors = [];
  const warnings = [];
  const icons = [];
  const missingKeys = [];
  const unknownKeys = [];
  const outOfRange = [];

  const buffer = await fileToArrayBuffer(file);
  if (!buffer) {
    errors.push('无法读取文件');
    return { errors, warnings, icons, missingKeys, unknownKeys, outOfRange };
  }

  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch (e) {
    errors.push('无法解析 zip 文件');
    return { errors, warnings, icons, missingKeys, unknownKeys, outOfRange };
  }

  const entries = Object.values(zip.files);
  if (entries.length > ICON_PACK_LIMITS.maxEntries) {
    errors.push(`zip 条目数超过上限（${ICON_PACK_LIMITS.maxEntries}）`);
  }

  const presentKeys = new Set();
  let totalBytes = 0;

  for (const entry of entries) {
    if (entry.dir) continue;
    if (!IMAGE_EXT_RE.test(entry.name)) continue;

    // 未解压前用 JSZip 内部记录检查大小（尽力而为）
    const rawSize = entry._data && entry._data.uncompressedSize;
    if (typeof rawSize === 'number' && rawSize > ICON_PACK_LIMITS.maxFileBytes) {
      errors.push(`文件超过单文件上限（5MB）: ${escapeHtml(entry.name)}`);
      continue;
    }

    let buf;
    try {
      buf = await entry.async('nodebuffer');
    } catch (e) {
      errors.push(`读取 zip 条目失败: ${escapeHtml(entry.name)}`);
      continue;
    }

    if (buf.length > ICON_PACK_LIMITS.maxFileBytes) {
      errors.push(`文件超过单文件上限（5MB）: ${escapeHtml(entry.name)}`);
      continue;
    }
    totalBytes += buf.length;
    if (totalBytes > ICON_PACK_LIMITS.maxTotalBytes) {
      errors.push('zip 内图片总大小超过上限（50MB）');
      break;
    }

    const extMatch = IMAGE_EXT_RE.exec(entry.name);
    const ext = extMatch[1].toLowerCase();
    const key = extractKey(entry.name);
    const blob = new Blob([buf], { type: ext === 'svg' ? 'image/svg+xml' : 'image/png' });

    if (ext === 'png') {
      if (!checkPngMagic(buf)) {
        errors.push(`PNG 签名校验失败（可能不是有效的 PNG）: ${escapeHtml(entry.name)}`);
        continue;
      }
    } else {
      const text = buf.toString('utf8');
      const hits = scanSvgSecurity(text);
      if (hits.length > 0) {
        errors.push(`SVG 包含危险内容（${hits.join('、')}）: ${escapeHtml(entry.name)}`);
        continue;
      }
    }

    let size = null;
    if (ext === 'png') {
      try {
        size = await detectPngSize(blob);
      } catch (e) {
        warnings.push(`无法检测尺寸: ${escapeHtml(entry.name)}`);
      }
    } else {
      size = detectSvgSize(buf.toString('utf8'));
      if (!size) warnings.push(`无法检测尺寸（缺少 width/height/viewBox）: ${escapeHtml(entry.name)}`);
    }

    if (size) {
      icons.push({ key, entryName: entry.name, ext, size: buf.length, width: size.width, height: size.height, blob });
      presentKeys.add(key);
      if (size.width < ICON_PACK_SIZE_RANGE.min || size.height < ICON_PACK_SIZE_RANGE.min ||
          size.width > ICON_PACK_SIZE_RANGE.max || size.height > ICON_PACK_SIZE_RANGE.max) {
        outOfRange.push({ name: entry.name, width: size.width, height: size.height });
        warnings.push(`尺寸超出推荐范围（${ICON_PACK_SIZE_RANGE.min}–${ICON_PACK_SIZE_RANGE.max}px）: ${escapeHtml(entry.name)} (${size.width}×${size.height})`);
      }
    }
  }

  // 键名匹配
  ICON_PACK_KEY_SET.forEach((registeredKey) => {
    if (!presentKeys.has(registeredKey)) {
      missingKeys.push(registeredKey);
      warnings.push(`缺少图标键: ${registeredKey}`);
    }
  });
  presentKeys.forEach((presentKey) => {
    if (!ICON_PACK_KEY_SET.has(presentKey)) {
      unknownKeys.push(presentKey);
      warnings.push(`未识别图标键: ${presentKey}`);
    }
  });

  return { errors, warnings, icons, missingKeys, unknownKeys, outOfRange };
}

/**
 * 生成规范化 zip：以 `${key}.${ext}` 平铺，PNG 可选压缩。
 * @param {File|Blob} file
 * @param {{compressPng?:boolean}} [options]
 * @returns {Promise<JSZip>}
 */
export async function buildNormalizedZip(file, { compressPng = true } = {}) {
  const buffer = await fileToArrayBuffer(file);
  const zip = await JSZip.loadAsync(buffer);
  const outZip = new JSZip();
  const entries = Object.values(zip.files);

  for (const entry of entries) {
    if (entry.dir) continue;
    if (!IMAGE_EXT_RE.test(entry.name)) continue;

    const ext = IMAGE_EXT_RE.exec(entry.name)[1].toLowerCase();
    const key = extractKey(entry.name);
    let content = await entry.async('nodebuffer');

    if (ext === 'png') {
      if (!checkPngMagic(content)) {
        throw new Error(`PNG 签名校验失败: ${entry.name}`);
      }
      if (compressPng) {
        const blob = new Blob([content], { type: 'image/png' });
        const resized = await resizePng(blob, ICON_PACK_MAX_DIM);
        if (resized !== blob) {
          content = await resized.arrayBuffer();
        }
      }
    } else {
      const text = content.toString('utf8');
      const hits = scanSvgSecurity(text);
      if (hits.length > 0) {
        throw new Error(`SVG 包含危险内容: ${entry.name}`);
      }
    }

    outZip.file(`${key}.${ext}`, content);
  }

  if (Object.keys(outZip.files).length === 0) {
    throw new Error('zip 中未找到任何 .png/.svg 图标文件');
  }
  return outZip;
}
