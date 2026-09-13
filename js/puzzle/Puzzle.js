// ！滑动拼图主控
// 组装 State / Renderer / Drag / Storage 四个子模块，管理完整生命周期。
// 支持多实例独立运行、配置驱动尺寸与位置、依赖注入（theme/storage 可替换）。
import { PuzzleState } from './core/PuzzleState.js';
import { PuzzleRenderer } from './core/PuzzleRenderer.js';
import { PuzzleDrag } from './core/PuzzleDrag.js';
import { StorageAdapter } from './StorageAdapter.js';

const THUMB_W = 32;
const GAP_RADIUS = 8;

export class Puzzle {
    // options 支持：
    // width/height/blockSize/overhang 尺寸与越界余量；position 为 { x, y } 或 null（流式模式）；
    // image 为 dataUrl；storageKey/autoSave 控制持久化；theme 为 { getPuzzleBackground() }；
    // storage 为存储后端；mountPoint/insertPosition 指定流式挂载点；uiStrings 覆盖默认文案。
    constructor(options = {}) {
        this._opts = options;

        // 先校验尺寸边界再构造子模块：非法尺寸应尽早失败，不留下半成品实例
        this._validateBounds();

        // 内部组件
        // 经 _pickDefined 过滤后再传入：未传的键会保持 undefined 并覆盖 PuzzleState 的默认值
        this._state = new PuzzleState(this._pickDefined({
            width: options.width,
            height: options.height,
            blockSize: options.blockSize,
            overhang: options.overhang,
            position: options.position,
            image: options.image,
            storageKey: options.storageKey,
            autoSave: options.autoSave !== false,
        }));

        this._renderer = new PuzzleRenderer({
            width: this._state.getConfig().width,
            height: this._state.getConfig().height,
            blockSize: this._state.getConfig().blockSize,
            gapRadius: GAP_RADIUS,
        });

        this._drag = new PuzzleDrag({
            canvasW: this._state.getConfig().width,
            blockW: this._state.getConfig().blockSize,
            thumbW: THUMB_W,
            overhang: this._state.getConfig().overhang,
        });

        this._storage = new StorageAdapter({
            storageKey: options.storageKey || 'rv_puzzle_state',
            backend: options.storage || (typeof localStorage !== 'undefined' ? localStorage : null),
        });

        // 外部依赖注入（theme 需提供 getPuzzleBackground() 方法）
        this._themeProvider = options.theme || null;
        this._mountPoint = options.mountPoint || null;
        this._insertPos = options.insertPosition || 'beforeend';
        this._strings = options.uiStrings || null;

        // 运行时状态
        this._widget = null;
        this._slider = null;
        this._canvas = null;
        this._block = null;
        this._gap = null;
        this._flash = null;
        this._hint = null;
        this._thumb = null;
        this._track = null;
        this._wrapper = null;
        this._rafId = null;
        this._resizeHandler = null;
        this._flashTimer = null;
        this._destroyed = false;
    }

    // 初始化：创建 DOM → 绑定交互 → 渲染 → 监听状态
    // 已销毁的实例直接返回而不抛错：重复调用 init 属调用方失误，但不值得中断整页脚本
    // 移动端整体跳过：拼图交互在窄屏无可用操作方式，初始化只会产生不可用 UI
    init() {
        if (this._destroyed) {
            console.warn('[Puzzle] 已销毁，不能重新初始化');
            return this;
        }

        if (this._isMobile()) {
            console.log('[Puzzle] 移动端，跳过拼图初始化');
            return this;
        }

        console.log('[Puzzle] 开始初始化…');

        // 必须在 importState/_render 之前挂上重绘回调：_drawBackgroundFromImage 首次创建
        // _cachedImg 时就会读取 _onRedraw，晚挂则图片加载完成后不会触发重绘
        this._renderer._onRedraw = () => {
            if (!this._destroyed && this._canvas) this._render();
        };

        // 从存储恢复
        // 恢复配置后需把尺寸、块大小、overhang 同步到渲染器与拖拽模块：三者各持一份配置副本
        // 旧存档缺 position 时补默认坐标，避免历史数据停留在流式模式下丢失拖拽入口
        if (this._state.getConfig().autoSave) {
            const saved = this._storage.load();
            if (saved) {
                console.log('[Puzzle] 从 localStorage 恢复状态, config:', JSON.stringify(saved.config));
                this._state.importState(saved);
                const cfg = this._state.getConfig();
                if (!cfg.position) {
                    this._state.setPosition(525, 450);
                }
                this._renderer.updateSize(cfg.width, cfg.height);
                this._renderer.setBlockSize(cfg.blockSize);
                this._drag.setCanvasW(cfg.width);
                this._drag.setBlockW(cfg.blockSize);
                this._drag.setOverhang(cfg.overhang);
            }
        }

        this._buildDOM();
        console.log('[Puzzle] DOM 已构建 — widget:', !!this._widget, 'canvas:', !!this._canvas,
            'track:', !!this._track, 'thumb:', !!this._thumb);

        this._bindDrag();
        console.log('[Puzzle] 拖拽已绑定 — gapX:', this._renderer.gapX);

        this._bindStateListeners();
        this._render();
        console.log('[Puzzle] 首帧已渲染 — gapX:', this._renderer.gapX,
            'image:', !!this._state.getImage(), 'completed:', this._state.isCompleted());

        // 首帧渲染后才把缺口位置交给拖拽模块：gapX 在 _render 中可能被重新随机
        this._drag.setGapX(this._renderer.gapX);
        this._drag.reset();

        // 暴露实例引用：外部工具与旧版脚本依赖该全局入口做手动调试
        if (typeof window !== 'undefined') {
            window.__puzzleInstance = this;
        }

        this._state.emit('ready');

        const cfg = this._state.getConfig();
        console.log('[Puzzle] 初始化完成 —', cfg.width + '×' + cfg.height,
            cfg.position ? '坐标模式' : '流式模式');
        return this;
    }

