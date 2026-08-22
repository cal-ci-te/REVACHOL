import { UIHelpers } from '../helpers.js';
import { UIArticles } from '../articles.js';
import { initLongPress } from '../../../utils/touch-context.js';
import { UI } from '../../../utils/ui-strings.js';
import { ArticleListStore } from '../../../stores/article-list-store.js';
import { Utils } from '../../../utils.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

export function bindInteractions(container, contextMenuHandler, handleNodeClickFn, setActiveNodeFn) {
    if (!container) return;
    let clickTimer = null;

    const delegatedClickHandler = function (e) {
        // 如果刚刚触发了长按，阻止单击
        if (container._longPressTriggered) {
            container._longPressTriggered = false;
            return;
        }

        // 可见性切换（管理员）
        const toggleBtn = e.target.closest('.visibility-toggle');
        if (toggleBtn) {
            e.stopImmediatePropagation();
            e.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            const event = new CustomEvent('directory-toggle-visibility', {
                detail: { id: parseInt(toggleBtn.dataset.id), btn: toggleBtn }
            });
            container.dispatchEvent(event);
            return;
        }

        // 文件夹折叠/展开（核心交互）
        const toggleIcon = e.target.closest('.toggle-icon[data-toggle="toggle"]');
        if (toggleIcon) {
            e.stopImmediatePropagation();
            e.preventDefault();
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            const nodeLi = toggleIcon.closest('.tree-node.folder');
            if (nodeLi) {
                const childrenDiv = nodeLi.querySelector('.children');
                if (childrenDiv) {
                    const isVisible = childrenDiv.style.display !== 'none'; // 当前是否展开
                    // 切换UI
                    childrenDiv.style.display = isVisible ? 'none' : 'block';
                    toggleIcon.textContent = isVisible ? '▶' : '▼';
                    const folderIcon = nodeLi.querySelector('.node-icon');
                    if (folderIcon) DirectoryIcon.applyToElement(folderIcon, !isVisible);
                    // 获取文件夹名称
                    const folderName = toggleIcon.dataset.folder || nodeLi.dataset.name;
                    if (folderName) {
                        // ★★★ 关键修复：折叠状态 = 当前是否展开（即点击后变为折叠，所以折叠状态 = isVisible）★★★
                        const newCollapsed = isVisible;
                        Utils.storage.set('folder-collapsed-' + folderName, newCollapsed);
                        console.log(`[FolderState] 存储: ${folderName} = ${newCollapsed}`);
                    }
                }
            }
            return;
        }

        // 单击/双击节点
        const content = e.target.closest('.tree-node-content');
        if (!content) return;
        const nodeLi = content.closest('.tree-node');
        if (!nodeLi) return;

        const nodeData = {
            type: nodeLi.dataset.type,
            articleId: nodeLi.dataset.articleId ? parseInt(nodeLi.dataset.articleId) : null,
            folderFirstId: nodeLi.dataset.folderFirstId ? parseInt(nodeLi.dataset.folderFirstId) : null,
            name: nodeLi.dataset.name,
            nodeId: nodeLi.dataset.nodeId,
        };

        if (clickTimer) {
            clearTimeout(clickTimer);
            clickTimer = null;
            handleNodeClickFn(content, nodeData, true);
        } else {
            clickTimer = setTimeout(() => {
                handleNodeClickFn(content, nodeData, false);
                clickTimer = null;
            }, 250);
        }
    };

    const delegatedDblClickHandler = function (e) {
        e.preventDefault();
    };

    // 右键菜单（PC）
    const contextMenuListener = function (e) {
        const content = e.target.closest('.tree-node-content');
        if (!content) return;
        const nodeLi = content.closest('.tree-node');
        if (!nodeLi) return;
        const isAdmin = window.__REVACHOL__.AppState?.get('isLoggedIn') || false;
        if (!isAdmin) return;
        e.preventDefault();
        const type = nodeLi.dataset.type;
        const name = nodeLi.dataset.name;
        const articleId = nodeLi.dataset.articleId ? parseInt(nodeLi.dataset.articleId) : null;
        contextMenuHandler(e.clientX, e.clientY, type, name, articleId, nodeLi);
    };

    // 移除旧监听，防止重复绑定
    container.removeEventListener('click', delegatedClickHandler);
    container.removeEventListener('dblclick', delegatedDblClickHandler);
    container.removeEventListener('contextmenu', contextMenuListener);

    // 绑定新监听
    container.addEventListener('click', delegatedClickHandler);
    container.addEventListener('dblclick', delegatedDblClickHandler);
    container.addEventListener('contextmenu', contextMenuListener);

    // 长按支持（移动端）
    const longPressCleanup = initLongPress(container, (touch, targetEl) => {
        const isAdmin = window.__REVACHOL__.AppState?.get('isLoggedIn') || false;
        if (!isAdmin) return;
        const nodeLi = targetEl.closest('.tree-node');
        if (!nodeLi) return;
        const type = nodeLi.dataset.type;
        const name = nodeLi.dataset.name;
        const articleId = nodeLi.dataset.articleId ? parseInt(nodeLi.dataset.articleId) : null;
        contextMenuHandler(touch.clientX, touch.clientY, type, name, articleId, nodeLi);
        container._longPressTriggered = true;
    }, {
        getTargetData: (el) => el.closest('.tree-node-content') || el,
    });

    // 返回清理函数
    return function unbind() {
        container.removeEventListener('click', delegatedClickHandler);
        container.removeEventListener('dblclick', delegatedDblClickHandler);
        container.removeEventListener('contextmenu', contextMenuListener);
        longPressCleanup();
    };
}

