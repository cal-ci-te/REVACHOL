// ！水印服务
// 生成平铺可见水印与零宽字符隐形水印（含访客指纹与文章 ID），用于内容溯源。

import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';

export const Watermark = {
  config: {
    text: CONFIG.watermarkDefaults.text,
    opacity: CONFIG.watermarkDefaults.opacity,
  },

  // 获取访客标识
  // 首次生成的指纹写入本地存储后长期复用，保证同一浏览器水印可关联
  getVisitorId() {
    let visitorId = Utils.storage.get('visitor_id');
    if (!visitorId) {
      const date = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
      const random = Math.random().toString(36).substring(2, 10);
      let screenInfo = 'unknown';
      try {
        if (typeof screen !== 'undefined' && screen.width) {
          screenInfo = `${screen.width}x${screen.height}`;
        }
      } catch (e) {
        // 忽略：部分环境无 screen 对象，缺失时指纹退化为 unknown
        screenInfo = 'unknown';
      }
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      visitorId = `${date}_${random}_${screenInfo}_${timezone}`;
      Utils.storage.set('visitor_id', visitorId);
    }
    return visitorId;
  },

  // 生成平铺水印
  // 绘制到 canvas 后作为背景图铺满容器，比重复 DOM 文本更省节点
  generateTiledWatermark(text, opacity) {
    if (!text || text.trim() === '') text = 'REVACHOL';
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 200;
    canvas.height = 150;
    ctx.font = 'bold 20px "Special Elite", "Courier New", monospace';
    ctx.fillStyle = `rgba(196, 122, 68, ${opacity})`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    // 倾斜 -25°：与页面整体视觉风格一致，且比水平排布更难被截图工具自动识别
    ctx.rotate((-25 * Math.PI) / 180);
    ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.font = 'bold 16px "Special Elite", "Courier New", monospace';
    ctx.fillStyle = `rgba(196, 122, 68, ${opacity * 0.7})`;
    ctx.fillText('©', canvas.width - 30, canvas.height - 20);
    const dataUrl = canvas.toDataURL();
    const watermarkDiv = document.getElementById('tiledWatermark');
    if (watermarkDiv) {
      watermarkDiv.style.backgroundImage = `url(${dataUrl})`;
      watermarkDiv.style.opacity = '1';
    }
  },

  // 追加零宽水印
  // 用 \u200B/\u200C 表示二进制位、\u200D 分隔字符，复制文本时隐形携带
  addZeroWidthWatermark(text, articleId) {
    if (!CONFIG.protection.enableWatermark || !text) return text;
    const visitorId = this.getVisitorId();
    const fullWatermark = `${visitorId}|article:${articleId}|${new Date().toISOString()}`;
    let watermark = '';
    for (let i = 0; i < fullWatermark.length; i++) {
      const code = fullWatermark.charCodeAt(i);
      // 每字符展开 16 位：低 16 位足够覆盖常用字符且长度可控
      for (let bit = 0; bit < 16; bit++) {
        if (code & (1 << bit)) {
          watermark += '\u200B';
        } else {
          watermark += '\u200C';
        }
      }
      watermark += '\u200D';
    }
    return text + watermark;
  },

  // 更新可见水印文案
  updateVisibleWatermark() {
    const watermarkEl = document.getElementById('visibleWatermark');
    if (watermarkEl && CONFIG.protection.enableWatermark) {
      const shortId = this.getVisitorId().substring(0, 12);
      watermarkEl.innerHTML = `© ${this.config.text} · ${shortId} · 内容受保护`;
    }
  },

  // 应用当前水印配置
  updateWatermark() {
    this.generateTiledWatermark(this.config.text, this.config.opacity);
    Utils.storage.set('watermark_config', this.config);
  },

  // 载入已保存配置
  loadConfig() {
    const saved = Utils.storage.get('watermark_config');
    if (saved) {
      this.config = { ...this.config, ...saved };
    }
    this.updateWatermark();
    this.updateVisibleWatermark();
  },

  // 设置文案与透明度
  apply(text, opacity) {
    if (text !== undefined) this.config.text = text;
    if (opacity !== undefined) this.config.opacity = opacity;
    this.updateWatermark();
    this.updateVisibleWatermark();
  },
};