    render() {
        this._render();
        return this;
    }

    // 复位：重新随机缺口、滑块归位、清除完成态与完成提示
    reset() {
        this._renderer.resetGap();
        this._drag.setGapX(this._renderer.gapX);
        this._drag.reset();
        this._state.setCompleted(false);
        if (this._flash) this._flash.classList.remove('puzzle-flash-active');
        if (this._hint && this._strings) this._hint.textContent = this._strings.hint || '拖动滑块完成拼图';
        this._render();
        return this;
    }

    // 销毁：幂等，重复调用直接返回
    // 清理顺序为「子模块 → 定时器与监听 → DOM → 全局引用」，确保拆卸过程中不会再触发渲染
    destroy() {
        if (this._destroyed) return this;
        this._destroyed = true;

        this._drag.destroy();
        this._renderer.destroy();
        this._state.destroy();

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
            this._resizeHandler = null;
        }
        if (this._flashTimer) {
            clearTimeout(this._flashTimer);
            this._flashTimer = null;
        }
        if (this._dragHandleCleanup) {
            this._dragHandleCleanup();
            this._dragHandleCleanup = null;
        }

        if (this._widget && this._widget.parentNode) this._widget.parentNode.removeChild(this._widget);
        if (this._slider && this._slider.parentNode) this._slider.parentNode.removeChild(this._slider);
        if (this._wrapper && this._wrapper.parentNode) this._wrapper.parentNode.removeChild(this._wrapper);

        if (typeof window !== 'undefined' && window.__puzzleInstance === this) {
            delete window.__puzzleInstance;
        }

