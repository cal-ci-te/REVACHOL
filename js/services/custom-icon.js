// 通用自定义图标管理器 — 为任意 UI 元素提供"自定义图标 + 回退"能力
// 复用站点图标的 CSS 模式：容器 overflow:visible + img/回退切换 + .has-custom 控制
import { Utils } from '../utils.js';

export class CustomIconManager {
  /**
   * @param {Object} config
   * @param {string} config.storageKey        localStorage 键名
   * @param {string} config.containerSelector 容器选择器
   * @param {string} config.imgSelector       图片元素选择器
   * @param {string} config.fallbackSelector  回退元素选择器
   * @param {string} [config.eventName]       更新事件名（可选）
   * @param {string} [config.defaultSrc]      默认图片路径（如 'images/site-icon.png'）
   */
  constructor(config) {
    this._storageKey = config.storageKey;
    this._containerSelector = config.containerSelector;
    this._imgSelector = config.imgSelector;
    this._fallbackSelector = config.fallbackSelector;
    this._eventName = config.eventName || null;
    this._defaultSrc = config.defaultSrc || null;

    /** @type {HTMLElement|null} */
    this.container = null;
    /** @type {HTMLImageElement|null} */
    this.img = null;
    /** @type {HTMLElement|null} */
    this.fallback = null;
    /** @type {boolean} */
    this._initialised = false;
  }

  /** 缓存 DOM 引用 */
  _ensureDom() {
    if (this._initialised) return;
    this.container = document.querySelector(this._containerSelector);
    this.img = document.querySelector(this._imgSelector);
    this.fallback = document.querySelector(this._fallbackSelector);
    if (this.container && this.img) {
      this._initialised = true;
    }
  }

  /** 从 localStorage 读取图标 dataUrl */
  getIcon() {
    return Utils.storage.get(this._storageKey);
  }

  /** 存储图标 dataUrl 并触发更新 */
  setIcon(dataUrl) {
    if (!dataUrl) { this.removeIcon(); return; }
    Utils.storage.set(this._storageKey, dataUrl);
    this.applyIcon(dataUrl);
    this._emitEvent(dataUrl);
  }

  /** 移除图标，恢复默认 */
  removeIcon() {
    Utils.storage.remove(this._storageKey);
    this.applyIcon(null);
    this._emitEvent(null);
  }

  /** 将图标应用到 DOM */
  applyIcon(src) {
    this._ensureDom();
    if (!this.img) return;

    const dataUrl = src !== undefined ? src : this.getIcon();
    const showCustom = !!(dataUrl && dataUrl.length > 0);

    if (showCustom) {
      this.img.src = dataUrl;
      this.img.style.display = '';
      if (this.fallback) this.fallback.style.display = 'none';
      if (this.container) this.container.classList.add('has-custom');
    } else {
      this.img.src = '';
      this.img.style.display = 'none';
      if (this.fallback) this.fallback.style.display = '';
      if (this.container) this.container.classList.remove('has-custom');
    }
  }

  /** 初始化：加载已有图标 + 绑定 onerror/onload */
  init() {
    this._ensureDom();
    if (!this.img) return;

    const self = this;
    const stored = self.getIcon();
    const src = stored || self._defaultSrc || '';

    self.img.onerror = function () {
      self.img.style.display = 'none';
      if (self.fallback) self.fallback.style.display = '';
      if (self.container) self.container.classList.remove('has-custom');
    };

    self.img.onload = function () {
      if (self.fallback) self.fallback.style.display = 'none';
      if (self.container) self.container.classList.add('has-custom');
    };

    if (src) {
      self.img.src = src;
    } else {
      self.img.style.display = 'none';
      if (self.fallback) self.fallback.style.display = '';
    }
  }

  /** [REVIEW] 创建文件上传处理器 */
  createUploadHandler() {
    const self = this;
    return function (file) {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        self.setIcon(e.target.result);
      };
      reader.readAsDataURL(file);
    };
  }

  /** 触发事件通知 */
  _emitEvent(dataUrl) {
    if (!this._eventName) return;
    // [REVIEW] 使用全局 EventBus（需确保已加载）
    if (typeof EventBus !== 'undefined' && EventBus.emit) {
      EventBus.emit(this._eventName, { dataUrl: dataUrl });
    }
  }
}
