/**
 * 贴纸解析器 — 单一解析实现。
 *
 * 负责从文章内容（或 DOM 注释）解析贴纸标记为统一的 StickerObject。
 * 标记格式（字段顺序无关，兼容新旧格式与 anchor）：
 *   <!-- sticker:{id} x=.. y=.. w=.. h=.. align=left|right margin=.. anchor=.. -->
 *
 * @internal 仅供 js/business/sticker 内部使用，不对外导出。
 */

/** 贴纸占位标记正则（统一数据源）。 */
export const MARKER_REGEX = /<!--\s*sticker:(.*?)-->/g;

/** 字段解析正则（顺序无关）。 */
const FIELD_REGEX = /(\w+)=(\S+)/g;

/** 默认值。 */
export const DEFAULT_STICKER = Object.freeze({
  width: 120,
  height: 120,
  align: 'left',
  margin: 20,
  x: 50,
  y: 50,
});

/**
 * 解析单个标记字段串为对象。
 * @param {string} raw - 注释内部文本，如 "deco_abc x=10 y=20 w=120 h=120 align=left"
 * @returns {object}
 */
export function parseMarkerFields(raw) {
  const fields = {};
  const parts = raw.trim().split(/\s+/);
  fields.id = parts[0] || '';
  for (const token of parts.slice(1)) {
    const m = FIELD_REGEX.exec(token);
    if (m) fields[m[1]] = m[2];
    FIELD_REGEX.lastIndex = 0;
  }
  return fields;
}

/**
 * 将解析到的字段归一化为 StickerObject。
 * @param {object} f - parseMarkerFields 的结果
 * @returns {object} StickerObject
 */
export function normalizeMarkerFields(f) {
  const w = Number.parseInt(f.w, 10) || DEFAULT_STICKER.width;
  const h = Number.parseInt(f.h, 10) || DEFAULT_STICKER.height;
  const parseCoord = (v, fallback) => {
    const n = Number.parseInt(v, 10);
    return Number.isFinite(n) ? n : fallback;
  };
  return {
    id: f.id || '',
    x: parseCoord(f.x, DEFAULT_STICKER.x),
    y: parseCoord(f.y, DEFAULT_STICKER.y),
    width: w,
    height: h,
    align: f.align === 'right' ? 'right' : DEFAULT_STICKER.align,
    margin: f.margin !== undefined ? Number.parseInt(f.margin, 10) : DEFAULT_STICKER.margin,
    anchor: f.anchor || undefined,
    src: f.src || undefined,
  };
}

/**
 * 从文章内容解析贴纸标记。
 * @param {string} content - 文章 Markdown/HTML 内容
 * @returns {Array<object>} StickerObject[]
 */
export function parseMarkers(content) {
  if (typeof content !== 'string' || !content) return [];
  const stickers = [];
  const regex = new RegExp(MARKER_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const f = parseMarkerFields(match[1]);
    if (!f.id) continue;
    stickers.push(normalizeMarkerFields(f));
  }
  return stickers;
}

/**
 * 从 DOM 容器遍历注释节点解析贴纸标记。
 * @param {HTMLElement} container
 * @returns {Array<object>} StickerObject[]
 */
export function parseMarkersFromDom(container) {
  if (!container || typeof document === 'undefined') return [];
  const stickers = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT, {
    acceptNode(node) {
      return /^\s*sticker:/.test(node.nodeValue || '')
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    },
  });
  let node;
  while ((node = walker.nextNode())) {
    // DOM 注释的 nodeValue 形如 "sticker:deco_abc x=10 ..."，需先剥离前缀
    const raw = (node.nodeValue || '').trim().replace(/^sticker:\s*/, '');
    const f = parseMarkerFields(raw);
    if (!f.id) continue;
    stickers.push(normalizeMarkerFields(f));
  }
  return stickers;
}

export default { parseMarkers, parseMarkersFromDom, parseMarkerFields, MARKER_REGEX };