        console.log('[Puzzle] 已销毁');
        return this;
    }

    // 配置更新
    // 画布按容器宽度等比缩放：画布逻辑尺寸保持配置值，仅压缩 CSS 尺寸，
    // 拖拽模块据 clientWidth 与实际宽度之比得到 scale，把视觉位移换算回逻辑坐标
    setSize(width, height) {
        this._validateSize(width, height);
        this._state.setSize(width, height);
        this._renderer.updateSize(width, height);
        this._drag.setCanvasW(width);
        this._drag.setGapX(this._renderer.gapX);
        if (this._canvas) {
            this._canvas.width = width;
            this._canvas.height = height;
            const wrapper = this._canvas.parentElement;
            const maxW = wrapper ? wrapper.clientWidth : window.innerWidth;
            if (maxW < width) {
                const s = maxW / width;
                this._canvas.style.width = maxW + 'px';
                this._canvas.style.height = (height * s) + 'px';
            } else {
                this._canvas.style.width = width + 'px';
                this._canvas.style.height = height + 'px';
            }
            this._drag.setScale((this._canvas.clientWidth / width) || 1);
        }
        this._updateTrackLayout();
        this._render();
        return this;
    }

    setOverhang(px) {
        this._state.setOverhang(px);
        this._drag.setOverhang(px);
        this._drag.setGapX(this._renderer.gapX);
        this._updateTrackLayout();
        return this;
    }

    // 设置坐标位置
    // x 或 y 任一为 null 即切回流式模式；否则先夹到可移动范围内再写入，防止拼图被拖出视口
    setPosition(x, y) {
        if (x === null || y === null) {
            this._state.setPosition(null, null);
            return this;
        }
        const bounds = this._getPositionBounds();
        const cx = Math.max(bounds.minX, Math.min(x, bounds.maxX));
        const cy = Math.max(bounds.minY, Math.min(y, bounds.maxY));
        this._state.setPosition(cx, cy);
        if (this._widget) {
            this._widget.style.left = cx + 'px';
            this._widget.style.top = cy + 'px';
        }
        return this;
    }

    // 按字段分发配置更新
    // blockSize 变化需同时同步渲染器、拖拽模块与轨道布局：三处各持副本，漏一处会出现形状与滑块错位
    updateConfig(partial) {
        if (partial.width !== undefined || partial.height !== undefined) {
            this.setSize(
                partial.width ?? this._state.getConfig().width,
                partial.height ?? this._state.getConfig().height
            );
        }
        if (partial.overhang !== undefined) {
            this.setOverhang(partial.overhang);
        }
        if (partial.blockSize !== undefined) {
            this._state.updateConfig({ blockSize: partial.blockSize });
            this._renderer.setBlockSize(partial.blockSize);
            this._drag.setBlockW(partial.blockSize);
            this._drag.setGapX(this._renderer.gapX);
            this._updateTrackLayout();
        }
        return this;
    }

    // 更新滑块轨道 DOM 宽度（blockSize/overhang 变化后调用）
    // 轨道宽度按「滑块中心可移动范围 + 一个滑块宽」计算，再乘以缩放换成 CSS 像素
    // 滑块位置由 Canvas 与 widget 两处视口矩形之差推出，与 _bindDrag 中的定位口径一致
    _updateTrackLayout() {
        if (!this._track || !this._canvas || !this._slider) return;
        const config = this._state.getConfig();
        const { width, blockSize, overhang } = config;
        const THUMB_W = 32;
        const scale = this._drag._scale || 1;
        const minThumbX = -overhang + blockSize / 2 - THUMB_W / 2;
        const maxThumbX = width - blockSize + overhang + blockSize / 2 + THUMB_W / 2;
        this._track.style.width = ((maxThumbX - minThumbX) * scale) + 'px';

        const cRect = this._canvas.getBoundingClientRect();
        const wRect = this._widget ? this._widget.getBoundingClientRect() : { left: 0, top: 0 };
        this._slider.style.left = (cRect.left - wRect.left + minThumbX * scale) + 'px';
        this._slider.style.top = (cRect.bottom - wRect.top + 12) + 'px';

        this._drag.setMinThumbX(minThumbX);
    }

    // 图片
    // 换图后滑块必须复位：新图对应新的缺口位置，沿用旧位置会直接命中或明显偏离
    setImage(dataUrl) {
        this._state.setImage(dataUrl);
        this._drag.reset();
        this._render();
        return this;
    }

    // 事件监听
    on(event, cb)   { this._state.on(event, cb); return this; }
    off(event, cb)  { this._state.off(event, cb); return this; }
    once(event, cb) { this._state.once(event, cb); return this; }

    // 存储
    // 一并写入滑块当前值：滑块是纯 DOM 状态，不在 state 的序列化范围内
    save() {
        const data = this._state.exportState();
        data.sliderValue = this._drag._currentValue;
        this._storage.save(data);
        return this;
    }

    // 读取存档并应用
    // 额外延迟一帧重绘：importState 后 DOM 尺寸可能尚未完成布局，立即读 canvas 像素会偏
    load() {
        const data = this._storage.load();
        if (data) {
            this.importState(data);
            this._drag.reset();
            if (typeof requestAnimationFrame !== 'undefined') {
                const self = this;
                requestAnimationFrame(() => { if (!self._destroyed) self._render(); });
            }
        }
        return this;
    }

    exportState() { return this._state.exportState(); }

    // 导入状态并同步到渲染器、拖拽模块与 Canvas DOM
    // PuzzleState.importState 只改内部 state，DOM 属性与子模块的配置副本都必须在此补齐
    importState(data) {
        this._state.importState(data);
        const cfg = this._state.getConfig();
        if (cfg.width !== undefined && cfg.height !== undefined) {
            this._renderer.updateSize(cfg.width, cfg.height);
            this._drag.setCanvasW(cfg.width);
            if (this._canvas) {
                this._canvas.width = cfg.width;
                this._canvas.height = cfg.height;
                const wrapper = this._canvas.parentElement;
                const maxW = wrapper ? wrapper.clientWidth : window.innerWidth;
                if (maxW < cfg.width) {
                    const s = maxW / cfg.width;
                    this._canvas.style.width = maxW + 'px';
                    this._canvas.style.height = (cfg.height * s) + 'px';
                } else {
                    this._canvas.style.width = cfg.width + 'px';
                    this._canvas.style.height = cfg.height + 'px';
                }
                this._drag.setScale((this._canvas.clientWidth / cfg.width) || 1);
            }
        }
        if (cfg.blockSize !== undefined) {
            this._renderer.setBlockSize(cfg.blockSize);
            this._drag.setBlockW(cfg.blockSize);
        }
        if (cfg.overhang !== undefined) {
            this._drag.setOverhang(cfg.overhang);
        }
        this._drag.setGapX(this._renderer.gapX);
        this._updateTrackLayout();
        this._render();
        return this;
    }

    // 状态查询
    isCompleted()    { return this._state.isCompleted(); }
    getProgress()    { return this._state.getProgress(); }
    getConfig()      { return this._state.getConfig(); }
    getImage()       { return this._state.getImage(); }

    // 内部方法

    // 过滤掉值为 undefined 的键，避免对象展开时覆盖默认值
    _pickDefined(obj) {
        const result = {};
        for (const key of Object.keys(obj)) {
            if (obj[key] !== undefined) result[key] = obj[key];
        }
        return result;
    }

    // 绑定拼图整体拖拽（坐标模式下移动 widget 位置）
    // 位置一律读写 CSS 的 left/top 而非 getBoundingClientRect：后者是视口坐标且含缩放，
    // 与本模块的定位坐标系不一致，换算回块坐标会引入漂移
    _bindWidgetDrag(handle) {
        let dragging = false, startX, startY, origLeft, origTop;

        const getClientX = (e) => (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
        const getClientY = (e) => (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;

        const onStart = (e) => {
            // 仅响应拖拽手柄元素本身的点击，防止滑块事件冒泡干扰
            if (e.target !== handle && !handle.contains(e.target)) return;
            // 右键与中键不进入拖拽；触摸事件无 button 字段，故先判存在
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            dragging = true;
            startX = getClientX(e);
            startY = getClientY(e);
            origLeft = parseFloat(this._widget.style.left) || 0;
            origTop  = parseFloat(this._widget.style.top)  || 0;
            handle.classList.add('puzzle-drag-handle-active');
            document.body.style.userSelect = 'none';
        };

        const onMove = (e) => {
            if (!dragging) return;
            const dx = getClientX(e) - startX;
            const dy = getClientY(e) - startY;
            if (this._widget) {
                this._widget.style.left = (origLeft + dx) + 'px';
                this._widget.style.top  = (origTop  + dy) + 'px';
                // 清掉过渡：拖拽中若保留 transition 会滞后于光标，手感发飘
                this._widget.style.transition = '';
            }
        };

        // 松手时才做边界钳制与持久化：拖拽过程中逐帧钳制会让光标与拼图脱节
        const onEnd = () => {
            if (!dragging) return;
            dragging = false;
            document.body.style.userSelect = '';
            handle.classList.remove('puzzle-drag-handle-active');
            if (this._widget) {
                const currentLeft = parseFloat(this._widget.style.left) || 0;
                const currentTop  = parseFloat(this._widget.style.top)  || 0;
                const bounds = this._getPositionBounds();
                const cx = Math.max(bounds.minX, Math.min(currentLeft, bounds.maxX));
                const cy = Math.max(bounds.minY, Math.min(currentTop,  bounds.maxY));
                this._state.setPosition(cx, cy);
                this._widget.style.left = cx + 'px';
                this._widget.style.top  = cy + 'px';
                this.save();
            }
        };

        handle.addEventListener('mousedown', onStart);
        handle.addEventListener('touchstart', onStart, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onEnd);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onEnd);

        // 保存引用以便 destroy 时清理
        this._dragHandleCleanup = () => {
            handle.removeEventListener('mousedown', onStart);
            handle.removeEventListener('touchstart', onStart);
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onEnd);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', onEnd);
        };
    }

    // 按视口宽度判断移动端
    // 用宽度而非 UA：判定依据是可用空间是否放得下拼图，与设备类型无关
    _isMobile() {
        return typeof window !== 'undefined' && window.innerWidth <= 600;
    }

    // 计算拼图可移动范围：仅横向限制，竖向自由移动
    // 竖向范围放宽到视口数倍：只防止被拖到无穷远，不做实质约束
    _getPositionBounds() {
        if (typeof window === 'undefined') return { minX: 8, minY: -9999, maxX: 10000, maxY: 99999 };
        const config = this._state.getConfig();
        const widgetW = config.width + 20;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const minX = 8;

        return {
            minX,
            minY: -vh,
            maxX: Math.max(minX + 100, vw - widgetW - 8),
            maxY: vh * 3,
        };
    }

    // 获取元素底边（视口坐标补滚动偏移，得到文档坐标）
    // 选择器无匹配或非法时返回 null，交由调用方决定兜底位置
    _getElementBottom(selector) {
        try {
            const el = document.querySelector(selector);
            if (!el) return null;
            return el.getBoundingClientRect().bottom + window.scrollY;
        } catch (e) { return null; }
    }

    // 获取元素顶边（视口坐标补滚动偏移，得到文档坐标）
    _getElementTop(selector) {
        try {
            const el = document.querySelector(selector);
            if (!el) return null;
            return el.getBoundingClientRect().top + window.scrollY;
        } catch (e) { return null; }
    }

    // 校验构造参数中的尺寸是否超出页面可用范围
    // 移动端跳过：init 会等比缩小适配，此处报错反而会阻断初始化
    // SSR 环境跳过：无 window 可测
    _validateBounds() {
        const w = this._opts.width || 480;
        const h = this._opts.height || 180;
        if (typeof w !== 'number' || typeof h !== 'number' || isNaN(w) || isNaN(h)) {
            throw new Error('[Puzzle] width 和 height 必须是有效数字');
        }
        if (typeof window === 'undefined') return;
        if (this._isMobile()) return;

        const maxW = window.innerWidth - 40;
        const maxH = window.innerHeight - 100;
        if (w > maxW || h > maxH) {
            throw new Error(
                `[Puzzle] 尺寸 ${w}×${h}px 超出页面可用范围（最大 ${maxW}×${maxH}px）`
            );
        }
    }

    // 校验 setSize 入参
    // 与 _validateBounds 同样跳过移动端：缩放适配后尺寸不再受视口限制
    _validateSize(width, height) {
        if (typeof width !== 'number' || typeof height !== 'number' || isNaN(width) || isNaN(height)) {
            throw new Error('[Puzzle] setSize 参数必须是有效数字');
        }
        if (typeof window === 'undefined') return;
        if (this._isMobile()) return;
        const maxW = window.innerWidth - 40;
        const maxH = window.innerHeight - 100;
        if (width > maxW || height > maxH) {
            throw new Error(
                `[Puzzle] 尺寸 ${width}×${height}px 超出页面可用范围（最大 ${maxW}×${maxH}px）`
            );
        }
    }

    // 获取背景色（优先注入的 theme，否则用缺省 #1a1612）
    _getBgColor() {
        if (this._themeProvider && typeof this._themeProvider.getPuzzleBackground === 'function') {
            return this._themeProvider.getPuzzleBackground();
        }
        return '#1a1612';
    }

    // 获取 UI 文案
    _str(key, fallback) {
        if (this._strings && this._strings[key]) return this._strings[key];
        return fallback || '';
    }

    // 构建 DOM 结构
    // 流式模式与坐标模式结构不同，故在插入阶段分流：
    // 流式模式把 widget 与 slider 放进同一 relative 包裹层；坐标模式把 slider 嵌进 widget 一起移动
    _buildDOM() {
        const config = this._state.getConfig();
        const pos = config.position;
        const { width, height } = config;

        const widget = document.createElement('div');
        widget.id = 'puzzleWidget';
        widget.className = 'puzzle-widget';
        widget.innerHTML = `
            <div class="puzzle-header">
                <span class="puzzle-drag-handle" title="拖拽移动拼图">⠿</span>
                <span class="puzzle-title">${this._str('widgetTitle', '确认您是真人！')}</span>
                <button id="puzzleResetBtn" class="puzzle-reset-btn" title="重置拼图">🔄</button>
            </div>
            <div class="puzzle-canvas-wrapper">
                <canvas id="puzzleCanvas" width="${width}" height="${height}"></canvas>
                <div id="puzzleGap" class="puzzle-gap"></div>
                <div id="puzzleBlock" class="puzzle-block"></div>
                <div id="puzzleFlash" class="puzzle-flash"></div>
            </div>`;

        const slider = document.createElement('div');
        slider.id = 'puzzleSlider';
        slider.className = 'puzzle-slider';
        slider.innerHTML = `
            <div id="puzzleTrack" class="puzzle-track">
                <div id="puzzleThumb" class="puzzle-thumb"></div>
            </div>
            <div id="puzzleHint" class="puzzle-hint">${this._str('hint', '拖动滑块完成拼图——如果你想')}</div>`;

        const target = this._resolveMountPoint();

        if (!pos) {
            const wrapper = document.createElement('div');
            wrapper.className = 'puzzle-wrapper';
            wrapper.style.position = 'relative';
            wrapper.appendChild(widget);
            wrapper.appendChild(slider);
            slider.style.position = 'absolute';
            target.insertAdjacentElement(this._insertPos, wrapper);
            this._wrapper = wrapper;
        } else {
            // 坐标模式：初始坐标先夹进可移动范围，避免存档中的旧坐标让拼图落在视口外
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = Math.min(width + 20, vw - 16);
            const h = Math.min(height + 160, vh - 16);
            const bounds = this._getPositionBounds();
            const x = Math.max(bounds.minX, Math.min(pos.x, bounds.maxX));
            const y = Math.max(bounds.minY, Math.min(pos.y, bounds.maxY));

            widget.style.position = 'absolute';
            widget.style.left = x + 'px';
            widget.style.top = y + 'px';
            widget.style.maxWidth = (vw - 16) + 'px';
            widget.style.margin = '0';
            widget.style.zIndex = '90';
            slider.style.position = 'absolute';
            // slider 层级高于 widget 容器：否则会被 widget 内的画布遮住
            slider.style.zIndex = '91';
            widget.appendChild(slider);
            document.body.appendChild(widget);
        }

        this._widget = widget;
        this._slider = slider;

        // 缓存 DOM 引用
        this._canvas = widget.querySelector('#puzzleCanvas');
        this._block = widget.querySelector('#puzzleBlock');
        this._gap   = widget.querySelector('#puzzleGap');
        this._flash = widget.querySelector('#puzzleFlash');
        this._track = slider.querySelector('#puzzleTrack');
        this._thumb = slider.querySelector('#puzzleThumb');
        this._hint = slider.querySelector('#puzzleHint');

        // 拼图块与缺口共用同一形状数据源，确保两者轮廓视觉一致
        // 同时设置标准与 webkit 前缀属性：仅设其一会导致 Safari 下回退为矩形
        if (this._block || this._gap) {
            const shape = this._renderer.getBlockShape();
            if (this._block) {
                this._block.style.width  = shape.w + 'px';
                this._block.style.height = shape.h + 'px';
                this._block.style.clipPath = shape.clipPath;
                this._block.style.webkitClipPath = shape.clipPath;
            }
            if (this._gap) {
                this._gap.style.width  = shape.w + 'px';
                this._gap.style.height = shape.h + 'px';
                this._gap.style.clipPath = shape.clipPath;
                this._gap.style.webkitClipPath = shape.clipPath;
            }
        }

        // 重置按钮
        const resetBtn = widget.querySelector('#puzzleResetBtn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.reset());
        }

        // 拖拽手柄仅在坐标模式下绑定：流式模式的拼图随文档流排布，移动位置无意义
        const dragHandle = widget.querySelector('.puzzle-drag-handle');
        if (dragHandle && config.position) {
            this._bindWidgetDrag(dragHandle);
        }
    }

    // 解析挂载点
    // 未配置或选择器无匹配时回退 document.body：拼图至少应被渲染出来而非静默消失
    _resolveMountPoint() {
        if (this._mountPoint) {
            if (typeof this._mountPoint === 'string') {
                return document.querySelector(this._mountPoint) || document.body;
            }
            return this._mountPoint;
        }
        return document.body;
    }

    // 绑定滑块交互
    // 缩放与定位拆成两个可重入函数：resize 时两者都要重算，且顺序不能颠倒
    _bindDrag() {
        if (!this._canvas || !this._track || !this._thumb) return;

        const config = this._state.getConfig();
        const { width, blockSize, overhang } = config;

        // Canvas 缩放
        const scaleCanvas = () => {
            const wrapper = this._canvas.parentElement;
            const maxW = wrapper ? wrapper.clientWidth : window.innerWidth;
            if (maxW < width) {
                const s = maxW / width;
                this._canvas.style.width = maxW + 'px';
                this._canvas.style.height = (config.height * s) + 'px';
            } else {
                this._canvas.style.width = width + 'px';
                this._canvas.style.height = config.height + 'px';
            }
            const s = (this._canvas.clientWidth / width) || 1;
            this._drag.setScale(s);
        };
        scaleCanvas();

        // 滑块定位于 canvas 正下方：用两处视口矩形之差换算相对偏移，
        // 不依赖 offsetParent，故在流式与坐标两种模式下都成立
        const positionSlider = () => {
            const cRect = this._canvas.getBoundingClientRect();
            const wRect = this._widget.getBoundingClientRect();
            const scale = this._drag._scale || 1;
            const overhangVal = overhang;
            const minThumbX = -overhangVal + blockSize / 2 - THUMB_W / 2;
            const maxThumbX = width - blockSize + overhangVal + blockSize / 2 + THUMB_W / 2;
            const trackW = (maxThumbX - minThumbX) * scale;

            this._slider.style.position = 'absolute';
            this._slider.style.left = (cRect.left - wRect.left + minThumbX * scale) + 'px';
            this._slider.style.top = (cRect.bottom - wRect.top + 12) + 'px';
            this._slider.style.zIndex = '91';
            this._track.style.width = trackW + 'px';

            this._drag.setMinThumbX(minThumbX);
        };
        positionSlider();

        // Resize 监听
        this._resizeHandler = () => { scaleCanvas(); positionSlider(); };
        window.addEventListener('resize', this._resizeHandler);

        // 初始化 Drag（gapX 由 render 后同步，此处不预设）
        this._drag.setOverhang(overhang);
        this._drag.init(this._track, this._thumb, (blockX, isAligned) => {
            // 同步渲染：块位置与滑块同源公式，无需 rAF 节流
            // rAF 仅作「本帧已排程」的占位标记，回调体不做实际工作
            if (!this._drag._rafId) {
                this._drag._rafId = requestAnimationFrame(() => {
                    this._drag._rafId = null;
                });
            }
            this._render(blockX);
            // 对齐状态双向切换：命中缺口即完成，再度拖离则撤销完成态并还原提示语
            if (isAligned && !this._state.isCompleted()) {
                this._state.setCompleted(true);
                this._triggerFlash();
                if (this._hint && this._strings) this._hint.textContent = this._str('completed', '✨ 拼图完成！');
            } else if (!isAligned && this._state.isCompleted()) {
                this._state.setCompleted(false);
                if (this._hint && this._strings) this._hint.textContent = this._str('hint', '拖动滑块完成拼图——如果你想');
            }
        }, () => {
            // 拖拽结束时持久化滑块位置
            this.save();
        });
    }

    // 绑定内部状态变更监听
    // 订阅而非在改动点直接调用渲染：配置与图片也可能被外部经 state 改动
    _bindStateListeners() {
        this._state.on('image:changed', () => {
            this._drag.reset();
            this._render();
            if (this._state.getConfig().autoSave) this.save();
        });

        this._state.on('config:changed', () => {
            this._render();
        });
    }

    // 核心渲染
    // Canvas 只画完整背景，缺口与拼图块均由 DOM 层绘制：两者在浏览器中的抗锯齿与圆角处理更一致
    _render(blockXOverride) {
        if (!this._canvas) return;

        const ctx = this._canvas.getContext('2d');
        const imageSrc = this._state.getImage();
        const bgColor = this._getBgColor();
        const completed = this._state.isCompleted();
        const config = this._state.getConfig();

        // 首次渲染时缺口尚未定位，补一次随机放置
        if (!this._renderer.gapX) this._renderer._resetGapX();

        const gx = this._renderer.gapX;
        const gy = this._renderer.gapY;

        // 拖拽回调传入实际块坐标；其余渲染入口按当前滑块值反算
        const blockX = blockXOverride !== undefined ? blockXOverride
            : this._drag._mapValueToX ? this._drag._mapValueToX(this._drag._currentValue || 0) : 0;

        ctx.clearRect(0, 0, config.width, config.height);

        if (imageSrc) {
            const img = this._renderer._cachedImg;
            const isLoaded = img && img._src === imageSrc && img.complete && img.naturalWidth > 0;
            if (isLoaded) {
                const info = this._renderer.getImageInfo();
                ctx.drawImage(img, info.sx, info.sy, info.sw, info.sh);
            } else {
                this._renderer._drawBackgroundFromImage(ctx, imageSrc);
            }
        } else {
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, config.width, config.height);
            this._renderer._drawMask(ctx);
        }

        // DOM 层：缺口与拼图块共用 getBlockShape() 保证形状一致
        const shape = this._renderer.getBlockShape();
        const tabR = shape.tabR;

        // Canvas 可能被 CSS 等比缩小，故所有逻辑坐标都要乘以 canvasScale 再落到 DOM 样式
        const cRect = this._canvas.getBoundingClientRect();
        const wrapperEl = this._canvas.parentElement;
        const wRect = wrapperEl ? wrapperEl.getBoundingClientRect() :
            (this._widget ? this._widget.getBoundingClientRect() : { left: 0, top: 0 });
        const canvasScale = (this._canvas.clientWidth / config.width) || 1;
        const canvasOffLeft = cRect.left - wRect.left;
        const canvasOffTop = cRect.top - wRect.top;

        // 缺口层：定位到缺口位置并填充背景色以形成挖空观感
        // 形状数据本身已含 tabR 扩展，故定位时要回退 (gx - tabR)
        if (this._gap) {
            this._gap.style.width  = (shape.w * canvasScale) + 'px';
            this._gap.style.height = (shape.h * canvasScale) + 'px';
            this._gap.style.clipPath = shape.clipPath;
            this._gap.style.webkitClipPath = shape.clipPath;
            this._gap.style.left = (canvasOffLeft + (gx - tabR) * canvasScale) + 'px';
            this._gap.style.top  = (canvasOffTop  + (gy - tabR) * canvasScale) + 'px';
            this._gap.style.backgroundColor = bgColor;
            this._gap.style.display = 'block';
        }

        // 拼图块层：直接从已绘制的主 Canvas 读取缺口区域像素，零计算偏差
        if (this._block) {
            this._block.style.width  = (shape.w * canvasScale) + 'px';
            this._block.style.height = (shape.h * canvasScale) + 'px';
            this._block.style.clipPath = shape.clipPath;
            this._block.style.webkitClipPath = shape.clipPath;
            this._block.style.left = (canvasOffLeft + (blockX - tabR) * canvasScale) + 'px';
            this._block.style.top  = (canvasOffTop  + (gy - tabR) * canvasScale) + 'px';
            this._block.style.display = 'block';

            if (imageSrc) {
                // 主 Canvas 已绘制完整背景图（含缺口位置的图像内容），直接读取像素
                const sx = Math.max(0, Math.floor(gx - tabR));
                const sy = Math.max(0, Math.floor(gy - tabR));
                const sw = Math.min(shape.w, config.width - sx);
                const sh = Math.min(shape.h, config.height - sy);

                if (sw > 0 && sh > 0) {
                    try {
                        const imageData = ctx.getImageData(sx, sy, sw, sh);
                        const offCanvas = document.createElement('canvas');
                        offCanvas.width = shape.w;
                        offCanvas.height = shape.h;
                        const offCtx = offCanvas.getContext('2d');
                        offCtx.putImageData(imageData, 0, 0);
                        this._block.style.backgroundImage = `url(${offCanvas.toDataURL()})`;
                        this._block.style.backgroundSize = '100% 100%';
                        this._block.style.backgroundPosition = '0 0';
                        this._block.style.backgroundColor = '';
                    } catch (e) {
                        // 图片跨域时 getImageData 会因画布被污染而抛 SecurityError，
                        // 此时退化为纯色块：功能仍可用，仅失去贴图
                        console.warn('[Puzzle] 无法从 Canvas 读取缺口像素:', e.message);
                        this._block.style.backgroundImage = 'none';
                        this._block.style.backgroundColor = this._renderer.lighten(bgColor, 0.15);
                    }
                } else {
                    this._block.style.backgroundImage = 'none';
                    this._block.style.backgroundColor = this._renderer.lighten(bgColor, 0.15);
                }
            } else {
                this._block.style.backgroundImage = 'none';
                this._block.style.backgroundColor = this._renderer.lighten(bgColor, 0.15);
            }

            if (completed) {
                this._block.classList.add('puzzle-block-aligned');
            } else {
                this._block.classList.remove('puzzle-block-aligned');
            }
        }
    }

    // 触发完成闪光
    // 先移除类再强制读 offsetWidth：同一帧内重复添加同名类不会重启动画，读布局可强制回流重置
    // 定时器存入 _flashTimer 以便 destroy 时清理，避免已销毁实例的回调仍去操作 DOM
    _triggerFlash() {
        if (!this._flash) return;
        this._flash.classList.remove('puzzle-flash-active');
        void this._flash.offsetWidth;
        this._flash.classList.add('puzzle-flash-active');
        if (this._flashTimer) clearTimeout(this._flashTimer);
        this._flashTimer = setTimeout(() => {
            if (this._flash) this._flash.classList.remove('puzzle-flash-active');
            this._flashTimer = null;
        }, 650);
    }
}

