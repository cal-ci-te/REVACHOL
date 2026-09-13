// ！首屏视频背景
// 全屏视频背景随滚动位置淡入淡出，背景色作为视频未加载时的后备；视频格式优先 WebM（体积更小），其次 MP4。

import { Utils } from '../utils.js';

export const HeroBackground = {
  bgElement: null,
  videoElement: null,
  heroSection: null,
  isVisible: true,
  maxOpacity: 1,
  _throttledUpdate: null,

  // 初始化并绑定滚动监听
  init() {
    this.bgElement = document.getElementById('fullscreenBg');
    this.videoElement = document.getElementById('heroVideo');
    this.heroSection = document.querySelector('.hero-section');

    if (!this.bgElement || !this.heroSection) {
      console.warn('[HeroBackground] 缺少必要元素，初始化中止');
      return;
    }
    console.log('[HeroBackground] 初始化成功');

    this.loadConfig();

    this.bgElement.style.opacity = this.maxOpacity;

    // 16ms 节流：对齐 60fps 刷新间隔，滚动时不产生多余重排
    this._throttledUpdate = this._throttle(this.updateOpacity.bind(this), 16);
    window.addEventListener('scroll', this._throttledUpdate);
    window.addEventListener('resize', this._throttledUpdate);

    // 延迟 50ms 兜底：等布局稳定后重算一次，避免首屏拿到未定型的矩形
    setTimeout(() => this.updateOpacity(), 50);

    document.addEventListener('visibilitychange', this._handleVisibilityChange.bind(this));
  },

  // 载入最大透明度
  loadConfig() {
    const saved = Utils.storage.get('video_max_opacity');
    if (saved !== null && typeof saved === 'number') {
      // 钳制到 0–1：存储值可能被手工改坏，直接用于 opacity 会导致背景消失
      this.maxOpacity = Math.max(0, Math.min(1, saved));
    } else {
      this.maxOpacity = 1;
    }
    console.log('[HeroBackground] 加载最大透明度配置:', this.maxOpacity);
  },

  // 保存最大透明度
  saveConfig() {
    Utils.storage.set('video_max_opacity', this.maxOpacity);
  },

  // 设置最大透明度
  setMaxOpacity(value) {
    this.maxOpacity = Math.max(0, Math.min(1, value));
    this.saveConfig();
    if (this.bgElement) {
      this.bgElement.style.opacity = this.maxOpacity;
    }
    this.updateOpacity();
    console.log('[HeroBackground] 最大透明度已设置为:', this.maxOpacity);
  },

  // 按滚动位置计算透明度
  updateOpacity() {
    if (!this.heroSection || !this.bgElement) return;
    const rect = this.heroSection.getBoundingClientRect();
    const windowHeight = window.innerHeight;

    const visibleHeight = Math.max(0, Math.min(rect.bottom, windowHeight) - Math.max(rect.top, 0));
    const totalHeight = rect.height;
    let visibleRatio = totalHeight > 0 ? visibleHeight / totalHeight : 0;
    visibleRatio = Math.max(0, Math.min(1, visibleRatio));

    let opacity;
    // 0.99 而非 1：亚像素舍入使首屏可见比例常略小于 1，阈值留出余量避免首屏就变暗
    if (visibleRatio >= 0.99) {
      opacity = this.maxOpacity;
    } else {
      // 滚离首屏时按可见比例线性衰减到 0
      opacity = visibleRatio * this.maxOpacity;
    }
    this.bgElement.style.opacity = opacity;

    // 完全滚出视口即暂停视频，省电并避免后台解码
    if (visibleRatio === 0 && this.isVisible) {
      this.isVisible = false;
      if (this.videoElement && !this.videoElement.paused) {
        this.videoElement.pause();
      }
    } else if (visibleRatio > 0 && !this.isVisible) {
      this.isVisible = true;
      if (this.videoElement && this.videoElement.paused) {
        this.videoElement.play().catch(() => {});
      }
    }
  },

  // 标签页切换时暂停/恢复
  // 后台标签页定时器被节流，继续播放只会消耗资源，故用 visibilitychange 显式控制
  _handleVisibilityChange() {
    if (document.hidden) {
      if (this.videoElement && !this.videoElement.paused) {
        this.videoElement.pause();
      }
    } else {
      if (this.isVisible && this.videoElement && this.videoElement.paused) {
        this.videoElement.play().catch(() => {});
      }
    }
  },

  // 节流包装
  _throttle(fn, delay) {
    let lastCall = 0;
    return function (...args) {
      const now = Date.now();
      if (now - lastCall >= delay) {
        lastCall = now;
        fn.apply(this, args);
      }
    };
  },
};
