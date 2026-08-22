// 图标包服务：API 状态、上传/删除/改主题、应用到全站图标槽位。
// 优先级：主题包图标（当前主题的生效包） > 旧版单槽位 localStorage 图标 > 默认 emoji/CSS 默认。
import { ApiClient } from './api-client.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { ThemeService } from './theme-service.js';
import { ICON_PACK_KEYS } from './icon-pack-keys.js';
import { inspectZipFile, buildNormalizedZip } from './icon-pack-processor.js';
import { SiteIcon } from './site-icon.js';
import { DirectoryIcon } from './directory-icon.js';
import { UIIcon, UI_ICON_SLOTS } from './ui-icon.js';
import { getMagicBox } from '../ui/components/magic-box/index.js';
import { debounce } from '../utils/function.js';
import { UI } from '../utils/ui-strings.js';

// 统一箭头：旋转类 → 默认 emoji（用于无包时还原）
const ARROW_DEFAULT_EMOJI = {
  'arrow-r0': '▶',
  'arrow-r90': '▼',
  'arrow-r180': '◀',
  'arrow-r270': '▲',
};

// 贴纸库六个功能键 → 按钮选择器 / 右键菜单 data-action / 默认 emoji
const DECO_ACTION_CONFIG = {
  style:     { selector: '.asset-style-btn .asset-btn-emoji',     ctxAction: 'toggle-style', emoji: '🔄' },
  duplicate: { selector: '.asset-duplicate-btn .asset-btn-emoji', ctxAction: 'duplicate',    emoji: '📋' },
  rename:    { selector: '.asset-rename-btn .asset-btn-emoji',    ctxAction: 'rename',       emoji: '✏️' },
  editPos:   { selector: '.asset-deco-edit-btn .asset-btn-emoji', ctxAction: 'deco-edit',    emoji: '📐' },
  download:  { selector: '.asset-download-btn .asset-btn-emoji',  ctxAction: null,           emoji: '⬇️' },
  delete:    { selector: '.asset-delete-btn .asset-btn-emoji',    ctxAction: 'delete-lib',   emoji: '🗑️' },
};

/** 取元素上的旋转类（arrow-rX），无则返回 arrow-r0 */
function getArrowClass(el) {
  if (!el) return 'arrow-r0';
  const cls = Array.from(el.classList).find((c) => /^arrow-r(0|90|180|270)$/.test(c));
  return cls || 'arrow-r0';
}

/** 获取默认 emoji 标签的前置 emoji（"🌙 暗色" → "🌙"） */
function emojiOf(label) {
  const s = String(label || '');
  return s.indexOf(' ') === -1 ? s : s.slice(0, s.indexOf(' '));
}