// 向后兼容的工厂函数

// 兼容旧版 initPuzzle() 调用：initPuzzle({ x: 525, y: 450 }) 或 initPuzzle('.hero-section', 'afterend')
// 通过动态 import() 注入全局 AppState / ThemeService / UI 文案，
// 保持与管理面板的图片上传、状态同步功能兼容。
// 动态导入而非静态 import：旧调用点可能在不加载这些模块的页面上使用拼图，静态依赖会直接报错
export async function initPuzzle(arg1, arg2) {
    const opts = {};

    if (typeof arg1 === 'object' && arg1 !== null) {
        if (arg1.x !== undefined || arg1.y !== undefined) {
            opts.position = { x: arg1.x ?? 200, y: arg1.y ?? 400 };
        }
        if (arg1.mountPoint) opts.mountPoint = arg1.mountPoint;
        if (arg1.insertPosition) opts.insertPosition = arg1.insertPosition;
    } else if (typeof arg1 === 'string') {
        opts.mountPoint = arg1;
        if (arg2) opts.insertPosition = arg2;
    }

    // 各依赖独立降级：任一模块缺失时仅关闭对应能力，不影响拼图本体
    let AppState = null, MUTATIONS = null, ThemeService = null, UI = null;
    try { ({ AppState } = await import('../core/app-state.js')); } catch (e) {
        // 无 AppState，不恢复也不回写图片
    }
    try { ({ MUTATIONS } = await import('../core/state-mutations.js')); } catch (e) {
        // 无 MUTATIONS，跳过状态提交
    }
    try { ({ ThemeService } = await import('../services/theme-service.js')); } catch (e) {
        // 无 ThemeService，使用缺省背景色
    }
    try { ({ UI } = await import('../utils/ui-strings.js')); } catch (e) {
        // 无 UI，使用内置文案
    }

    if (ThemeService) opts.theme = ThemeService;
    if (UI && UI.puzzle) opts.uiStrings = UI.puzzle;

    // 从 AppState 恢复图片
    if (AppState) {
        const savedImage = AppState.get('puzzleImage');
        if (savedImage) opts.image = savedImage;

        AppState.subscribe('puzzleImage', (val) => {
            const inst = window.__puzzleInstance;
            if (inst && inst.setImage) inst.setImage(val);
        });
    }

    const puzzle = new Puzzle(opts);

    // 双向同步 AppState 与 Puzzle
    // 忽略提交异常：状态提交失败不应影响拼图自身交互
    if (AppState && MUTATIONS) {
        puzzle.on('completed:changed', (completed) => {
            try { AppState.commit(MUTATIONS.SET_PUZZLE_COMPLETED, completed); } catch (e) {
                // 忽略状态提交失败
            }
        });
        puzzle.on('image:changed', (image) => {
            try { AppState.commit(MUTATIONS.SET_PUZZLE_IMAGE, image); } catch (e) {
                // 忽略状态提交失败
            }
        });
    }

    puzzle.init();
    // 从 localStorage 恢复持久化状态（宽高/块大小/溢出/图片/完成状态）
    puzzle.load();
    return puzzle;
}
