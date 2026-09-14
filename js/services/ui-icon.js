// ！工具栏图标单例
// 管理三个图标槽位：toolbarCollapsed（顶部工具栏收起，默认齿轮）、toolbarExpanded（展开，默认左三角）、
// adminPanel（控制台折叠箭头，默认右/下三角）。图标以 dataUrl 存入 localStorage，可随时上传/重置。

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
  constructor() {
    // 图标包外部覆盖：不写 localStorage，包删除/切主题后自动回退旧数据
    this._external = {};
  }

  // 读取指定槽位图标
  // 外部包覆盖优先，其次 localStorage
  getIcon(slot) {
    if (this._external && this._external[slot]) return this._external[slot];
    return Utils.storage.get(STORAGE_KEYS[slot]);
  }

  // 设置外部覆盖
  // url 为空时清除覆盖并回退旧逻辑
  setExternalIcon(slot, url) {
    if (url) {
      this._external[slot] = url;
    } else {
      delete this._external[slot];
    }
    this.applyAll();
  }

  // 判断是否已设置自定义图标
  hasIcon(slot) {
    return !!this.getIcon(slot);
  }

  // 保存并应用图标
  setIcon(slot, dataUrl) {
    // 空值等价于移除，避免存下空串导致回退判断失效
    if (!dataUrl) {
      this.removeIcon(slot);
      return;
    }
    Utils.storage.set(STORAGE_KEYS[slot], dataUrl);
    this.applyAll();
  }

  // 移除图标并恢复默认
  removeIcon(slot) {
    Utils.storage.remove(STORAGE_KEYS[slot]);
    this.applyAll();
  }

  // 生成上传处理器
  // FileReader 读出 dataUrl 后落库，避免上传接口依赖
  createUploadHandler(slot) {
    return (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => this.setIcon(slot, e.target.result);
      reader.readAsDataURL(file);
    };
  }

  // 应用全部图标
  applyAll() {
    this.applyToolbarIcons();
    this.applyAdminPanelIcon();
  }

  // 应用工具栏图标
  // 按工具栏当前收起/展开状态选择对应槽位
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

  // 应用控制台折叠图标
  applyAdminPanelIcon() {
    const toggle = document.getElementById('panelToggleIcon');
    if (!toggle) return;
    const dataUrl = this.getIcon(UI_ICON_SLOTS.adminPanel);

    if (dataUrl) {
      toggle.textContent = '';
      toggle.style.backgroundImage = `url("${dataUrl}")`;
      toggle.classList.add('has-custom');
    } else {
      // 无自定义图标时按 arrow-r0/arrow-r90 旋转类显示 emoji（默认向右 ▶ / 向下 ▼）
      toggle.textContent = toggle.classList.contains('arrow-r90') ? '▼' : '▶';
      toggle.style.backgroundImage = '';
      toggle.classList.remove('has-custom');
    }
  }

  // 渲染预览 HTML
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
