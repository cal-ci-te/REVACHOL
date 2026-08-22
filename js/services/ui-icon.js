// 顶部工具栏 / 管理员控制台折叠按钮的自定义图标单例
//
// 管理三个图标槽位：
//   - toolbarCollapsed  顶部工具栏收起状态（默认 ⚙）
//   - toolbarExpanded   顶部工具栏展开状态（默认 ◀）
//   - adminPanel        管理员控制台折叠箭头（默认 ▶/▼）
// 图标以 dataUrl 存入 localStorage，可随时上传/重置。
import { Utils } from '../utils.js';

export const UI_ICON_SLOTS = {
  toolbarCollapsed: 'toolbarCollapsed',
  toolbarExpanded: 'toolbarExpanded',
  adminPanel: 'adminPanel',
};

const STORAGE_KEYS = {
  [UI_ICON_SLOTS.toolbarCollapsed]: 'toolbar_icon_collapsed',
  [UI_ICON_SLOTS.toolbarExpanded]: 'toolbar_icon_expanded',
  [UI_ICON_SLOTS.adminPanel]: 'admin_panel_icon',
};

class UIIconManager {
  /** 读取指定槽位的图标 dataUrl */
  getIcon(slot) {
    return Utils.storage.get(STORAGE_KEYS[slot]);
  }

  /** 是否已设置自定义图标 */
  hasIcon(slot) {
    return !!this.getIcon(slot);
  }

  /** 保存并应用自定义图标 */
  setIcon(slot, dataUrl) {
    if (!dataUrl) {
      this.removeIcon(slot);
      return;
    }
    Utils.storage.set(STORAGE_KEYS[slot], dataUrl);
    this.applyAll();
  }

  /** 移除自定义图标，恢复默认 */
  removeIcon(slot) {
    Utils.storage.remove(STORAGE_KEYS[slot]);
    this.applyAll();
  }

  /** 生成文件上传处理器（FileReader → dataUrl） */
  createUploadHandler(slot) {
    return (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => this.setIcon(slot, e.target.result);
      reader.readAsDataURL(file);
    };
  }

  /** 应用所有自定义图标（工具栏 + 控制台折叠按钮） */
  applyAll() {
    this.applyToolbarIcons();
    this.applyAdminPanelIcon();
  }

  /** 根据工具栏当前收起/展开状态应用对应图标 */
  applyToolbarIcons() {
    const iconEl = document.querySelector('.toolbar-toggle-icon');
    const toolbar = document.getElementById('sideToolbar');
    if (!iconEl) return;

    const isCollapsed = toolbar ? toolbar.classList.contains('collapsed') : true;
    const dataUrl = this.getIcon(isCollapsed ? UI_ICON_SLOTS.toolbarCollapsed : UI_ICON_SLOTS.toolbarExpanded);

    if (dataUrl) {
      iconEl.style.backgroundImage = `url("${dataUrl}")`;
      iconEl.classList.add('has-custom');
      iconEl.textContent = '';
    } else {
      iconEl.style.backgroundImage = '';
      iconEl.classList.remove('has-custom');
      iconEl.textContent = '';
    }
  }

  /** 应用管理员控制台折叠按钮自定义图标（无自定义时保留 ▶/▼ 文本） */
  applyAdminPanelIcon() {
    const toggle = document.getElementById('panelToggleIcon');
    if (!toggle) return;
    const dataUrl = this.getIcon(UI_ICON_SLOTS.adminPanel);

    if (dataUrl) {
      toggle.textContent = '';
      toggle.style.backgroundImage = `url("${dataUrl}")`;
      toggle.classList.add('has-custom');
    } else {
      toggle.textContent = toggle.textContent || '▶';
      toggle.style.backgroundImage = '';
      toggle.classList.remove('has-custom');
    }
  }

  /** 管理员面板预览 HTML */
  renderPreviewHtml(slot, fallbackText) {
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      return `<img class="admin-icon-preview-img" src="${Utils.escapeHtml(dataUrl)}" alt="图标预览">`;
    }
    return `<span class="admin-icon-preview-fallback">${fallbackText}</span>`;
  }
}

export const UIIcon = new UIIconManager();
export default UIIcon;
