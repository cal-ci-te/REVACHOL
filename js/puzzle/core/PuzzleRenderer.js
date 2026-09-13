// ！拼图形状与绘制
// 拼图形状与 Canvas 工具类，每实例独立、无共享状态。
// 提供拼图路径（_puzzlePath）、形状数据（getBlockShape）、接缝线与遮罩。
// Canvas 背景绘制与 DOM 块/缺口渲染共用同一份形状数据，保证两者轮廓完全一致。
const MASK_ALPHA = 0.4;

export class PuzzleRenderer {
    // 配置项：width/height 画布尺寸，blockSize 块大小（即缺口大小，统一数据源），
    // gapRadius 缺口圆角，enableSeam 接缝线开关
    // enableSeam 用 !== false 判定：只有显式传 false 才关闭，未传时保持开启
    constructor(config = {}) {
        this._canvasW = config.width || 480;
        this._canvasH = config.height || 180;
        const bs = config.blockSize || 72;
        this._gapW = bs;
        this._gapH = bs;
        this._gapRadius = config.gapRadius || 8;
        this._gapY = (this._canvasH - this._gapH) / 2;

        this._enableSeam = config.enableSeam !== false;

        // 实例级状态
        this._gapX = 0;
        this._cachedImg = null;
        this._onRedraw = null;
    }

    get gapX() { return this._gapX; }
    get gapY() { return this._gapY; }
    get gapW() { return this._gapW; }
    get gapH() { return this._gapH; }

    // 重置缺口位置
    resetGap() { this._resetGapX(); }

    // 计算图片按 cover 方式居中裁剪后的绘制参数
    // 取宽高缩放比的较大者：保证背景铺满画布、四周不留空边
    // 图片未加载完成时返回 null，由调用方决定是否跳过本次绘制
    getImageInfo() {
        if (!this._cachedImg || !this._cachedImg.complete || this._cachedImg.naturalWidth <= 0) return null;
        const scale = Math.max(
            this._canvasW / this._cachedImg.naturalWidth,
            this._canvasH / this._cachedImg.naturalHeight
        );
        const sw = this._cachedImg.naturalWidth * scale;
        const sh = this._cachedImg.naturalHeight * scale;
        return { sx: (this._canvasW - sw) / 2, sy: (this._canvasH - sh) / 2, sw, sh };
    }

