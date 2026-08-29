/**
 * 贴纸渲染核心 — 唯一渲染实现。
 *
 * 文章编辑器、全屏贴纸编辑器、阅读页共用 renderSticker，保证所见即所得。
 * 处理：浮动方向、尺寸、文字间距、containerWidth===0 降级、resize 后重新 clamp。
 *
 * @internal 仅供 js/business/sticker 内部使用，不对外导出。
 */
import { escapeCssUrl } from '../security/security-utils.js';

/** 贴纸 DOM 类名（与既有样式兼容）。 */
export const STICKER_CLASS = 'article-sticker';

/**
 * 计算贴纸的浮动样式对象。
 * @param {object} sticker - StickerObject
 * @param {{ containerWidth?: number }} [options]
 * @returns {object}
 */
export function buildFloatStyles(sticker, options = {}) {
  void options; // 保留 options 形参（统一签名）
  const width = sticker.width || 120;
  const height = sticker.height || 120;
  const align = sticker.align || 'left';
  const margin = sticker.margin !== undefined && sticker.margin !== null ? sticker.margin : 20;

  return {
    float: align,
    width: `${width}px`,
    height: `${height}px`,
    margin: `10px ${margin}px 10px ${margin}px`,
  };
}

/**
 * 对贴纸 x 应用百分比 clamp（x 为左边缘相对容器左侧的百分比，范围 [0, maxXPercent]）。
 * maxXPercent 保证贴纸不越界：x% * containerWidth + width <= containerWidth。
 * 容器宽度为 0 或不可见时跳过 clamp（降级为合法最小布局）。
 * @param {object} sticker - StickerObject（含 x/width）
 * @param {{ containerWidth?: number }} [options]
 * @returns {number} clamp 后的 x 百分比值
 */
export function clampX(sticker, options = {}) {
  const containerWidth = options.containerWidth || 0;
  if (containerWidth <= 0) return 0; // 降级：不进行无效计算
  const width = sticker.width || 120;
  const maxXPercent = Math.max(0, ((containerWidth - width) / containerWidth) * 100);
  const rawX = sticker.x !== undefined && sticker.x !== null ? Number(sticker.x) : 0;
  if (!Number.isFinite(rawX)) return 0;
  return Math.min(Math.max(rawX, 0), maxXPercent);
}

/**
 * 渲染单个贴纸为 DOM 元素。
 * @param {object} sticker - StickerObject
 * @param {{ containerWidth?: number }} [options]
 * @returns {HTMLElement}
 */
export function renderSticker(sticker, options = {}) {
  const el = document.createElement('div');
  el.className = STICKER_CLASS;
  if (sticker && sticker.id) el.dataset.stickerId = String(sticker.id);

  // 编辑器覆盖层：绝对定位模式（left/top 使用像素坐标）
  if (options.mode === 'absolute') {
    const w = (sticker && sticker.width) || 120;
    const h = (sticker && sticker.height) || 120;
    const left = sticker && sticker.x !== undefined && sticker.x !== null ? sticker.x : 0;
    const top = sticker && sticker.y !== undefined && sticker.y !== null ? sticker.y : 0;
    const parts = [
      'position:absolute',
      `left:${left}px`,
      `top:${top}px`,
      `width:${w}px`,
      `height:${h}px`,
    ];
    if (sticker && sticker.src) {
      parts.push(`background-image:url("${escapeCssUrl(sticker.src)}")`);
    }
    parts.push(
      'background-size:contain',
      'background-repeat:no-repeat',
      'background-position:center',
      'pointer-events:auto',
      'z-index:10',
      'cursor:grab'
    );
    el.style.cssText = parts.join(';');
    return el;
  }

  const styles = buildFloatStyles(sticker, options);
  const parts = [
    `float:${styles.float}`,
    `width:${styles.width}`,
    `height:${styles.height}`,
    `margin:${styles.margin}`,
  ];

  if (sticker && sticker.src) {
    parts.push(`background-image:url("${escapeCssUrl(sticker.src)}")`);
  }
  parts.push(
    'background-size:contain',
    'background-repeat:no-repeat',
    'background-position:center',
    'position:relative',
    'pointer-events:auto'
  );

  el.style.cssText = parts.join(';');

  // 统一 x 为百分比语义：渲染前 clampX，再用独立属性设置 margin，
  // 避免 cssText 简写（margin）与 margin-left 合并导致的序列化差异
  if (sticker && sticker.x !== undefined && sticker.x !== null && options.containerWidth > 0) {
    const x = clampX(sticker, options);
    if (sticker.align === 'right') {
      el.style.marginRight = `calc((100% - ${x}%) - ${sticker.width || 120}px)`;
    } else {
      el.style.marginLeft = `${x}%`;
    }
  }

  return el;
}

/**
 * 在容器尺寸变化后重新对贴纸执行 clamp（原地更新样式）。
 * @param {HTMLElement} el
 * @param {object} sticker - StickerObject
 * @param {{ containerWidth?: number }} [options]
 */
export function reClamp(el, sticker, options = {}) {
  if (!el || !sticker) return;
  const containerWidth = options.containerWidth || 0;
  if (containerWidth <= 0) return; // 降级
  const x = clampX(sticker, options);
  if (sticker.align === 'right') {
    el.style.marginRight = `calc((100% - ${x}%) - ${sticker.width || 120}px)`;
  } else {
    el.style.marginLeft = `${x}%`;
  }
}

export default { renderSticker, buildFloatStyles, clampX, reClamp, STICKER_CLASS };
