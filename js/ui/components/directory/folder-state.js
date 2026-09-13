// ！文件夹折叠状态
// 处理文件夹节点的展开/收起：切换子树显隐、箭头图标、文件夹图标，并持久化折叠态。
// 折叠态按节点路径而非索引持久化：目录顺序变化后索引会错位，路径保持稳定。
import { Utils } from '../../../utils.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

// 切换文件夹展开/收起
export function handleFolderToggle(e, container) {
    const toggleIcon = e.target.closest('.toggle-icon[data-toggle="toggle"]');
    if (!toggleIcon) return;
    e.stopPropagation();

    const nodeLi = toggleIcon.closest('.tree-node.folder');
    if (!nodeLi) return;

    const childrenDiv = nodeLi.querySelector('.children');
    if (!childrenDiv) return;

    const isVisible = childrenDiv.style.display !== 'none';
    const newDisplay = isVisible ? 'none' : 'block';
    childrenDiv.style.display = newDisplay;
    const arrowEl = toggleIcon.querySelector('.icon-pack-arrow');
    if (arrowEl) {
      // 箭头方向随折叠态取反：展开态显示 ▶（点击将收起），收起态显示 ▼
      arrowEl.textContent = isVisible ? '▶' : '▼';
      arrowEl.classList.toggle('arrow-r0', isVisible);
      arrowEl.classList.toggle('arrow-r90', !isVisible);
    } else {
      toggleIcon.textContent = isVisible ? '▶' : '▼';
    }

    const folderIcon = nodeLi.querySelector('.node-icon');
    if (folderIcon) DirectoryIcon.applyToElement(folderIcon, !isVisible);

    // 持久化折叠态（折叠 = 子树不可见）
    const nodePath = nodeLi.dataset.path;
    if (nodePath) {
        const isCollapsed = !isVisible;
        Utils.storage.set('folder-collapsed-' + nodePath, isCollapsed);
    }

    // 派发事件供其他模块监听
    const event = new CustomEvent('directory-folder-toggled', {
        detail: { nodePath, isCollapsed: !isVisible }
    });
    container.dispatchEvent(event);
}