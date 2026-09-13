// ！背景与纹理
// 管理页面背景（纯色 / 渐变）与自定义贴图纹理，并把配置持久化到 localStorage。
// 与主题模式互斥：_themeActive 为 true 时所有设置入口直接拒绝，背景交由 CSS 主题变量控制。

import { CONFIG } from '../config.js';
import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

export const Texture = {
  // bgColor 默认值对应 var(--color-bg-primary)；运行时用 hex，CSS 侧走变量
  bgColor: '#1a1612',

  // 渐变配置用 hex 而非变量：色卡由 <input type="color"> 读写，只接受 hex
  bgMode: 'solid',
  gradientColors: ['#1a1612', '#2a231c'],
  gradientDirection: 'to bottom',
  gradientFeather: 50,

  textureConfig: { dataUrl: null, opacity: 0.12 },

  palettes: [],

  _themeActive: false,

  // 载入背景配置
  loadConfig() {
    const savedBg = Utils.storage.get('bg_color');
    if (savedBg) this.bgColor = savedBg;

    const grad = Utils.storage.get('gradient_config');
    if (grad) {
      this.bgMode = grad.mode || 'solid';
      this.gradientColors = grad.colors || ['#1a1612', '#2a231c'];
      this.gradientDirection = grad.direction || 'to bottom';
      this.gradientFeather = grad.feather !== undefined ? grad.feather : 50;
    }

    const pal = Utils.storage.get('palettes');
    if (pal && Array.isArray(pal)) {
      this.palettes = pal;
    } else {
      // 首次运行植入默认色卡：色卡库为空会导致管理面板无任何可应用项
      this.palettes = [
        {
          id: 'default',
          name: '默认暗色',
          mode: 'solid',
          colors: ['#1a1612'],
          direction: 'to bottom',
          feather: 50,
        },
      ];
      this.savePalettes();
    }

    if (!this._themeActive) {
      this.applyBackground();
    } else {
      console.log('[Texture] 主题模式已激活，跳过背景应用');
    }

    const tex = Utils.storage.get('texture_config');
    if (tex) {
      this.textureConfig = tex;
      this.applyTexture();
    }
  },

  // 切换主题模式
  setThemeMode(active) {
    this._themeActive = active;
    if (active) {
      // 清空内联背景样式：保留任何一项都会覆盖主题 CSS 的背景声明
      document.body.style.background = '';
      document.body.style.backgroundColor = '';
      document.body.style.backgroundImage = '';
      document.body.style.backgroundBlendMode = '';
      console.log('[Texture] 主题模式已启用，背景由 CSS 控制');
    } else {
      this.applyBackground();
      console.log('[Texture] 主题模式已禁用，恢复 Texture 背景控制');
    }
  },

  // 应用背景
  applyBackground() {
    if (this._themeActive) {
      console.log('[Texture] 主题模式已激活，跳过背景应用');
      return;
    }
    if (this.bgMode === 'solid') {
      document.body.style.background = this.bgColor;
    } else {
      const gradientCSS = this.buildGradientCSS();
      document.body.style.background = gradientCSS;
    }
    this.saveBgConfig();
  },

  // 拼装渐变 CSS
  // 用双色停靠点制造柔和过渡：feather=0 时两停靠点重合即硬边渐变
  buildGradientCSS() {
    const colors = this.gradientColors;
    if (colors.length < 2) {
      return colors[0] || '#1a1612';
    }

    const dir = this.gradientDirection;
    const feather = this.gradientFeather / 100;
    let stops = [];
    const count = colors.length;

    if (count === 2) {
      const mid = 0.5;
      const offset = feather * 0.4;
      const p1 = Math.max(0, mid - offset);
      const p2 = Math.min(1, mid + offset);
      stops = [
        `${colors[0]} 0%`,
        `${colors[0]} ${p1 * 100}%`,
        `${colors[1]} ${p2 * 100}%`,
        `${colors[1]} 100%`,
      ];
    } else if (count === 3) {
      // 三色时把中点固定在 1/3 与 2/3：等距分段最接近视觉均匀
      const mid1 = 1 / 3;
      const mid2 = 2 / 3;
      const offset = feather * 0.3;
      const p1 = Math.max(0, mid1 - offset);
      const p2 = Math.min(1, mid1 + offset);
      const p3 = Math.max(0, mid2 - offset);
      const p4 = Math.min(1, mid2 + offset);
      stops = [
        `${colors[0]} 0%`,
        `${colors[0]} ${p1 * 100}%`,
        `${colors[1]} ${p2 * 100}%`,
        `${colors[1]} ${p3 * 100}%`,
        `${colors[2]} ${p4 * 100}%`,
        `${colors[2]} 100%`,
      ];
    } else {
      stops = colors.map((c, i) => `${c} ${(i / (colors.length - 1)) * 100}%`);
    }

    return `linear-gradient(${dir}, ${stops.join(', ')})`;
  },

  // 保存背景配置
  saveBgConfig() {
    Utils.storage.set('bg_color', this.bgColor);
    Utils.storage.set('gradient_config', {
      mode: this.bgMode,
      colors: this.gradientColors,
      direction: this.gradientDirection,
      feather: this.gradientFeather,
    });
  },

  // 设置纯色背景
  setBgColor(color) {
    if (this._themeActive) {
      console.log('[Texture] 主题模式已激活，请先退出主题模式再设置背景');
      return;
    }
    this.bgColor = color;
    this.bgMode = 'solid';
    this.applyBackground();
    Utils.showToast(UI.toast.textureSolidColorApplied, false);
  },

  // 重置为默认背景色
  resetBgColor() {
    if (this._themeActive) {
      console.log('[Texture] 主题模式已激活，请先退出主题模式再重置背景');
      return;
    }
    this.bgColor = CONFIG.bgColorDefault || '#1a1612';
    this.bgMode = 'solid';
    this.applyBackground();
    Utils.showToast(UI.toast.textureBgReset, false);
  },

  // 设置渐变背景
  setGradient(colors, direction, feather) {
    if (this._themeActive) {
      console.log('[Texture] 主题模式已激活，请先退出主题模式再设置渐变');
      return;
    }
    if (!colors || colors.length < 2) {
      Utils.showToast(UI.toast.textureNeedAtLeastTwoColors, true);
      return;
    }
    this.bgMode = 'gradient';
    // 最多三个色标：四色以上在窄屏上难以分辨，且 UI 色板只提供三槽
    this.gradientColors = colors.slice(0, 3);
    if (direction) this.gradientDirection = direction;
    if (feather !== undefined) this.gradientFeather = Math.max(0, Math.min(100, feather));
    this.applyBackground();
    Utils.showToast(UI.toast.textureGradientApplied, false);
  },

  // 设置羽化程度
  setFeather(value) {
    this.gradientFeather = Math.max(0, Math.min(100, value));
    // 仅渐变模式需重绘：纯色模式改羽化值无视觉影响，避免多余的样式写入
    if (this.bgMode === 'gradient' && !this._themeActive) {
      this.applyBackground();
    }
    this.saveBgConfig();
  },

  // 设置渐变方向
  setDirection(direction) {
    this.gradientDirection = direction;
    if (this.bgMode === 'gradient' && !this._themeActive) {
      this.applyBackground();
    }
    this.saveBgConfig();
  },

  // 保存色卡库
  savePalettes() {
    Utils.storage.set('palettes', this.palettes);
  },

  // 新增色卡
  addPalette(name, mode, colors, direction, feather) {
    // 用时间戳生成 id：色卡仅本地使用，无需全局唯一性
    const id = 'palette_' + Date.now();
    const entry = {
      id,
      name: name || '未命名色卡',
      mode: mode || 'solid',
      colors: colors || ['#1a1612'],
      direction: direction || 'to bottom',
      feather: feather !== undefined ? feather : 50,
    };
    this.palettes.push(entry);
    this.savePalettes();
    Utils.showToast(UI.toast.texturePaletteSaved, false);
    return entry;
  },

  // 删除色卡
  deletePalette(id) {
    const idx = this.palettes.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    this.palettes.splice(idx, 1);
    this.savePalettes();
    Utils.showToast(UI.toast.texturePaletteDeleted, false);
    return true;
  },

  // 应用色卡
  applyPalette(id) {
    if (this._themeActive) {
      console.log('[Texture] 主题模式已激活，请先退出主题模式再应用色卡');
      return;
    }
    const palette = this.palettes.find((p) => p.id === id);
    if (!palette) {
      Utils.showToast(UI.toast.texturePaletteNotFound, true);
      return;
    }
    if (palette.mode === 'solid') {
      this.setBgColor(palette.colors[0] || '#1a1612');
    } else {
      this.setGradient(palette.colors, palette.direction, palette.feather);
    }
    Utils.showToast(`已应用色卡：${palette.name}`, false);
  },

  // 应用纹理
  applyTexture() {
    const textureDiv = document.getElementById('customTexture');
    if (!textureDiv) return;
    if (this.textureConfig.dataUrl) {
      textureDiv.style.backgroundImage = `url(${this.textureConfig.dataUrl})`;
      textureDiv.style.backgroundSize = 'cover';
      textureDiv.style.backgroundPosition = 'center';
      textureDiv.style.backgroundRepeat = 'no-repeat';
      textureDiv.style.opacity = this.textureConfig.opacity;
    } else {
      textureDiv.style.backgroundImage = 'none';
    }
  },

  // 上传纹理
  async uploadTexture(file) {
    try {
      Utils.showToast(UI.toast.textureCompressingImage, false);
      const result = await this.compressAndConvertToWebP(file, 0.85);
      this.textureConfig.dataUrl = result.dataUrl;
      this.applyTexture();
      this.saveConfig();
      Utils.showToast(`纹理已应用（WebP格式，${(result.size / 1024).toFixed(1)}KB）`, false);
    } catch (err) {
      Utils.showToast(UI.toast.textureImageProcessingFailed(err.message), true);
    }
  },

  // 移除纹理
  removeTexture() {
    this.textureConfig.dataUrl = null;
    this.applyTexture();
    this.saveConfig();
    Utils.showToast(UI.toast.textureTextureRemoved, false);
  },

  // 设置纹理透明度
  setOpacity(opacity) {
    this.textureConfig.opacity = opacity;
    this.applyTexture();
    this.saveConfig();
  },

  // 保存纹理配置
  saveConfig() {
    Utils.storage.set('texture_config', this.textureConfig);
  },

  // 压缩并转为 WebP
  // 选 WebP+0.85 质量：纹理为大面积平铺图案，该组合在肉眼难辨的前提下省下约一半体积
  // 最大边长限制 1200px：纹理以 background-size:cover 铺满，超过 2K 屏的额外像素无收益
  compressAndConvertToWebP(file, quality) {
    return new Promise((resolve, reject) => {
      if (!file.type.match(/image\/(png|jpeg|jpg|webp)/)) {
        reject(new Error('只支持 PNG、JPG、WebP 格式'));
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          const maxWidth = 1200;
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob(
            (blob) => {
              resolve({
                blob: blob,
                dataUrl: URL.createObjectURL(blob),
                width: width,
                height: height,
                size: blob.size,
              });
            },
            'image/webp',
            quality
          );
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },
};

// 模块加载即载入配置：此时 _themeActive 尚为 false，背景会先应用一次；
// ThemeService.init() 随后调用 setThemeMode(true) 清除内联背景，属预期的一次性覆盖
Texture.loadConfig();