    // 按比例提亮十六进制颜色
    lighten(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, (num >> 16) + 255 * amount);
        const g = Math.min(255, ((num >> 8) & 0x00FF) + 255 * amount);
        const b = Math.min(255, (num & 0x0000FF) + 255 * amount);
        return `rgb(${r | 0},${g | 0},${b | 0})`;
    }

    // 随机重置缺口 X
    // 凸起 tabR 也必须留在画布内，故可用区间收紧为 [tabR, canvasW - gapW - tabR]
    // 画布过窄导致该区间无效时退化为水平居中，保证缺口始终可见
    _resetGapX() {
        const tabR = Math.min(this._gapW * 0.18, this._gapH * 0.32, 16);
        const minGap = tabR;
        const maxGap = this._canvasW - this._gapW - tabR;
        if (maxGap <= minGap) {
            this._gapX = Math.max(0, (this._canvasW - this._gapW) / 2);
        } else {
            this._gapX = minGap + Math.random() * (maxGap - minGap);
        }
    }

    // 计算缺口 Y 坐标，确保含凸起的扩展区域不超出画布上下边界
    // 与 _resetGapX 不同此处不随机：缺口纵向居中即可，画布过矮时才被夹紧
    _clampGapY() {
        const tabR = Math.min(this._gapW * 0.18, this._gapH * 0.32, 16);
        const idealY = (this._canvasH - this._gapH) / 2;
        const minY = tabR;
        const maxY = this._canvasH - this._gapH - tabR;
        this._gapY = Math.max(minY, Math.min(idealY, maxY));
    }

    // 绘制背景图（按 cover 比例居中裁剪）
    // 缓存 Image 对象并以 _src 判断复用：同一图片频繁重绘时不必反复发起加载
    // 复用分支补挂 onload：图像可能已加载完成，不补挂则 _onRedraw 重绘回调永不触发
    _drawBackgroundFromImage(ctx, imageSrc) {
        if (!this._cachedImg || this._cachedImg._src !== imageSrc) {
            this._cachedImg = new Image();
            this._cachedImg._src = imageSrc;
            const self = this;
            this._cachedImg.onload = () => {
                if (self._onRedraw) self._onRedraw();
            };
            this._cachedImg.src = imageSrc;
        } else if (!this._cachedImg.complete) {
            const self = this;
            const prevOnload = this._cachedImg.onload;
            this._cachedImg.onload = () => {
                if (prevOnload) prevOnload();
                if (self._onRedraw) self._onRedraw();
            };
        }
        if (this._cachedImg.complete && this._cachedImg.naturalWidth > 0) {
            const scale = Math.max(
                this._canvasW / this._cachedImg.naturalWidth,
                this._canvasH / this._cachedImg.naturalHeight
            );
            const sw = this._cachedImg.naturalWidth * scale;
            const sh = this._cachedImg.naturalHeight * scale;
            const sx = (this._canvasW - sw) / 2;
            const sy = (this._canvasH - sh) / 2;
            ctx.drawImage(this._cachedImg, sx, sy, sw, sh);
        }
    }

    // 绘制半透明遮罩并在缺口处挖空
    // 用 destination-out 复合而非在遮罩上填缺口色：缺口需透出底层背景图，固定色无法替代
    _drawMask(ctx) {
        ctx.fillStyle = `rgba(0, 0, 0, ${MASK_ALPHA})`;
        ctx.fillRect(0, 0, this._canvasW, this._canvasH);

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        this._drawPuzzleHole(ctx, this._gapX, this._gapY, this._gapW, this._gapH, this._gapRadius);
        ctx.restore();
    }

    // 构建拼图块形状路径
    // 四条边各含一个半圆凸起，凸起一律朝外（上/右/下/左），形成十字星咬合轮廓，四角以圆角过渡
    // 凸起位置左右/上下错开（上边与左边在 35%，右边与下边在 65%），与 getBlockShape 的取值必须一致
    // 路径顺序：上边 → 右上角 → 右边 → 右下角 → 下边 → 左下角 → 左边 → 左上角
    _puzzlePath(ctx, x, y, w, h, r) {
        const tabR = Math.min(w * 0.18, h * 0.32, 16);
        const rr = Math.min(r, w / 4, h / 4);

        // 上边（左→右），凸起在 35% 位置
        const topTabCx = x + w * 0.35;
        ctx.moveTo(x + rr, y);
        ctx.lineTo(topTabCx - tabR, y);
        // 顺时针（sweep=1 语义之外的 anticlockwise=false）：走上半圆弧，向上凸出
        ctx.arc(topTabCx, y, tabR, Math.PI, 0, false);
        ctx.lineTo(x + w - rr, y);
        ctx.arcTo(x + w, y, x + w, y + rr, rr);

        // 右边（上→下），凸起在 65% 位置
        const rightTabCy = y + h * 0.65;
        ctx.lineTo(x + w, rightTabCy - tabR);
        ctx.arc(x + w, rightTabCy, tabR, -Math.PI / 2, Math.PI / 2, false);
        ctx.lineTo(x + w, y + h - rr);
        ctx.arcTo(x + w, y + h, x + w - rr, y + h, rr);

        // 下边（右→左），凸起在 65% 位置
        const bottomTabCx = x + w * 0.65;
        ctx.lineTo(bottomTabCx + tabR, y + h);
        // 顺时针经 π/2（屏幕下方），向外凸出
        ctx.arc(bottomTabCx, y + h, tabR, 0, Math.PI, false);
        ctx.lineTo(x + rr, y + h);
        ctx.arcTo(x, y + h, x, y + h - rr, rr);

        // 左边（下→上），凸起在 35% 位置
        const leftTabCy = y + h * 0.35;
        ctx.lineTo(x, leftTabCy + tabR);
        // 顺时针经 π（屏幕左侧），向外凸出
        ctx.arc(x, leftTabCy, tabR, Math.PI / 2, -Math.PI / 2, false);
        ctx.lineTo(x, y + rr);
        ctx.arcTo(x, y, x + rr, y, rr);
    }

    // 绘制填充的拼图缺口
    _drawPuzzleHole(ctx, x, y, w, h, r) {
        ctx.beginPath();
        this._puzzlePath(ctx, x, y, w, h, r);
        ctx.closePath();
        ctx.fill();
    }

    // 绘制拼图块接缝线
    // 双路径方案：外路径放大 1px 用亮色描边（暗背景可见），内路径缩小 1px 用暗色描边（亮背景可见）
    // 再叠加 shadowBlur 投影，确保在任意背景图上都能分辨轮廓
    _drawPuzzleSeam(ctx, x, y, w, h, r) {
        ctx.save();

        ctx.beginPath();
        this._puzzlePath(ctx, x - 1, y - 1, w + 2, h + 2, r);
        ctx.closePath();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 1;
        ctx.shadowOffsetY = 1;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        ctx.beginPath();
        this._puzzlePath(ctx, x + 1, y + 1, w - 2, h - 2, r * 0.8);
        ctx.closePath();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
        ctx.shadowBlur = 3;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 1;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.restore();
    }

    // 返回拼图块的扩展尺寸与 CSS clip-path
    // DOM 块必须扩大到 (w+2*tabR)×(h+2*tabR) 才能容纳四条边的凸起，核心矩形因此偏移 tabR
    // 弧线参数与 _puzzlePath 一一对应，改一处必须同步改另一处
    getBlockShape() {
        const w = this._gapW;
        const h = this._gapH;
        const tabR = Math.min(w * 0.18, h * 0.32, 16);
        const rr = Math.min(this._gapRadius, w / 4, h / 4);

        // 扩展后的总尺寸
        const ew = w + 2 * tabR;
        const eh = h + 2 * tabR;

        // 核心矩形在扩展空间中的偏移量固定为 tabR（四边凸起宽度一致）
        const ox = tabR;
        const oy = tabR;

        const topCx    = ox + w * 0.35;
        const rightCy  = oy + h * 0.65;
        const bottomCx = ox + w * 0.65;
        const leftCy   = oy + h * 0.35;

        const p = [
            `M ${ox + rr} ${oy}`,
            `L ${topCx - tabR} ${oy}`,
            // 上边凸起：顺时针，向上凸出
            `A ${tabR} ${tabR} 0 0 1 ${topCx + tabR} ${oy}`,
            `L ${ox + w - rr} ${oy}`,
            // 右上角：sweep=1，顺时针经外侧
            `A ${rr} ${rr} 0 0 1 ${ox + w} ${oy + rr}`,
            `L ${ox + w} ${rightCy - tabR}`,
            // 右边凸起
            `A ${tabR} ${tabR} 0 0 1 ${ox + w} ${rightCy + tabR}`,
            `L ${ox + w} ${oy + h - rr}`,
            // 右下角
            `A ${rr} ${rr} 0 0 0 ${ox + w - rr} ${oy + h}`,
            `L ${bottomCx + tabR} ${oy + h}`,
            // 下边凸起
            `A ${tabR} ${tabR} 0 0 1 ${bottomCx - tabR} ${oy + h}`,
            `L ${ox + rr} ${oy + h}`,
            // 左下角：sweep=1，顺时针经外侧
            `A ${rr} ${rr} 0 0 1 ${ox} ${oy + h - rr}`,
            `L ${ox} ${leftCy + tabR}`,
            // 左边凸起
            `A ${tabR} ${tabR} 0 0 1 ${ox} ${leftCy - tabR}`,
            `L ${ox} ${oy + rr}`,
            // 左上角
            `A ${rr} ${rr} 0 0 0 ${ox + rr} ${oy}`,
            `Z`,
        ].join(' ');

        return {
            w: ew,
            h: eh,
            tabR: tabR,
            clipPath: `path('${p}')`,
        };
    }

    // 更新块/缺口大小
    // 画布尺寸不变而缺口变化，故需重新夹紧 Y 并重置 X，避免缺口越界
    setBlockSize(blockSize) {
        this._gapW = blockSize;
        this._gapH = blockSize;
        this._clampGapY();
        this._resetGapX();
    }

    // 更新画布尺寸
    // 块大小不变，仅缺口 Y 重新居中、缺口 X 重新随机
    updateSize(width, height) {
        this._canvasW = width;
        this._canvasH = height;
        this._clampGapY();
        this._resetGapX();
    }

    // 释放缓存与回调引用
    destroy() {
        this._cachedImg = null;
        this._onRedraw = null;
    }
}
