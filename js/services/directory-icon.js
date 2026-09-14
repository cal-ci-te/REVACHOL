// ！目录图标单例
// 管理三个图标槽位：folderCollapsed（文件夹收起，默认「打开的文件夹」）、
// folderExpanded（展开，默认「文件夹」）、header（侧边栏目录标题，默认「卷轴」）。
// 旧版单槽位 `directory_icon` 作为 folderExpanded 的向后兼容回退。

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
    // 图标包外部覆盖：不写 localStorage，包删除/切主题后自动回退旧数据
    this._external = {};
  }

  // 读取指定槽位图标
  // 外部包覆盖优先，其次 localStorage
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
  createUploadHandler(slot) {
    return (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => this.setIcon(slot, e.target.result);
      reader.readAsDataURL(file);
    };
  }

  // 渲染文件夹节点图标 HTML
  // 按收起/展开状态选择对应槽位
  renderIconHtml(collapsed = false) {
    const slot = collapsed ? DIRECTORY_ICON_SLOTS.folderCollapsed : DIRECTORY_ICON_SLOTS.folderExpanded;
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      return `<img class="node-icon node-icon-img" src="${Utils.escapeHtml(dataUrl)}" alt="">`;
    }
    return `<span class="node-icon">${collapsed ? '📂' : '📁'}</span>`;
  }

  // 渲染预览 HTML
  renderPreviewHtml(slot, fallbackText) {
    const dataUrl = this.getIcon(slot);
    if (dataUrl) {
      return `<img class="admin-icon-preview-img" src="${Utils.escapeHtml(dataUrl)}" alt="图标预览">`;
    }
    return `<span class="admin-icon-preview-fallback">${fallbackText}</span>`;
  }

  // 更新单个节点图标
  // 用新元素替换旧元素而非改 innerHTML：保留事件委托绑定的父级结构
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

  // 刷新目录树全部文件夹图标
  // 收起状态取自 .children 的 display：展开与否由目录树模块控制，此处只读取不推断
  applyToTree() {
    document.querySelectorAll('.tree-node.folder > .tree-node-content > .node-icon').forEach((el) => {
      const nodeLi = el.closest('.tree-node.folder');
      const childrenDiv = nodeLi && nodeLi.querySelector('.children');
      const isCollapsed = childrenDiv ? childrenDiv.style.display === 'none' : false;
      this.applyToElement(el, isCollapsed);
    });
  }

  // 应用目录标题图标
  applyHeaderIcon() {
    const titleEl = document.querySelector('#sidebarTitle') || document.querySelector('.sidebar-header h3');
    if (!titleEl) return;
    const dataUrl = this.getIcon(DIRECTORY_ICON_SLOTS.header);
    const sidebar = document.getElementById('sidebar');
    const isCollapsed = sidebar ? sidebar.classList.contains('collapsed') : false;
    // 收起状态下省略「目录」文字，仅留图标
    const label = isCollapsed ? '' : ' 目录';

    if (dataUrl) {
      titleEl.innerHTML = `<img class="sidebar-header-icon-img" src="${Utils.escapeHtml(dataUrl)}" alt="">${label}`;
    } else {
      titleEl.textContent = isCollapsed ? '📜' : '📜 目录';
    }
  }

  // 应用全部目录图标
  applyAll() {
    this.applyToTree();
    this.applyHeaderIcon();
  }

  // 初始化
  init() {
    this.applyAll();
  }
}

export const DirectoryIcon = new DirectoryIconManager();
export default DirectoryIcon;
