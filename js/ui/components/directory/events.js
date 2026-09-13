// ！目录树事件
// 目录树的交互实现：点击/双击节点、右键与长按菜单、可见性开关、折叠切换。
// 单击用 250ms 定时器与双击区分：浏览器不提供「仅单击」事件，只能靠延时判定。
import { UIHelpers } from '../helpers.js';
import { UIArticles } from '../articles.js';
import { initLongPress } from '../../../utils/touch-context.js';
import { UI } from '../../../utils/ui-strings.js';
import { ArticleListStore } from '../../../stores/article-list-store.js';
import { Utils } from '../../../utils.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';

// 绑定点击/右键/长按（返回解绑函数）
export function bindInteractions(container, contextMenuHandler, handleNodeClickFn, setActiveNodeFn) {
    if (!container) return;
    let clickTimer = null;

    const delegatedClickHandler = function (e) {
        // 长按刚触发过则吞掉本次单击：长按与单击共用同一次触摸
        if (container._longPressTriggered) {
            container._longPressTriggered = false;
            return;
        }

        // 可见性切换（管理员）
        const toggleBtn = e.target.closest('.visibility-toggle');
        if (toggleBtn) {
            e.stopImmediatePropagation();
            e.preventDefault();
            // 取消挂起的单击定时器：按钮点击不应再触发节点单击
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

        // 折叠/展开
        const toggleIcon = e.target.closest('.toggle-icon[data-toggle="toggle"]');
        if (toggleIcon) {
            e.stopImmediatePropagation();
            e.preventDefault();
            // 同上：折叠点击不应触发节点单击
            if (clickTimer) {
                clearTimeout(clickTimer);
                clickTimer = null;
            }
            const nodeLi = toggleIcon.closest('.tree-node.folder');
            if (nodeLi) {
                const childrenDiv = nodeLi.querySelector('.children');
                if (childrenDiv) {
                    const isVisible = childrenDiv.style.display !== 'none';
                    childrenDiv.style.display = isVisible ? 'none' : 'block';
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
                    const folderName = toggleIcon.dataset.folder || nodeLi.dataset.name;
                    if (folderName) {
                        // 折叠态 = 当前是否展开：点击后状态翻转
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
            // 已有挂起定时器 → 本次是同一次双击的第二次点击
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

    // dblclick 仅用于屏蔽浏览器的原生双击选中行为，实际逻辑走上面的单击定时器
    const delegatedDblClickHandler = function (e) {
        e.preventDefault();
    };

    // 右键菜单（非管理员不响应，避免暴露管理操作入口）
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

    // 移除旧监听再绑定：重绘时可能对同一容器重复调用，不去重会叠加多份回调
    container.removeEventListener('click', delegatedClickHandler);
    container.removeEventListener('dblclick', delegatedDblClickHandler);
    container.removeEventListener('contextmenu', contextMenuListener);

    container.addEventListener('click', delegatedClickHandler);
    container.addEventListener('dblclick', delegatedDblClickHandler);
    container.addEventListener('contextmenu', contextMenuListener);

    // 长按菜单（移动端替代右键）
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
        // 长按目标上溯到内容行：菜单需要 tree-node-content 内的节点数据
        getTargetData: (el) => el.closest('.tree-node-content') || el,
    });

    // 解绑（含长按监听）
    return function unbind() {
        container.removeEventListener('click', delegatedClickHandler);
        container.removeEventListener('dblclick', delegatedDblClickHandler);
        container.removeEventListener('contextmenu', contextMenuListener);
        longPressCleanup();
    };
}

// 处理节点单击/双击
// 单击滚动到卡片（跨页时先切页再滚），双击打开详情；文件夹双击等价于点箭头
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
                // 目标卡片不在当前页：先翻到目标页再滚动
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
                        // 等卡片渲染完成再滚动，否则目标元素尚未存在
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
            // 双击文件夹 = 切换折叠
            const toggleIcon = nodeElement.querySelector('.toggle-icon[data-toggle="toggle"]');
            if (toggleIcon) toggleIcon.click();
            return;
        }
        if (!folderFirstId) {
            helpers.showNodeWarning(UI.directory.folderNoArticles.replace('{name}', nodeName));
            return;
        }
        // 单击文件夹跳到其首篇文章
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

// 高亮激活节点
export function setActiveNode(container, nodeId) {
    if (!container) return;
    const nodes = container.querySelectorAll('.tree-node-content');
    // 先清全部再置一：节点是整树重绘的，逐个比对旧激活项反而更容易残留
    nodes.forEach(el => el.classList.remove('active'));
    const activeEl = container.querySelector('.tree-node-content[data-node-id="' + nodeId + '"]');
    if (activeEl) activeEl.classList.add('active');
}