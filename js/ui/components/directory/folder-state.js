import { Utils } from '../../../utils.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

/**
 * 处理文件夹折叠/展开切换
 * @param {Event} e - 点击事件
 * @param {HTMLElement} container - 目录树容器（用于派发自定义事件）
 */
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
      // 当前展开 → 点击后收起（r0 ▶）；当前收起 → 点击后展开（r90 ▼）
      arrowEl.textContent = isVisible ? '▶' : '▼';
      arrowEl.classList.toggle('arrow-r0', isVisible);
      arrowEl.classList.toggle('arrow-r90', !isVisible);
    } else {
      toggleIcon.textContent = isVisible ? '▶' : '▼';
    }

    const folderIcon = nodeLi.querySelector('.node-icon');
    if (folderIcon) DirectoryIcon.applyToElement(folderIcon, !isVisible);

    // 使用唯一路径持久化
    const nodePath = nodeLi.dataset.path;
    if (nodePath) {
        const isCollapsed = !isVisible;
        Utils.storage.set('folder-collapsed-' + nodePath, isCollapsed);
    }

    // 派发事件以便其他模块监听（如需要）
    const event = new CustomEvent('directory-folder-toggled', {
        detail: { nodePath, isCollapsed: !isVisible }
    });
    container.dispatchEvent(event);
}