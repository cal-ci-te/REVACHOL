// ！拼图滑块控制器
// 自定义 DOM 滑块，绕过浏览器 <input type=range> 对 thumb 的内置裁切限制。
// 每实例独立：构造时注入配置，destroy() 完整解绑全部监听器。
// 拖拽采用偏移量跟随模式：按下记录鼠标与滑块的初始偏移，移动时保持该偏移，避免滑块跳到光标中心。
const SLIDER_MIN = 0;
const SLIDER_MAX = 110;
const ALIGN_THRESHOLD = 5;

export class PuzzleDrag {
    // 配置项：canvasW 画布宽、blockW 块宽、thumbW 滑块宽、overhang 越界余量、gapX 缺口位置
    // 全部给默认值：便于测试与渐进式初始化时只覆盖关心的字段
    constructor(config = {}) {
        this._canvasW = config.canvasW || 480;
        this._blockW = config.blockW || 72;
        this._thumbW = config.thumbW || 32;
        this._overhang = config.overhang || 0;
        this._gapX = config.gapX || 0;
        this._scale = 1;
        this._minThumbX = 0;
        this._currentValue = SLIDER_MIN;

        // DOM 引用
        this._track = null;
        this._thumb = null;
        this._onChange = null;
        this._onDragEnd = null;

        // 清理引用
        this._onMove = null;
        this._onEnd = null;
        this._rafId = null;

        // 拖拽偏移（鼠标到滑块中心的距离，保证平滑跟随）
        this._dragOffset = 0;
    }

    get sliderMin() { return SLIDER_MIN; }
    get sliderMax() { return SLIDER_MAX; }
    get sliderInit() { return SLIDER_MIN; }

    setScale(s) { this._scale = s || 1; }
    setMinThumbX(x) { this._minThumbX = x; }
    // overhang 与 blockW 都会改变滑块可移动范围，故修改后必须重算最小 X
    setOverhang(px) { this._overhang = px || 0; this._recalcMinThumbX(); }
    setGapX(gapX) { this._gapX = gapX; }
    setCanvasW(w) { this._canvasW = w; }
    setBlockW(w) { this._blockW = w; this._recalcMinThumbX(); }

    // 当 blockSize 或 overhang 变化时重算滑块最小 X 位置
    _recalcMinThumbX() {
        this._minThumbX = -this._overhang + this._blockW / 2 - this._thumbW / 2;
    }

    // 绑定轨道与滑块并初始化位置
    // 先 destroy 再重建：允许对同一实例换绑 DOM，避免旧监听器重复触发
    // onChange(blockX, isAligned) 在拖拽与程序化设值两条路径上都会回调
    init(track, thumb, onChange, onDragEnd) {
        this.destroy();

        this._track = track;
        this._thumb = thumb;
        this._onChange = onChange;
        this._onDragEnd = onDragEnd || null;
        if (!track || !thumb) return;

        this._bindDrag();
        this._syncThumbToBlockX(this._mapValueToX(SLIDER_MIN));
    }

    // 滑块值 → blocks X 坐标
    _mapValueToX(value) {
        const ratio = (value - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN);
        const minX = -this._overhang;
        const maxX = this._canvasW - this._blockW + this._overhang;
        return minX + ratio * (maxX - minX);
    }

    // 滑块中心 X → 滑块值
    _mapXToValue(centerX) {
        const minX = -this._overhang + this._blockW / 2;
        const maxX = this._canvasW - this._blockW + this._overhang + this._blockW / 2;
        const ratio = (centerX - minX) / (maxX - minX);
        return Math.round(SLIDER_MIN + ratio * (SLIDER_MAX - SLIDER_MIN));
    }

    // 注意：_bindDrag 内部用局部函数 blockXToThumbLeft / thumbLeftToBlockX 做双向转换，
    // _setBlockX / _syncThumbToBlockX 仅由 reset 与初始化恢复调用，两者公式必须保持一致。

