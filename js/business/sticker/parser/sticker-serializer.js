// ！贴纸标记序列化
// 将 StickerObject 序列化为占位标记；字段顺序固定便于阅读，但解析侧不依赖顺序。
// 内部模块，不对外导出。
import { DEFAULT_STICKER } from './sticker-parser.js';

// 转义标记属性值
// 连字符也必须转义：属性值里出现 `-->` 会提前闭合注释，导致后续内容被当成 HTML 解析
export function escapeAttrValue(value) {
  if (value === null || value === undefined) return '';
  let result = String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/--/g, '&#45;&#45;');
  // 逐个转义控制字符：写进注释后无法原样还原，且可能破坏标记结构
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      result = result.slice(0, i) + `&#x${code.toString(16)};` + result.slice(i + 1);
    }
  }
  return result;
}

// 序列化单个贴纸
// includeDefaults 当前恒为「写出全部字段」（保持向后兼容），该选项保留为后续行为开关
export function serializeOne(sticker, options = {}) {
  if (!sticker || !sticker.id) {
    throw new Error('StickerSerializeError: 缺少必填字段 id');
  }
  // options 由 serializeAll 透传，当前实现不读取，保留形参以固定调用签名
  void options;
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
  // anchor 为空时整段省略而非输出 anchor=undefined：空值字段会污染解析结果
  if (sticker.anchor) {
    marker += ` anchor=${escapeAttrValue(String(sticker.anchor))}`;
  }
  marker += ' -->';
  return marker;
}

// 批量序列化贴纸列表
export function serializeAll(stickers, options) {
  if (!Array.isArray(stickers)) return [];
  return stickers.map((s) => serializeOne(s, options));
}

export default { serializeOne, serializeAll, escapeAttrValue };
