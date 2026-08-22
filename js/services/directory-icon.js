// 侧边栏目录自定义图标单例 — 基于 CustomIconManager 的自定义图标能力扩展
//
// 与 SiteIcon 不同，目录树是动态渲染的多个 .node-icon 节点，因此本单例
// 不绑定固定 DOM，而是提供：
//   - renderIconHtml(collapsed)  渲染时生成节点图标 HTML
//   - applyToElement(el, collapsed) 折叠/展开切换时更新单个图标
//   - applyToTree()              自定义图标变更后刷新整个目录树
//   - bindControl()              绑定侧边栏上传/重置控件
import { CustomIconManager } from './custom-icon.js';
import { Utils } from '../utils.js';

class DirectoryIconManager extends CustomIconManager {
  constructor() {
    super({
      storageKey: 'directory_icon',
      // 目录树为动态节点，不使用固定容器选择器
      containerSelector: '',
      imgSelector: '',
      fallbackSelector: '',
      eventName: 'directory-icon:updated',
    });
  }

  /** 目录图标没有固定 DOM，直接标记为已初始化 */
  _ensureDom() {
    this._initialised = true;
  }

  /** 覆盖基类：不操作固定 img，而是刷新目录树所有文件夹图标 */
  applyIcon(src) {
    const dataUrl = src !== undefined ? src : this.getIcon();
    this.applyToTree();
    this._syncResetButton();
  }

  /** 初始化：应用已保存的自定义图标 */
  init() {
    this._ensureDom();
    this.applyToTree();
    this._syncResetButton();
  }

  /** 渲染文件夹节点图标 HTML；未设置自定义图标时回退到 emoji */
  renderIconHtml(collapsed = false) {
    const dataUrl = this.getIcon();
    if (dataUrl) {
      return `<img class="node-icon node-icon-img" src="${Utils.escapeHtml(dataUrl)}" alt="">`;
    }
    return `<span class="node-icon">${collapsed ? '📂' : '📁'}</span>`;
  }

  /** 更新单个 .node-icon 元素（用于折叠/展开时保持自定义图标） */
  applyToElement(el, collapsed = false) {
    if (!el) return;
    const dataUrl = this.getIcon();
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

  /** 是否已设置自定义图标 */
  hasCustomIcon() {
    return !!this.getIcon();
  }

  /** 根据是否已设置自定义图标，显示/隐藏重置按钮（管理员面板） */
  _syncResetButton() {
    const resetBtn = document.getElementById('directoryIconResetBtn');
    if (resetBtn) {
      resetBtn.hidden = !this.hasCustomIcon();
    }
  }
}

export const DirectoryIcon = new DirectoryIconManager();
export default DirectoryIcon;
