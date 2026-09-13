// ！贴纸形状与绕排
// 管理贴纸的浮动样式与文字绕排，并提供新贴纸的避让位置推荐。
// 已放弃动态多边形 shape-outside/clip-path，改为固定矩形绕排：多边形绕排在各浏览器下表现不一，
// 且与文章正文字号联动时容易产生难以排查的错位，固定矩形虽朴素但结果稳定可预期。

export const StickerShape = {

  // 默认尺寸（px）
  DEFAULT_SIZE: 120,

  // 默认间距（px）
  DEFAULT_MARGIN: 20,

  // 默认浮动方向
  DEFAULT_ALIGN: 'left',

  // 默认坐标 X（标记解析无 x 时的回退值）
  DEFAULT_X: 50,

  // 默认坐标 Y 基准（标记解析无 y 时的回退值）
  DEFAULT_Y: 50,

  // 默认垂直间距（多贴纸解析时的 y 步进值）
  DEFAULT_GAP: 80,

  // 生成贴纸浮动样式对象
  // 仅用 float + margin 实现绕排；margin 写四值是为了让左右间距可独立控制、上下保持固定 10px
  buildFloatStyles(sticker) {
    const w = sticker.width || this.DEFAULT_SIZE;
    const h = sticker.height || this.DEFAULT_SIZE;
    const align = sticker.align || this.DEFAULT_ALIGN;
    const margin = sticker.margin !== undefined ? sticker.margin : this.DEFAULT_MARGIN;

    const marginCSS = '10px ' + margin + 'px 10px ' + margin + 'px';

    return {
      float: align,
      width: w + 'px',
      height: h + 'px',
      margin: marginCSS,
    };
  },

  // 生成贴纸 DOM 内联样式字符串
  // background-image 未做 URL 转义：此处入参来自内部数据，不经过用户输入
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

  // 检测两个贴纸是否重叠
  // 参考矩形各向外扩 20px 再判交：阈值内含一点余量，可避免边缘相贴的贴纸被判为不重叠而视觉拥挤
  isOverlapping(a, b) {
    const ax = a.x || 0, ay = a.y || 0, aw = a.width || this.DEFAULT_SIZE, ah = a.height || this.DEFAULT_SIZE;
    const bx = b.x || 0, by = b.y || 0, bw = b.width || this.DEFAULT_SIZE, bh = b.height || this.DEFAULT_SIZE;

    return !(ax + aw + 20 < bx || bx + bw + 20 < ax || ay + ah + 20 < by || by + bh + 20 < ay);
  },

  // 为新贴纸推荐避让位置
  // 三级策略逐级放宽：左右两个常规位 → 向下逐行交替左右（最多 20 行）→ 放到最下方兜底
  // 兜底仍然返回结果而非 null：调用方需要一个可插入的位置，宁可重叠也不能让贴纸放不进去
  suggestPosition(existing, containerWidth, insertY) {
    const size = this.DEFAULT_SIZE;
    const margin = this.DEFAULT_MARGIN;
    containerWidth = containerWidth || 800;
    insertY = insertY || 100;
    existing = existing || [];

    // 首选：插入点左右两侧各一个候选位
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

    // 次选：向下偏移，左右交替
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

    // 兜底：放在所有贴纸最下方
    let maxY = 0;
    existing.forEach(function (s) {
      const bottom = (s.y || 0) + (s.height || size);
      if (bottom > maxY) maxY = bottom;
    });
    return { x: margin, y: maxY + margin, align: 'left' };
  },
};

export default StickerShape;
