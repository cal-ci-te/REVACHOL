// ！多边形形状生成（已弃用）
// 弃用原因：贴纸改为固定矩形绕排（仅 float + margin），不再需要动态多边形计算。
// 保留此文件仅供历史参考，所有调用已移除，验证稳定后可安全删除。
// 为贴纸文字绕排生成 shape-outside / clip-path 的 polygon() 顶点数组，支持圆形、椭圆、圆角矩形。
// 各方法统一返回 cssPolygon（字符串）、vertices（点数组）、outerBox（外接矩形宽高）三个字段；纯计算，无外部依赖。

export const ShapeGenerator = {

  // 默认顶点数量
  // 取 16：16 顶点 ≈ 圆形的视觉近似，同时保持 CSS polygon 的性能可接受
  DEFAULT_VERTICES: 16,

  // 生成圆形顶点
  // 用 N 边形近似圆，从顶部开始逆时针取点
  // cx / cy 为圆心坐标（相对贴纸容器左上角），r 为半径，count 缺省取 16
  circle(cx, cy, r, count) {
    count = count || this.DEFAULT_VERTICES;
    const vertices = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
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

  // 生成贴纸浮动形状
  // 按形状类型分派，默认圆形
  // shape 取 circle | ellipse | rounded-rect，w / h 为贴纸像素宽高，vertices 为顶点数
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

  // 生成圆形贴纸顶点
  _circleVertices(w, h, vertices) {
    const size = Math.min(w, h);
    const r = size / 2;
    const cx = w / 2;
    const cy = h / 2;
    return this.circle(cx, cy, r, vertices);
  },

  // 生成椭圆贴纸顶点
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

  // 生成圆角矩形顶点
  // 圆角半径取短边的 20%，四角均分顶点（顶点数除不尽时余数归左边）
  _roundedRectVertices(w, h, vertices) {
    const r = Math.min(w, h) * 0.2;
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

  // 顶点转 CSS polygon
  _toCssPolygon(vertices) {
    const parts = vertices.map(function (v) {
      return v.x + 'px ' + v.y + 'px';
    });
    return 'polygon(' + parts.join(', ') + ')';
  },

  // 顶点转百分比 polygon
  // 用于响应式场景；宽高非法时退回像素值
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