    _bindDrag() {
        const self = this;
        let dragging = false;
        let startThumbLeft = 0;
        let startMouseX = 0;

        // 鼠标与触摸统一取横坐标：触摸事件取第一个触点
        const getClientX = (e) => (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;

        // 将 thumb CSS left 值反算为 blockX
        // 除以 scale 还原视觉坐标到逻辑坐标，再加回 minThumbX 与半宽差
        const thumbLeftToBlockX = (leftPx) => {
            return (leftPx / (self._scale || 1)) - self._blockW / 2 + self._thumbW / 2 + self._minThumbX;
        };

        // 将 blockX 转换为 thumb CSS left，并钳制到有效范围
        const blockXToThumbLeft = (bx) => {
            const minX = -self._overhang;
            const maxX = self._canvasW - self._blockW + self._overhang;
            // 画布过窄（maxX <= minX）时范围无意义，返回 0 避免除零
            if (maxX <= minX) return 0;
            const clamped = Math.max(minX, Math.min(bx, maxX));
            return (clamped + self._blockW / 2 - self._thumbW / 2 - self._minThumbX) * (self._scale || 1);
        };

        // 更新滑块到新位置并通知 onChange
        // 先反算 blockX 再经 blockXToThumbLeft 钳制，保证越界拖拽时视觉位置与上报值一致
        const moveThumbTo = (newLeft) => {
            if (!self._thumb) return;
            const rawBlockX = thumbLeftToBlockX(newLeft);
            const clampedLeft = blockXToThumbLeft(rawBlockX);
            const clampedBlockX = thumbLeftToBlockX(clampedLeft);

            self._thumb.style.left = clampedLeft + 'px';
            self._currentValue = Math.round(
                SLIDER_MIN + ((clampedBlockX + self._overhang) / (self._canvasW - self._blockW + 2 * self._overhang)) * (SLIDER_MAX - SLIDER_MIN)
            );
            self._currentValue = Math.max(SLIDER_MIN, Math.min(self._currentValue, SLIDER_MAX));
            const isAligned = Math.abs(clampedBlockX - self._gapX) < ALIGN_THRESHOLD;

            try {
                if (self._onChange) self._onChange(clampedBlockX, isAligned);
            } catch (e) {
                console.warn('[PuzzleDrag] onChange 异常:', e);
            }
        };

        const onStart = (e) => {
            e.preventDefault();
            dragging = true;
            startThumbLeft = self._thumb ? parseFloat(self._thumb.style.left) || 0 : 0;
            startMouseX = getClientX(e);
            // 拖拽期间禁用文本选择并加 active 类：否则快速拖动会选中文本、丢失光标状态
            document.body.style.userSelect = 'none';
            document.body.style.webkitUserSelect = 'none';
            if (self._thumb) self._thumb.classList.add('puzzle-slider-thumb-active');
        };

        const onMove = (e) => {
            if (!dragging || !self._thumb) return;
            const dx = getClientX(e) - startMouseX;
            const newLeft = startThumbLeft + dx / (self._scale || 1);
            moveThumbTo(newLeft);
        };

        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
            document.body.style.webkitUserSelect = '';
            if (self._thumb) self._thumb.classList.remove('puzzle-slider-thumb-active');
            // 拖拽结束回调用于持久化，失败静默忽略：存档问题不应影响交互收尾
            if (self._onDragEnd) {
                try { self._onDragEnd(); } catch (e) {
                    // 忽略持久化异常
                }
            }
        };

        // thumb 拖拽
        // 阻止冒泡：否则会同时触发轨道点击跳转逻辑，造成位置跳变
        if (this._thumb) {
            const thumbStart = (e) => {
                e.stopPropagation();
                onStart(e);
            };
            this._thumb.addEventListener('mousedown', thumbStart);
            this._thumb.addEventListener('touchstart', thumbStart, { passive: false });
        }

        // 点击轨道空白区域直接跳到点击位置
        // 鼠标位置对齐滑块中心，故左值要减去半个滑块宽
        if (this._track) {
            this._track.addEventListener('mousedown', (e) => {
                if (e.target === self._thumb) return;
                e.preventDefault();
                const trackRect = self._track.getBoundingClientRect();
                const clickX = getClientX(e) - trackRect.left;
                const newLeft = clickX - self._thumbW / 2;
                moveThumbTo(newLeft);
                onStart(e);
            });
        }

        // move/end 挂在 document 而非 track：拖出轨道范围后仍需继续响应
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

        this._onMove = onMove;
        this._onEnd = onEnd;
    }

    // 按 blockX 设置滑块位置（程序化设值，如 reset 或状态恢复）
    // 走「blockX → 滑块值 → 反算 blockX」的量化路径，与拖拽路径的取整行为保持一致
    _setBlockX(blockX) {
        const minX = -this._overhang;
        const maxX = this._canvasW - this._blockW + this._overhang;
        const range = maxX - minX;
        if (range <= 0) return;

        const ratio = (blockX - minX) / range;
        const value = Math.round(SLIDER_MIN + ratio * (SLIDER_MAX - SLIDER_MIN));
        const clamped = Math.max(SLIDER_MIN, Math.min(value, SLIDER_MAX));
        const clampedBlockX = minX + ((clamped - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * range;

        if (this._thumb) {
            this._thumb.style.left =
                ((clampedBlockX + this._blockW / 2 - this._thumbW / 2 - this._minThumbX) * this._scale) + 'px';
        }

        this._currentValue = clamped;
        const isAligned = Math.abs(clampedBlockX - this._gapX) < ALIGN_THRESHOLD;

        try {
            if (this._onChange) this._onChange(clampedBlockX, isAligned);
        } catch (e) {
            console.warn('[PuzzleDrag] onChange 异常:', e);
        }
    }

    // 仅同步滑块视觉位置，不触发 onChange
    // 用于初始化：此时订阅方尚未就绪，铺回调会造成状态回环
    _syncThumbToBlockX(blockX) {
        if (!this._thumb) return;
        this._thumb.style.left =
            ((blockX + this._blockW / 2 - this._thumbW / 2 - this._minThumbX) * this._scale) + 'px';
    }

    // 复位到最小位置
    reset() {
        this._setBlockX(this._mapValueToX(SLIDER_MIN));
    }

    // 解绑全部监听器并清空引用
    // 幂等且可重复调用：init 会先 destroy，防止同一实例反复 init 时监听器累积
    destroy() {
        if (this._onMove) {
            document.removeEventListener('mousemove', this._onMove);
            document.removeEventListener('touchmove', this._onMove);
        }
        if (this._onEnd) {
            document.removeEventListener('mouseup', this._onEnd);
            document.removeEventListener('touchend', this._onEnd);
        }
        this._track = null;
        this._thumb = null;
        this._onChange = null;
        this._onDragEnd = null;
        this._onMove = null;
        this._onEnd = null;
        this._dragOffset = 0;
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
    }
}
