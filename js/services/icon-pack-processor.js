// ！图标包处理器
// 纯逻辑模块，不依赖 DOM 之外的浏览器 API，可在 jsdom 单元测试中直接运行。
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

// 提取图标键
// 取 basename 去扩展名：包内允许任意层子目录，键名只认文件名
function extractKey(entryName) {
  return entryName.split('/').pop().replace(/\.(png|svg)$/i, '');
}

// 读取为 ArrayBuffer
// 兼容无 arrayBuffer 的旧环境；字符串输入直接返回 null 由调用方判错
async function fileToArrayBuffer(file) {
  if (file && typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  if (file && typeof file === 'string') return null;
  return null;
}

// 校验 PNG 8 字节签名
// 仅看扩展名不足以防伪造：.png 后缀的任意二进制流会在后续解码环节报错
export function checkPngMagic(bytes) {
  if (!bytes || bytes.length < 8) return false;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return PNG_SIGNATURE.every((byte, i) => view[i] === byte);
}

// 扫描 SVG 危险内容
// 返回命中项；空数组 = 安全。图标最终以 img 标签渲染，需防范脚本/外部引用注入
export function scanSvgSecurity(text) {
  if (typeof text !== 'string') return [];
  const hits = [];
  SVG_PATTERNS.forEach(({ label, regex }) => {
    if (regex.test(text)) hits.push(label);
  });
  return hits;
}

// 检测 PNG 尺寸
// 借浏览器 Image 解码读取 naturalWidth/naturalHeight：仅解析文件头无法覆盖 APNG 等变体
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

// 检测 SVG 尺寸
// 优先 width/height，缺失时回退 viewBox
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

  // 回退读 viewBox，其值为 min-x min-y width height 四段
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

// 等比缩小 PNG
// 仅缩不放：任一边未超 maxDim 时原样返回，避免小图被放大后模糊
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

// 检查 zip 内容
// 返回错误、警告与图标元数据；errors 非空时调用方应中止上传
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

    // 未解压前读 JSZip 记录的声明大小：可提前拒绝超大文件，避免解压耗尽内存
    // 声明值可被伪造，故解压后仍需用实际长度二次校验
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
      // 超范围仅警告不阻断：用户可能有意提供非标准尺寸，压缩环节会自动纠正
      if (size.width < ICON_PACK_SIZE_RANGE.min || size.height < ICON_PACK_SIZE_RANGE.min ||
          size.width > ICON_PACK_SIZE_RANGE.max || size.height > ICON_PACK_SIZE_RANGE.max) {
        outOfRange.push({ name: entry.name, width: size.width, height: size.height });
        warnings.push(`尺寸超出推荐范围（${ICON_PACK_SIZE_RANGE.min}–${ICON_PACK_SIZE_RANGE.max}px）: ${escapeHtml(entry.name)} (${size.width}×${size.height})`);
      }
    }
  }

  // 键名匹配：缺键仅告警（包可只覆盖部分图标），多键告警避免拼写错误静默失效
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

// 生成规范化 zip
// 以 `${key}.${ext}` 平铺输出，丢弃原始目录层级，服务端按平铺结构直接读取
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
        // 用引用相等判断是否真的缩放：未超标时 resizePng 原样返回入参 blob
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
