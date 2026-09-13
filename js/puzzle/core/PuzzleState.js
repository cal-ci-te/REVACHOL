// ！拼图状态管理
// 每个 Puzzle 实例的独立状态管理，不依赖全局 AppState。
// 持有配置快照、图片、完成标志与进度，变更经内部 EventEmitter 通知订阅方。
import { EventEmitter } from './EventEmitter.js';

// 默认配置
// blockSize 即缺口大小，统一由此字段控制
// overhang 为块超出画布边缘的像素，过大则滑块精度降低
// position 为 { x, y }，null 表示流式模式；image 为 dataUrl，null 表示未设置
const DEFAULTS = {
    width: 480,
    height: 180,
    blockSize: 72,
    overhang: 100,
    position: null,
    image: null,
    autoSave: true,
    storageKey: 'rv_puzzle_state',
};

export class PuzzleState {
    // 配置与运行时状态分离：_config 可整体序列化，_image/_completed/_progress/_gapX 为会话态
    constructor(config = {}) {
        this._events = new EventEmitter();
        this._config = { ...DEFAULTS, ...config };
        this._image = this._config.image || null;
        this._completed = false;
        this._progress = 0;
        this._gapX = 0;
    }

    // 事件代理
    on(event, cb)   { this._events.on(event, cb); return this; }
    off(event, cb)  { this._events.off(event, cb); return this; }
    emit(event, data) { this._events.emit(event, data); }
    once(event, cb)  { this._events.once(event, cb); return this; }

    // 配置读写
    // 返回拷贝而非内部引用：防止调用方绕过 updateConfig 直接改配置而跳过事件通知
    getConfig() {
        return { ...this._config };
    }

    updateConfig(partial) {
        Object.assign(this._config, partial);
        this.emit('config:changed', this.getConfig());
    }

    setSize(width, height) {
        this._config.width = width;
        this._config.height = height;
        this.emit('config:changed', this.getConfig());
    }

    // 设置块超出画布边缘的像素
    // 上限 500 防止 overhang 大过画布导致滑块可移动范围趋近于 0
    setOverhang(px) {
        this._config.overhang = Math.max(0, Math.min(px, 500));
    }

    // 设置位置
    // x 为 null 表示切回流式模式，此时忽略 y
    setPosition(x, y) {
        if (x === null) {
            this._config.position = null;
        } else {
            this._config.position = { x, y };
        }
    }

    // 图片读写
    getImage() {
        return this._image;
    }

    // 设置图片
    // 值未变化则直接返回：避免同一图片重复触发 image:changed 导致无谓重绘
    setImage(dataUrl) {
        const newVal = dataUrl || null;
        if (this._image === newVal) return;
        this._image = newVal;
        this.emit('image:changed', this._image);
    }

    // 缺口位置
    getGapX() {
        return this._gapX;
    }

    // 随机重置缺口 X 坐标
    // 随机范围避开画布两端各 100px，保证缺口与滑块都有完整可见区域
    // 画布过窄（w - gapW - 200 < 0）时乘出负偏移，故再夹回下界 100
    resetGapX() {
        const w = this._config.width;
        const gapW = this._config.blockSize;
        this._gapX = 100 + Math.random() * (w - gapW - 200);
        if (this._gapX < 100) this._gapX = 100;
    }

    // 完成状态
    isCompleted() {
        return this._completed;
    }

    // 设置完成状态
    // 仅在真正翻转时通知；翻转为完成时额外发一次 complete，供只关心「完成瞬间」的订阅方使用
    setCompleted(val) {
        const prev = this._completed;
        this._completed = !!val;
        if (this._completed !== prev) {
            this.emit('completed:changed', this._completed);
            if (this._completed) this.emit('complete');
        }
    }

    // 进度
    getProgress() {
        return this._progress;
    }

    // 设置进度（夹在 0–1）
    setProgress(val) {
        this._progress = Math.max(0, Math.min(1, val));
        this.emit('progress', this._progress);
    }

    // 序列化
    // 只导出可跨会话恢复的字段，进度与缺口位置视为瞬态、不入存档
    exportState() {
        return {
            config: this.getConfig(),
            image: this._image,
            completed: this._completed,
        };
    }

    // 反序列化
    // 逐字段判断存在再写入，兼容缺少部分字段的旧存档
    importState(data) {
        if (!data) return;
        if (data.config) this.updateConfig(data.config);
        if (data.image !== undefined) this.setImage(data.image);
        if (data.completed !== undefined) this.setCompleted(data.completed);
    }

    destroy() {
        this._events.destroy();
    }
}
