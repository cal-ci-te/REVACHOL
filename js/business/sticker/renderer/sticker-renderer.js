// ！贴纸渲染核心
// 唯一渲染实现：文章编辑器、全屏贴纸编辑器、阅读页共用 renderSticker，保证所见即所得。
// 处理浮动方向、尺寸、文字间距、containerWidth===0 降级，以及 resize 后的重新 clamp。
// 内部模块，不对外导出。
import { escapeCssUrl } from '../security/security-utils.js';

// 贴纸 DOM 类名（与既有样式兼容）
export const STICKER_CLASS = 'article-sticker';

// 计算贴纸的浮动样式对象
// options 保留形参以统一签名，当前实现不读取
export function buildFloatStyles(sticker, options = {}) {
  void options;
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

// 对贴纸 x 应用百分比 clamp
// x 为左边缘相对容器左侧的百分比，上界取 maxXPercent 以保证不越界：x% * containerWidth + width <= containerWidth
// 容器宽度为 0 或不可见时无法定义有效范围，返回 0 降级为合法最小布局，不做无效计算
// 非有限数（NaN/Infinity）同样返回 0，避免把 NaN 写进样式
export function clampX(sticker, options = {}) {
  const containerWidth = options.containerWidth || 0;
  if (containerWidth <= 0) return 0;
  const width = sticker.width || 120;
  const maxXPercent = Math.max(0, ((containerWidth - width) / containerWidth) * 100);
  const rawX = sticker.x !== undefined && sticker.x !== null ? Number(sticker.x) : 0;
  if (!Number.isFinite(rawX)) return 0;
  return Math.min(Math.max(rawX, 0), maxXPercent);
}

// 渲染单个贴纸为 DOM 元素
export function renderSticker(sticker, options = {}) {
  const el = document.createElement('div');
  el.className = STICKER_CLASS;
  if (sticker && sticker.id) el.dataset.stickerId = String(sticker.id);

  // absolute 模式：编辑器覆盖层，left/top 使用像素坐标
  // 该模式与默认浮动布局互斥，故命中后提前返回
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

  // margin 用独立属性设置而非并入 cssText：cssText 中的 margin 简写会与 margin-left 合并，
  // 使重读样式（测试断言、序列化）出现差异
  // 统一 x 为百分比语义：先 clampX 再按浮动方向落到左/右外边距
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

// 容器尺寸变化后原地重新 clamp
// 与 renderSticker 复用同一套外边距写法，保证首屏渲染与 resize 后结果一致
export function reClamp(el, sticker, options = {}) {
  if (!el || !sticker) return;
  const containerWidth = options.containerWidth || 0;
  if (containerWidth <= 0) return;
  const x = clampX(sticker, options);
  if (sticker.align === 'right') {
    el.style.marginRight = `calc((100% - ${x}%) - ${sticker.width || 120}px)`;
  } else {
    el.style.marginLeft = `${x}%`;
  }
}

export default { renderSticker, buildFloatStyles, clampX, reClamp, STICKER_CLASS };
