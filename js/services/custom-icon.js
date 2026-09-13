// ！通用自定义图标管理器
// 为任意 UI 元素提供「自定义图标 + 回退」能力，复用站点图标的 CSS 模式：
// 容器 overflow:visible + img/回退元素切换 + .has-custom 控制显隐。
// 构造参数：storageKey（localStorage 键名）、containerSelector、imgSelector、fallbackSelector，
// 可选 eventName（更新事件名）、defaultSrc（默认图片路径）。

import { Utils } from '../utils.js';
import { EventBus } from '../core/event-bus.js';

export class CustomIconManager {
  constructor(config) {
    this._storageKey = config.storageKey;
    this._containerSelector = config.containerSelector;
    this._imgSelector = config.imgSelector;
    this._fallbackSelector = config.fallbackSelector;
    this._eventName = config.eventName || null;
    this._defaultSrc = config.defaultSrc || null;

    this.container = null;
    this.img = null;
    this.fallback = null;
    this._initialised = false;
    // 外部覆盖（图标包等临时 URL）：不写 localStorage，且优先于 localStorage
    this._external = null;
  }

  // 缓存 DOM 引用
  // 三元素齐备才置位 _initialised：中途半成品时下次调用仍会重新查询
  _ensureDom() {
    if (this._initialised) return;
    this.container = document.querySelector(this._containerSelector);
    this.img = document.querySelector(this._imgSelector);
    this.fallback = document.querySelector(this._fallbackSelector);
    if (this.container && this.img) {
      this._initialised = true;
    }
  }

  // 读取当前生效图标
  // 外部覆盖 > localStorage；均无时返回 null
  getIcon() {
    if (this._external) return this._external;
    return Utils.storage.get(this._storageKey);
  }

  // 设置外部覆盖
  // 外部覆盖不进 localStorage：图标包删除/切主题后可无损回退用户自传图标
  setExternalIcon(url) {
    this._external = url || null;
    this.applyIcon(this.getIcon() || this._defaultSrc || null);
  }

  // 保存图标并应用
  setIcon(dataUrl) {
    if (!dataUrl) { this.removeIcon(); return; }
    Utils.storage.set(this._storageKey, dataUrl);
    this.applyIcon(this.getIcon() || this._defaultSrc || null);
    this._emitEvent(dataUrl);
  }

  // 移除图标并恢复默认
  removeIcon() {
    Utils.storage.remove(this._storageKey);
    this.applyIcon(this.getIcon() || this._defaultSrc || null);
    this._emitEvent(null);
  }

  // 应用图标到 DOM
  // 自定义图标与回退元素互斥显示，避免两者同时出现
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

  // 初始化
  // 用 onload/onerror 兜底：图片 404 时回退到占位元素，避免空白
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

  // 生成文件上传处理器
  // 校验 MIME 前缀再读：非图片文件直接丢弃，避免 dataUrl 撑爆 localStorage
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

  // 触发更新事件
  _emitEvent(dataUrl) {
    if (!this._eventName) return;
    if (EventBus && typeof EventBus.emit === 'function') {
      EventBus.emit(this._eventName, { dataUrl: dataUrl });
    }
  }
}
