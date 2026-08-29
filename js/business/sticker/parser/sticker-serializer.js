/**
 * 贴纸序列化器 — 将 StickerObject 序列化为占位标记。
 *
 * 统一提供 serializeOne / serializeAll；字段顺序固定便于阅读，但解析不依赖顺序。
 *
 * @internal 仅供 js/business/sticker 内部使用，不对外导出。
 */
import { DEFAULT_STICKER } from './sticker-parser.js';

/**
 * 转义标记属性值，防止 `-->` 与引号破坏注释边界。
 * @param {string} value
 * @returns {string}
 */
export function escapeAttrValue(value) {
  if (value === null || value === undefined) return '';
  let result = String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/--/g, '&#45;&#45;');
  // 转义控制字符（避免 no-control-regex 规则报警）
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      result = result.slice(0, i) + `&#x${code.toString(16)};` + result.slice(i + 1);
    }
  }
  return result;
}

/**
 * 序列化单个贴纸为标记字符串。
 *
 * options schema：
 * - `includeDefaults`（boolean，默认 false）：是否显式写出与默认值相同的 x/y/w/h/margin 字段。
 *   当前实现始终写出全部字段（保持向后兼容），该选项保留为后续行为开关。
 *
 * @param {object} sticker - StickerObject { id, x, y, width, height, align, margin, anchor }
 * @param {{ includeDefaults?: boolean }} [options]
 * @returns {string} 如 "<!-- sticker:deco_abc x=50 y=50 w=120 h=120 align=left margin=20 -->"
 */
export function serializeOne(sticker, options = {}) {
  if (!sticker || !sticker.id) {
    throw new Error('StickerSerializeError: 缺少必填字段 id');
  }
  void options; // 保留 options 形参（由 serializeAll 传入）
  const id = escapeAttrValue(sticker.id);
  // 数值守卫：非有限数一律回退默认值，避免 x=NaN 等非法输出落库
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const x = num(sticker.x, DEFAULT_STICKER.x);
  const y = num(sticker.y, DEFAULT_STICKER.y);
  const w = num(sticker.width || sticker.w, DEFAULT_STICKER.width);
  const h = num(sticker.height || sticker.h, DEFAULT_STICKER.height);
  const align = sticker.align || DEFAULT_STICKER.align;
  const margin = num(sticker.margin, DEFAULT_STICKER.margin);

  let marker = `<!-- sticker:${id} x=${x} y=${y} w=${w} h=${h} align=${align} margin=${margin}`;
  if (sticker.anchor) {
    marker += ` anchor=${escapeAttrValue(String(sticker.anchor))}`;
  }
  marker += ' -->';
  return marker;
}

/**
 * 批量序列化贴纸列表。
 * @param {Array<object>} stickers - StickerObject[]（逐项透传 serializeOne 的 options）
 * @param {{ includeDefaults?: boolean }} [options] - 同 serializeOne options schema
 * @returns {string[]} 标记字符串数组
 */
export function serializeAll(stickers, options) {
  if (!Array.isArray(stickers)) return [];
  return stickers.map((s) => serializeOne(s, options));
}

export default { serializeOne, serializeAll, escapeAttrValue };
