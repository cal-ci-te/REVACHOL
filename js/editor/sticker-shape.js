/**
 * 贴纸形状模块 — 管理贴纸的浮动配置和文字绕排 CSS。
 * v1.18.4 简化：放弃动态多边形 shape-outside / clip-path，改为固定矩形绕排。
 *
 * 职责：
 *   1. 为贴纸生成 float + margin 浮动样式
 *   2. 管理贴纸的浮动方向（left/right）和间距
 *   3. 提供贴纸闪避位置推荐（避免两个贴纸重叠）
 */

export const StickerShape = {

  /** 默认尺寸（px） */
  DEFAULT_SIZE: 120,

  /** 默认间距（px） */
  DEFAULT_MARGIN: 20,

  /** 默认浮动方向 */
  DEFAULT_ALIGN: 'left',

  /** 默认坐标 X（标记解析无 x 时的回退值） */
  DEFAULT_X: 50,

  /** 默认坐标 Y 基准（标记解析无 y 时的回退值） */
  DEFAULT_Y: 50,

  /** 默认垂直间距（多贴纸解析时的 y 步进值） */
  DEFAULT_GAP: 80,

  /**
   * 为贴纸生成浮动样式对象（v1.18.4 简化为固定矩形绕排）。
   * 移除 shape-outside / clip-path 动态多边形，仅依赖 float + margin 实现文字绕排。
   *
   * @param {object} sticker - 贴纸数据 { width, height, align, margin }
   * @returns {{ float: string, width: string, height: string, margin: string }}
   */
  buildFloatStyles(sticker) {
    const w = sticker.width || this.DEFAULT_SIZE;
    const h = sticker.height || this.DEFAULT_SIZE;
    const align = sticker.align || this.DEFAULT_ALIGN;
    const margin = sticker.margin !== undefined ? sticker.margin : this.DEFAULT_MARGIN;

    // 固定矩形绕排：只使用 float + margin，无 shape-outside / clip-path
    const marginCSS = '10px ' + margin + 'px 10px ' + margin + 'px';

    return {
      float: align,
      width: w + 'px',
      height: h + 'px',
      margin: marginCSS,
    };
  },

  /**
   * 为贴纸生成 DOM 内联样式字符串（v1.18.4 简化，移除 shape-outside / clip-path）。
   *
   * @param {object} sticker - 贴纸数据
   * @param {string} imageUrl - 贴纸图片地址
   * @returns {string} CSS 内联样式字符串
   */
  buildInlineStyle(sticker, imageUrl) {
    const styles = this.buildFloatStyles(sticker);
    const parts = [
      'float:' + styles.float,
      'width:' + styles.width,
      'height:' + styles.height,
      'margin:' + styles.margin,
      'background-image:url(' + (imageUrl || '') + ')',
      'background-size:contain',
      'background-repeat:no-repeat',
      'background-position:center',
      'position:relative',
      'pointer-events:auto',
    ];
    return parts.join(';');
  },

  /**
   * 检测两个贴纸是否重叠
   * @param {object} a - 贴纸 A { x, y, width, height }
   * @param {object} b - 贴纸 B { x, y, width, height }
   * @returns {boolean}
   */
  isOverlapping(a, b) {
    const ax = a.x || 0, ay = a.y || 0, aw = a.width || this.DEFAULT_SIZE, ah = a.height || this.DEFAULT_SIZE;
    const bx = b.x || 0, by = b.y || 0, bw = b.width || this.DEFAULT_SIZE, bh = b.height || this.DEFAULT_SIZE;

    return !(ax + aw + 20 < bx || bx + bw + 20 < ax || ay + ah + 20 < by || by + bh + 20 < ay);
  },

  /**
   * 为新增贴纸推荐位置（避免与已有贴纸重叠）
   *
   * @param {Array<object>} existing - 已有贴纸列表
   * @param {number} containerWidth - 容器宽度
   * @param {number} insertY - 插入位置的 Y 坐标
   * @returns {{ x: number, y: number, align: string }}
   */
  suggestPosition(existing, containerWidth, insertY) {
    const size = this.DEFAULT_SIZE;
    const margin = this.DEFAULT_MARGIN;
    containerWidth = containerWidth || 800;
    insertY = insertY || 100;
    existing = existing || [];

    // 尝试在左右两侧交替放置
    const candidates = [
      { x: margin, y: insertY, align: 'left' },
      { x: containerWidth - size - margin, y: insertY, align: 'right' },
    ];

    for (let i = 0; i < candidates.length; i++) {
      var candidate = candidates[i];
      const overlap = existing.some(function (s) {
        return StickerShape.isOverlapping(candidate, s);
      });
      if (!overlap) return candidate;
    }

    // 所有候选位都被占用 → 向下偏移，交替左右
    for (let j = 0; j < 20; j++) {
      const offsetY = insertY + j * (size + margin);
      const alignSide = (j % 2 === 0) ? 'left' : 'right';
      const altX = (alignSide === 'left') ? margin : (containerWidth - size - margin);
      var altCandidate = { x: altX, y: offsetY, align: alignSide };
      const conflicts = existing.some(function (s) {
        return StickerShape.isOverlapping(altCandidate, s);
      });
      if (!conflicts) return altCandidate;
    }

    // 最终兜底：放在最下方
    let maxY = 0;
    existing.forEach(function (s) {
      const bottom = (s.y || 0) + (s.height || size);
      if (bottom > maxY) maxY = bottom;
    });
    return { x: margin, y: maxY + margin, align: 'left' };
  },
};

export default StickerShape;
