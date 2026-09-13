// ！贴纸标记解析
// 从文章内容或 DOM 注释解析贴纸标记为统一的 StickerObject，是全项目唯一的解析实现。
// 标记格式（字段顺序无关）：<!-- sticker:{id} x=.. y=.. w=.. h=.. align=left|right margin=.. anchor=.. -->
// 内部模块，不对外导出。

// 贴纸占位标记正则（统一数据源）
export const MARKER_REGEX = /<!--\s*sticker:(.*?)-->/g;

// 字段解析正则（顺序无关）
const FIELD_REGEX = /(\w+)=(\S+)/g;

// 字段缺失时的兜底值
export const DEFAULT_STICKER = Object.freeze({
  width: 120,
  height: 120,
  align: 'left',
  margin: 20,
  x: 50,
  y: 50,
});

// 解析单个标记的字段串
// 首个 token 视为 id，其余按 key=value 逐个提取（不依赖字段顺序）
export function parseMarkerFields(raw) {
  const fields = {};
  const parts = raw.trim().split(/\s+/);
  fields.id = parts[0] || '';
  for (const token of parts.slice(1)) {
    const m = FIELD_REGEX.exec(token);
    if (m) fields[m[1]] = m[2];
    // 共享正则带 g 标志，每次使用后必须重置 lastIndex，否则下次 exec 会从上一次位置继续
    FIELD_REGEX.lastIndex = 0;
  }
  return fields;
}

// 归一化为 StickerObject
// 尺寸与坐标逐项兜底而非整体判空：缺一个字段不应让其余有效字段一起被丢弃
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

// 从文章内容解析全部贴纸标记
export function parseMarkers(content) {
  if (typeof content !== 'string' || !content) return [];
  const stickers = [];
  // 复制一份新正则而非复用 MARKER_REGEX：共享实例的 lastIndex 会被并发调用互相污染
  const regex = new RegExp(MARKER_REGEX.source, 'g');
  let match;
  while ((match = regex.exec(content)) !== null) {
    const f = parseMarkerFields(match[1]);
    if (!f.id) continue;
    stickers.push(normalizeMarkerFields(f));
  }
  return stickers;
}

// 从 DOM 注释节点解析贴纸标记
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
