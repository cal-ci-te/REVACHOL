// 侧边栏目录自定义图标单例
//
// 管理三个图标槽位：
//   - folderCollapsed  文件夹收起状态（默认 📂）
//   - folderExpanded   文件夹展开状态（默认 📁）
//   - header           侧边栏目录本身图标（默认 📜）
// 旧版本单槽位 `directory_icon` 作为 folderExpanded 的向后兼容回退。
import { Utils } from '../utils.js';

export const DIRECTORY_ICON_SLOTS = {
  folderCollapsed: 'folderCollapsed',
  folderExpanded: 'folderExpanded',
  header: 'header',
};

const STORAGE_KEYS = {
  [DIRECTORY_ICON_SLOTS.folderCollapsed]: 'directory_icon_folder_collapsed',
  [DIRECTORY_ICON_SLOTS.folderExpanded]: 'directory_icon_folder_expanded',
  [DIRECTORY_ICON_SLOTS.header]: 'directory_icon_header',
};

// 旧版单图标存储键：仅作为展开图标回退
const LEGACY_FOLDER_ICON_KEY = 'directory_icon';

class DirectoryIconManager {
  constructor() {
    // 图标包外部覆盖（不写 localStorage；包删除/切主题后自动回退旧数据）
    this._external = {};
  }

  /** 读取指定槽位的图标 dataUrl（外部包覆盖优先，其次 localStorage） */
  getIcon(slot) {
    if (this._external && this._external[slot]) return this._external[slot];
    const dataUrl = Utils.storage.get(STORAGE_KEYS[slot]);
    if (dataUrl) return dataUrl;
    // 旧数据兼容：旧 directory_icon 视为展开图标
    if (slot === DIRECTORY_ICON_SLOTS.folderExpanded) {
      return Utils.storage.get(LEGACY_FOLDER_ICON_KEY);
    }
    return null;
  }

  /** 设置外部 URL 覆盖（图标包）；url 为空时清除覆盖并回退旧逻辑 */
  setExternalIcon(slot, url) {
    if (url) {
      this._external[slot] = url;
    } else {
      delete this._external[slot];
    }
    this.applyAll();
  }

  /** 是否已设置自定义图标 */
  hasIcon(slot) {
    return !!this.getIcon(slot);
  }

  /** 保存并应用指定槽位图标 */
  setIcon(slot, dataUrl) {
    if (!dataUrl) {
      this.removeIcon(slot);
      return;
    }
    Utils.storage.set(STORAGE_KEYS[slot], dataUrl);
    this.applyAll();
  }

  /** 移除指定槽位图标，恢复默认 */
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

  /** 渲染文件夹节点图标 HTML：按收起/展开状态选择对应自定义图标 */
  renderIconHtml(collapsed = false) {
    const slot = collapsed ? DIRECTORY_ICON_SLOTS.folderCollapsed : DIRECTORY_ICON_SLOTS.folderExpanded;
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      return `<img class="node-icon node-icon-img" src="${Utils.escapeHtml(dataUrl)}" alt="">`;
    }
    return `<span class="node-icon">${collapsed ? '📂' : '📁'}</span>`;
  }

  /** 管理员面板预览 HTML */
  renderPreviewHtml(slot, fallbackText) {
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      return `<img class="admin-icon-preview-img" src="${Utils.escapeHtml(dataUrl)}" alt="图标预览">`;
    }
    return `<span class="admin-icon-preview-fallback">${fallbackText}</span>`;
  }

  /** 更新单个 .node-icon 元素（折叠/展开时切换对应图标） */
  applyToElement(el, collapsed = false) {
    if (!el) return;
    const slot = collapsed ? DIRECTORY_ICON_SLOTS.folderCollapsed : DIRECTORY_ICON_SLOTS.folderExpanded;
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      const img = document.createElement('img');
      img.className = 'node-icon node-icon-img';
      img.src = dataUrl;
      img.alt = '';
      el.replaceWith(img);
    } else {
      const span = document.createElement('span');
      span.className = 'node-icon';
      span.textContent = collapsed ? '📂' : '📁';
      el.replaceWith(span);
    }
  }

  /** 刷新当前目录树中所有文件夹节点图标 */
  applyToTree() {
    document.querySelectorAll('.tree-node.folder > .tree-node-content > .node-icon').forEach((el) => {
      const nodeLi = el.closest('.tree-node.folder');
      const childrenDiv = nodeLi && nodeLi.querySelector('.children');
      const isCollapsed = childrenDiv ? childrenDiv.style.display === 'none' : false;
      this.applyToElement(el, isCollapsed);
    });
  }

  /** 应用侧边栏“目录”标题图标（默认 📜） */
  applyHeaderIcon() {
    const titleEl = document.querySelector('#sidebarTitle') || document.querySelector('.sidebar-header h3');
    if (!titleEl) return;
    const dataUrl = this.getIcon(DIRECTORY_ICON_SLOTS.header);
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;
    const label = isCollapsed ? '' : ' 目录';

    if (dataUrl) {
      titleEl.innerHTML = `<img class="sidebar-header-icon-img" src="${Utils.escapeHtml(dataUrl)}" alt="">${label}`;
    } else {
      titleEl.textContent = isCollapsed ? '📜' : '📜 目录';
    }
  }

  /** 应用所有目录图标（文件夹树 + 目录标题） */
  applyAll() {
    this.applyToTree();
    this.applyHeaderIcon();
  }

  /** 初始化：应用已保存的自定义图标 */
  init() {
    this.applyAll();
  }
}

export const DirectoryIcon = new DirectoryIconManager();
export default DirectoryIcon;