export function handleNodeClick(nodeElement, nodeData, isDouble, setActiveNodeFn) {
    const type = nodeData.type;
    const articleId = nodeData.articleId;
    const folderFirstId = nodeData.folderFirstId;
    const nodeName = nodeData.name || '';
    const helpers = UIHelpers;
    const articlesModule = UIArticles;

    if (!helpers || !articlesModule) return;

    if (type === 'article' && articleId) {
        if (isDouble) {
            if (window.__REVACHOL__.UIController.detail) {
                window.__REVACHOL__.UIController.detail.openDetail(articleId);
            }
        } else {
            const targetId = helpers.generateCardId(articleId);
            const targetEl = document.getElementById(targetId);
            if (targetEl) {
                helpers.scrollToElement(targetId);
                setActiveNodeFn(nodeData.nodeId);
            } else {
                // 使用 ArticleListStore 获取所有文章，查找目标文章的位置
                const allArticles = ArticleListStore.getAllArticles();
                const index = allArticles.findIndex(a => a.id === articleId);
                if (index !== -1) {
                    const pageSize = ArticleListStore.getPageSize();
                    const targetPage = Math.floor(index / pageSize) + 1;
                    const currentPage = ArticleListStore.getCurrentPage();
                    if (targetPage > currentPage) {
                        ArticleListStore._currentPage = targetPage;
                        ArticleListStore._hasMore = targetPage * pageSize < allArticles.length;
                        articlesModule.renderArticles();
                        setTimeout(() => {
                            const el = document.getElementById(targetId);
                            if (el) helpers.scrollToElement(targetId);
                        }, 400);
                    }
                }
            }
        }
        return;
    }

    if (type === 'folder') {
        if (isDouble) {
            const toggleIcon = nodeElement.querySelector('.toggle-icon[data-toggle="toggle"]');
            if (toggleIcon) toggleIcon.click();
            return;
        }
        if (!folderFirstId) {
            helpers.showNodeWarning(UI.directory.folderNoArticles.replace('{name}', nodeName));
            return;
        }
        const targetId = helpers.generateCardId(folderFirstId);
        const targetEl = document.getElementById(targetId);
        if (targetEl) {
            helpers.scrollToElement(targetId);
            setActiveNodeFn(nodeData.nodeId);
        } else {
            const allArticles = ArticleListStore.getAllArticles();
            const index = allArticles.findIndex(a => a.id === folderFirstId);
            if (index !== -1) {
                const pageSize = ArticleListStore.getPageSize();
                const targetPage = Math.floor(index / pageSize) + 1;
                if (targetPage > ArticleListStore.getCurrentPage()) {
                    ArticleListStore._currentPage = targetPage;
                    ArticleListStore._hasMore = targetPage * pageSize < allArticles.length;
                    articlesModule.renderArticles();
                    setTimeout(() => {
                        const el = document.getElementById(targetId);
                        if (el) helpers.scrollToElement(targetId);
                    }, 400);
                }
            }
        }
    }
}

export function setActiveNode(container, nodeId) {
    if (!container) return;
    const nodes = container.querySelectorAll('.tree-node-content');
    nodes.forEach(el => el.classList.remove('active'));
    const activeEl = container.querySelector('.tree-node-content[data-node-id="' + nodeId + '"]');
    if (activeEl) activeEl.classList.add('active');
}