export const IconPackService = {
  _statusCache: null,
  _initialized: false,
  _pendingMagicBox: false,
  _visibilityUrls: { visible: null, hidden: null },

  async loadStatus(force = false) {
    if (!force && this._statusCache) return this._statusCache;
    const status = await ApiClient.get('/api/icon-packs/status');
    this._statusCache = status;
    return status;
  },

  async loadPacks() {
    return ApiClient.get('/api/icon-packs');
  },

  async uploadPack(file, name, themeIds) {
    if (!name || !name.trim()) throw new Error(UI.iconPack.nameRequired);
    if (!themeIds || themeIds.length === 0) throw new Error(UI.iconPack.themeRequired);

    const report = await inspectZipFile(file);
    this.lastInspectReport = report;
    if (report.errors.length > 0) {
      const err = new Error(report.errors.join('\n'));
      err.code = 'VALIDATION_ERRORS';
      err.report = report;
      throw err;
    }

    const normalizedZip = await buildNormalizedZip(file);
    const zipBase64 = await normalizedZip.generateAsync({ type: 'base64' });

    const result = await ApiClient.post('/api/icon-packs', {
      name: name.trim(),
      themeIds,
      zipBase64,
    }, { timeout: 60000 });

    this._statusCache = null;
    EventBus.emit(EVENTS.ICON_PACKS_CHANGED);
    return result;
  },

  async updatePackThemes(id, themeIds) {
    if (!themeIds || themeIds.length === 0) throw new Error(UI.iconPack.themeRequired);
    const result = await ApiClient.put(`/api/icon-packs/${id}/themes`, { themeIds });
    this._statusCache = null;
    EventBus.emit(EVENTS.ICON_PACKS_CHANGED);
    return result;
  },

  async deletePack(id) {
    const result = await ApiClient.delete(`/api/icon-packs/${id}`);
    this._statusCache = null;
    EventBus.emit(EVENTS.ICON_PACKS_CHANGED);
    return result;
  },

  /** 应用当前主题的生效包（全量覆盖） */
  async applyActivePack(themeId) {
    try {
      const status = await this.loadStatus(true);
      const active = status.themes && status.themes[themeId];
      this._visibilityUrls = { visible: null, hidden: null };

      ICON_PACK_KEYS.forEach((def) => {
        const packIcon = active && active.icons ? active.icons[def.key] : null;
        const url = packIcon && packIcon.custom ? packIcon.url : null;
        this._applyKey(def, url);
      });

      this._applyDirectoryVisibility(this._visibilityUrls.visible, this._visibilityUrls.hidden);
    } catch (e) {
      console.warn('[IconPackService] 应用图标包失败:', e);
    }
  },

  _applyKey(def, url) {
    const slot = def.slot;

    if (slot === 'site') {
      // 有包用包 URL；无包清除 external 后回退旧单槽位 localStorage / 默认图片
      SiteIcon.setExternalIcon(url || null);
      return;
    }

    if (slot === 'directory:visibilityVisible' || slot === 'directory:visibilityHidden') {
      if (slot === 'directory:visibilityVisible') this._visibilityUrls.visible = url;
      else this._visibilityUrls.hidden = url;
      return;
    }

    if (slot === 'directory:article') {
      this._applyDirectoryArticleIcon(url);
      return;
    }

    if (slot.startsWith('directory:')) {
      const suffix = slot.slice('directory:'.length);
      DirectoryIcon.setExternalIcon(suffix, url);
      return;
    }

    if (slot.startsWith('ui:')) {
      const suffix = slot.slice('ui:'.length);
      UIIcon.setExternalIcon(suffix, url);
      return;
    }

    if (slot === 'arrow') {
      this._applyArrow(url);
      return;
    }

    if (slot === 'admin-label:avatarUpload') {
      this._applyLabelIcon('#uploadAvatarBtn', url, '📷 上传头像');
      return;
    }

    if (slot === 'admin-label:customTexture') {
      this._applyLabelIcon('.admin-icon-section-header > span', url, '🎨 自定义贴图');
      return;
    }

    if (slot.startsWith('theme:')) {
      const themeId = slot.slice('theme:'.length);
      this._applyThemeIcon(themeId, url);
      return;
    }

    if (slot === 'search') {
      this._applyLabelIcon('.sidebar-search .search-icon', url, '🔍');
      return;
    }

    if (slot === 'position-mode') {
      this._applyLabelIcon('#enterPositionModeBtn', url, '📌 进入位置管理');
      return;
    }

    if (slot.startsWith('deco:')) {
      const action = slot.slice('deco:'.length);
      this._applyDecoActionIcon(action, url);
      return;
    }

    if (slot.startsWith('magicbox:')) {
      this._applyMagicBox(def.key, url);
      return;
    }
  },

  /** 统一箭头：面板箭头走 UIIcon 通道；其余 .icon-pack-arrow 遍历注入/清除 img */
  _applyArrow(url) {
    UIIcon.setExternalIcon(UI_ICON_SLOTS.adminPanel, url || null);

    document.querySelectorAll('.icon-pack-arrow').forEach((el) => {
      if (url) {
        if (el.tagName === 'IMG' && el.src === url) return;
        const img = document.createElement('img');
        img.className = `icon-pack-arrow ${getArrowClass(el)}`;
        img.src = url;
        img.alt = '';
        img.dataset.fallback = el.dataset.fallback || el.textContent || '';
        el.replaceWith(img);
      } else if (el.tagName === 'IMG') {
        const span = document.createElement('span');
        span.className = `icon-pack-arrow ${getArrowClass(el)}`;
        span.textContent = el.dataset.fallback || ARROW_DEFAULT_EMOJI[getArrowClass(el)] || '▶';
        el.replaceWith(span);
      }
      // span 且无 url：已是默认 emoji，无需处理
    });
  },

  /** 替换按钮/标题前置 emoji 为包图标（或还原） */
  _applyLabelIcon(selector, url, defaultLabel) {
    const defaultEmoji = emojiOf(defaultLabel);
    document.querySelectorAll(selector).forEach((el) => {
      const emojiEl = el.matches('.admin-label-emoji, .search-icon')
        ? el
        : el.querySelector('.admin-label-emoji, .search-icon');
      if (!emojiEl) return;
      this._replaceEmojiElement(emojiEl, url, defaultEmoji);
    });
  },

  _replaceEmojiElement(emojiEl, url, defaultEmoji) {
    if (!emojiEl) return;
    const cls = emojiEl.className || '';
    if (url) {
      if (emojiEl.tagName === 'IMG' && emojiEl.src === url) return;
      const img = document.createElement('img');
      img.className = cls;
      img.src = url;
      img.alt = '';
      emojiEl.replaceWith(img);
    } else if (emojiEl.tagName === 'IMG') {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = defaultEmoji;
      emojiEl.replaceWith(span);
    }
    // span 且无 url：保留现有默认 emoji
  },

  /** 主题按钮图标：替换 .theme-btn-emoji 为 <img class="theme-btn-icon"> */
  _applyThemeIcon(themeId, url) {
    document.querySelectorAll(`.theme-btn[data-theme="${themeId}"]`).forEach((btn) => {
      const emojiEl = btn.querySelector('.theme-btn-emoji');
      const defaultEmoji = emojiOf(UI.theme[themeId]);
      if (url) {
        if (emojiEl) {
          const img = document.createElement('img');
          img.className = 'theme-btn-icon';
          img.src = url;
          img.alt = '';
          emojiEl.replaceWith(img);
        } else {
          const img = btn.querySelector('.theme-btn-icon');
          if (img) img.src = url;
        }
      } else {
        const img = btn.querySelector('.theme-btn-icon');
        if (img) {
          const span = document.createElement('span');
          span.className = 'theme-btn-emoji';
          span.textContent = defaultEmoji;
          img.replaceWith(span);
        }
      }
    });
  },

  /** 目录树可见性图标（按 data-visible 分别显示可见/不可见包图标） */
  _applyDirectoryVisibility(visibleUrl, hiddenUrl) {
    document.querySelectorAll('.visibility-toggle').forEach((btn) => {
      const isVisible = btn.dataset.visible === 'true';
      const url = isVisible ? visibleUrl : hiddenUrl;
      const container = btn.querySelector('.icon-pack-visibility');
      if (!container) return;
      if (url) {
        const img = document.createElement('img');
        img.className = 'icon-pack-visibility';
        img.src = url;
        img.alt = '';
        container.replaceChildren(img);
      } else {
        container.textContent = isVisible ? '👁️' : '🚫';
      }
    });
  },

  /** 目录树文章节点图标 */
  _applyDirectoryArticleIcon(url) {
    document.querySelectorAll('.tree-node.article .node-icon').forEach((el) => {
      if (url) {
        if (el.tagName === 'IMG' && el.src === url) return;
        const img = document.createElement('img');
        img.className = 'node-icon node-icon-img';
        img.src = url;
        img.alt = '';
        el.replaceWith(img);
      } else if (el.tagName === 'IMG') {
        const span = document.createElement('span');
        span.className = 'node-icon';
        span.textContent = UI.directory.articleIcon;
        el.replaceWith(span);
      }
    });
  },

  /** 贴纸库六个功能图标：同时刷新管理列表按钮与右键菜单 */
  _applyDecoActionIcon(action, url) {
    const cfg = DECO_ACTION_CONFIG[action];
    if (!cfg) return;

    document.querySelectorAll(cfg.selector).forEach((emojiEl) => {
      this._replaceEmojiElement(emojiEl, url, cfg.emoji);
    });

    if (cfg.ctxAction) {
      document.querySelectorAll(`#deco-context-menu [data-action="${cfg.ctxAction}"] .ctx-item-emoji`).forEach((emojiEl) => {
        this._replaceEmojiElement(emojiEl, url, cfg.emoji);
      });
    }
  },

  /** 超现实箱子：外部覆盖（不写 localStorage）；组件未挂载时标记待补应用 */
  _applyMagicBox(key, url) {
    const mb = getMagicBox();
    if (!mb) {
      if (url) this._pendingMagicBox = true;
      return;
    }
    if (key === 'box-lid') {
      mb.setExternalLidImage(url);
    } else if (key === 'box-body') {
      mb.setExternalBodyImage(url);
    } else if (key.startsWith('box-item-')) {
      const itemId = key.slice('box-item-'.length);
      mb.setExternalItemImage(itemId, url);
    }
  },

  /** 防抖刷新：主题/图标包变更可能短时间内连续触发 */
  refreshCurrent: debounce(async function () {
    const theme = ThemeService.getCurrentTheme();
    await this.applyActivePack(theme);
  }, 300),

  /** 初始化：订阅事件并应用当前主题 */
  init() {
    if (this._initialized) return;
    this._initialized = true;

    EventBus.on(EVENTS.THEME_CHANGED, ({ themeId }) => {
      this.applyActivePack(themeId);
    });
    EventBus.on(EVENTS.ICON_PACKS_CHANGED, () => {
      this.refreshCurrent();
    });
    EventBus.on(EVENTS.COMPONENT_MOUNTED, (payload) => {
      if (payload && payload.name === 'magic-box' && this._pendingMagicBox) {
        this._pendingMagicBox = false;
        this.refreshCurrent();
      }
    });

    this.applyActivePack(ThemeService.getCurrentTheme());
  },
};
