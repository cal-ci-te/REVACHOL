/**
 * @deprecated 自 v1.18.4 起弃用 — 贴纸改为固定矩形绕排（仅 float + margin），不再需要动态多边形计算。
 * 保留此文件仅供历史参考，所有调用已移除。验证稳定后可安全删除。
 *
 * 多边形形状生成器 — 为贴纸文字绕排提供 shape-outside / clip-path 的 polygon() 顶点数组。
 *
 * 设计目标：
 *   1. 最多 16 边形（16 顶点 ≈ 圆形的视觉近似，同时保持 CSS polygon 的性能可接受）
 *   2. 支持圆形、椭圆、圆角矩形三种基础形状
 *   3. 返回 { cssPolygon: string, vertices: Array<{x,y}>, outerBox: {w,h} }
 *   4. 零外部依赖，纯计算工具
 */

export const ShapeGenerator = {

  /** 默认顶点数量 */
  DEFAULT_VERTICES: 16,

  /**
   * 生成圆形顶点（用 N 边形近似）
   * @param {number} cx - 圆心 X（相对于贴纸容器左上角）
   * @param {number} cy - 圆心 Y
   * @param {number} r - 半径
   * @param {number} count - 顶点数（默认 16）
   * @returns {{ cssPolygon: string, vertices: Array<{x:number,y:number}>, outerBox: {w:number,h:number} }}
   */
  circle(cx, cy, r, count) {
    count = count || this.DEFAULT_VERTICES;
    const vertices = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2; // 从顶部开始
      vertices.push({
        x: Math.round((cx + r * Math.cos(angle)) * 100) / 100,
        y: Math.round((cy + r * Math.sin(angle)) * 100) / 100,
      });
    }
    return {
      cssPolygon: this._toCssPolygon(vertices),
      vertices: vertices,
      outerBox: { w: 2 * r, h: 2 * r },
    };
  },

  /**
   * 生成贴纸浮动形状（用于 shape-outside / clip-path）。
   * 根据贴纸的 width/height 计算适配的圆形顶点。
   *
   * @param {number} w - 贴纸宽度（px）
   * @param {number} h - 贴纸高度（px）
   * @param {string} shape - 形状类型: 'circle' | 'ellipse' | 'rounded-rect'
   * @param {number} vertices - 顶点数（默认 16）
   * @returns {{ cssPolygon: string, vertices: Array<{x:number,y:number}>, outerBox: {w:number,h:number} }}
   */
  forSticker(w, h, shape, vertices) {
    shape = shape || 'circle';
    vertices = vertices || this.DEFAULT_VERTICES;

    switch (shape) {
      case 'ellipse':
        return this._ellipseVertices(w, h, vertices);
      case 'rounded-rect':
        return this._roundedRectVertices(w, h, vertices);
      case 'circle':
      default:
        return this._circleVertices(w, h, vertices);
    }
  },

  /**
   * 圆形贴纸顶点：取较短边为直径
   */
  _circleVertices(w, h, vertices) {
    const size = Math.min(w, h);
    const r = size / 2;
    const cx = w / 2;
    const cy = h / 2;
    return this.circle(cx, cy, r, vertices);
  },

  /**
   * 椭圆贴纸顶点：填充整个贴纸区域
   */
  _ellipseVertices(w, h, vertices) {
    const rx = w / 2;
    const ry = h / 2;
    const cx = rx;
    const cy = ry;
    const pts = [];
    for (let i = 0; i < vertices; i++) {
      const angle = (i / vertices) * 2 * Math.PI - Math.PI / 2;
      pts.push({
        x: Math.round((cx + rx * Math.cos(angle)) * 100) / 100,
        y: Math.round((cy + ry * Math.sin(angle)) * 100) / 100,
      });
    }
    return {
      cssPolygon: this._toCssPolygon(pts),
      vertices: pts,
      outerBox: { w: w, h: h },
    };
  },

  /**
   * 圆角矩形贴纸顶点：用 16 边形近似（4 个角各 4 个顶点）
   */
  _roundedRectVertices(w, h, vertices) {
    const r = Math.min(w, h) * 0.2; // 圆角半径 = 短边的 20%
    const vPerCorner = Math.max(2, Math.floor(vertices / 4));
    const pts = [];

    // 上边（含右上角）
    for (let i = 0; i < vPerCorner; i++) {
      const angle = Math.PI * 1.5 + (i / vPerCorner) * (Math.PI / 2);
      pts.push({ x: Math.round((w - r + r * Math.cos(angle)) * 100) / 100,
                 y: Math.round((r + r * Math.sin(angle)) * 100) / 100 });
    }
    // 右边（含右下角）
    for (let j = 0; j < vPerCorner; j++) {
      const a2 = 0 + (j / vPerCorner) * (Math.PI / 2);
      pts.push({ x: Math.round((w - r + r * Math.cos(a2)) * 100) / 100,
                 y: Math.round((h - r + r * Math.sin(a2)) * 100) / 100 });
    }
    // 下边（含左下角）
    for (let k = 0; k < vPerCorner; k++) {
      const a3 = Math.PI / 2 + (k / vPerCorner) * (Math.PI / 2);
      pts.push({ x: Math.round((r + r * Math.cos(a3)) * 100) / 100,
                 y: Math.round((h - r + r * Math.sin(a3)) * 100) / 100 });
    }
    // 左边（含左上角）
    for (let l = 0; l < (vertices - vPerCorner * 3); l++) {
      const a4 = Math.PI + (l / (vertices - vPerCorner * 3)) * (Math.PI / 2);
      pts.push({ x: Math.round((r + r * Math.cos(a4)) * 100) / 100,
                 y: Math.round((r + r * Math.sin(a4)) * 100) / 100 });
    }

    return {
      cssPolygon: this._toCssPolygon(pts),
      vertices: pts,
      outerBox: { w: w, h: h },
    };
  },

  /**
   * 顶点数组 → CSS polygon() 字符串
   * @param {Array<{x:number, y:number}>} vertices
   * @returns {string} e.g. "polygon(50% 0%, 85% 15%, ...)"
   */
  _toCssPolygon(vertices) {
    const parts = vertices.map(function (v) {
      return v.x + 'px ' + v.y + 'px';
    });
    return 'polygon(' + parts.join(', ') + ')';
  },

  /**
   * 顶点数组 → 百分比 polygon() 字符串（用于响应式场景）
   * @param {Array<{x:number, y:number}>} vertices
   * @param {number} w - 总宽度
   * @param {number} h - 总高度
   * @returns {string}
   */
  toPercentPolygon(vertices, w, h) {
    if (w <= 0 || h <= 0) return this._toCssPolygon(vertices);
    const parts = vertices.map(function (v) {
      const px = Math.round((v.x / w) * 10000) / 100;
      const py = Math.round((v.y / h) * 10000) / 100;
      return px + '% ' + py + '%';
    });
    return 'polygon(' + parts.join(', ') + ')';
  },
};

export default ShapeGenerator;
