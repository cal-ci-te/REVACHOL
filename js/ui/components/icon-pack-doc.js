// 工具栏「图标键名参考」文档：三个主题 tab 可切换，灰/绿显示自定义状态。
import { IconPackService } from '../../services/icon-pack-service.js';
import { ICON_PACK_KEYS, ICON_PACK_THEME_IDS } from '../../services/icon-pack-keys.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { ThemeService } from '../../services/theme-service.js';
import { UI } from '../../utils/ui-strings.js';

export const IconPackDoc = {
  _container: null,
  _currentTheme: 'dark',
  _onChanged: null,

  async render(container) {
    this.destroy();
    if (!container) return;
    this._container = container;
    this._currentTheme = ThemeService.getCurrentTheme();

    container.innerHTML = `
      <div class="icon-pack-doc">
        <h3>${UI.iconPack.docTitle}</h3>
        <div class="icon-pack-doc-tabs">
          ${ICON_PACK_THEME_IDS.map((themeId) => `
            <button class="icon-pack-doc-tab ${themeId === this._currentTheme ? 'active' : ''}" data-doc-theme="${themeId}">
              ${themeId === 'dark' ? UI.iconPack.docTabDark : themeId === 'light' ? UI.iconPack.docTabLight : UI.iconPack.docTabLofi}
            </button>
          `).join('')}
        </div>
        <div class="icon-pack-doc-legend">
          <span class="dot default"></span> ${UI.iconPack.docLegendDefault}
          <span class="dot custom"></span> ${UI.iconPack.docLegendCustom}
        </div>
        <div class="icon-pack-doc-keys"></div>
      </div>
    `;

    this._bindTabs();
    this._onChanged = () => {
      // 标签页被关闭后容器脱离文档，自动清理订阅
      if (this._container && !document.contains(this._container)) {
        this.destroy();
        return;
      }
      this._renderKeyList();
    };
    EventBus.on(EVENTS.ICON_PACKS_CHANGED, this._onChanged);
    await this._renderKeyList();
  },

  _bindTabs() {
    if (!this._container) return;
    this._container.querySelectorAll('.icon-pack-doc-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this._currentTheme = tab.dataset.docTheme;
        this._container.querySelectorAll('.icon-pack-doc-tab').forEach((t) => t.classList.toggle('active', t === tab));
        this._renderKeyList();
      });
    });
  },

  async _renderKeyList() {
    if (!this._container) return;
    const listEl = this._container.querySelector('.icon-pack-doc-keys');
    if (!listEl) return;

    let status;
    try { status = await IconPackService.loadStatus(); } catch { status = null; }
    const active = status && status.themes ? status.themes[this._currentTheme] : null;

    const baseKeys = ICON_PACK_KEYS.filter((k) => !k.key.startsWith('box-'));
    const boxKeys = ICON_PACK_KEYS.filter((k) => k.key.startsWith('box-'));
    listEl.innerHTML = this._renderGroup(UI.iconPack.docGroupBase, baseKeys, active) +
      this._renderGroup(UI.iconPack.docGroupBox, boxKeys, active);
  },

  _renderGroup(title, keys, active) {
    if (!keys.length) return '';
    return `
      <div class="icon-pack-doc-group">
        <div class="icon-pack-doc-group-title">${title}</div>
        ${keys.map((k) => {
          const icon = active && active.icons ? active.icons[k.key] : null;
          const custom = !!(icon && icon.custom);
          return `
            <div class="icon-pack-key">
              <span class="dot ${custom ? 'custom' : 'default'}"></span>
              <code>${k.key}.png/.svg</code>
              <span class="icon-pack-key-label">${k.label}</span>
            </div>
          `;
        }).join('')}
      </div>
    `;
  },

  destroy() {
    if (this._onChanged) {
      EventBus.off(EVENTS.ICON_PACKS_CHANGED, this._onChanged);
      this._onChanged = null;
    }
    this._container = null;
  },
};
