// ！目录拖放（桌面端）
// 基于原生 HTML5 拖放实现桌面端的目录/文章移动，落点分「拖入文件夹」与「平级插入」两种语义。
// 用节点上半/下半区区分两种语义：同一元素既要接收「放入其中」又要接收「插到旁边」。
import { Utils } from '../../../utils.js';
import { Article } from '../../../models/article-model.js';
import { ArticleService } from '../../../services/article-service.js';
import { ApiClient } from '../../../services/api-client.js';
import { UI } from '../../../utils/ui-strings.js';

// 启用拖放（返回停用函数）
export function enableDragDrop(container, updateTreeFn) {
    if (!container) return;
    const treeItems = container.querySelectorAll('.tree-node');
    treeItems.forEach(item => {
        item.setAttribute('draggable', 'true');
    });

    let dragData = null;

    const onDragStart = function (e) {
        const target = e.target.closest('.tree-node');
        if (!target) return;
        const type = target.dataset.type;
        const id = type === 'folder' ? target.dataset.name : target.dataset.articleId;
        if (!id) return;
        dragData = {
            type: type,
            id: id,
            node: target,
            name: target.dataset.name,
            articleId: type === 'article' ? parseInt(target.dataset.articleId) : null
        };
        console.log('[DragDrop] dragStart - dragData:', dragData);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
        // 延迟加类：拖拽镜像在本帧内截取，立即加类会把半透明样式也带进镜像
        setTimeout(() => target.classList.add('dragging'), 0);
    };

    const onDragOver = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.tree-node, .dropzone-background');
        if (!target) return;
        // 每次移动先清掉上一轮高亮：高亮是纯视觉状态，残留会让用户误判落点
        container.querySelectorAll('.drag-over, .dropzone-sibling-highlight').forEach(el => {
            el.classList.remove('drag-over', 'dropzone-sibling-highlight');
            if (el.classList.contains('dropzone-background')) {
                el.style.borderColor = '';
                el.style.background = '';
            } else if (el.classList.contains('tree-node')) {
                el.style.outline = '';
            }
        });

        if (target.classList.contains('tree-node')) {
            const type = target.dataset.type;
            if (type === 'folder') {
                // 下半区判为平级插入，上半区判为拖入该文件夹
                const rect = target.getBoundingClientRect();
                const y = e.clientY;
                const isLowerHalf = (y - rect.top) > (rect.height / 2);
                if (isLowerHalf) {
                    target.classList.add('dropzone-sibling-highlight');
                    target.style.outline = '2px dashed #c47a44';
                    target.style.outlineOffset = '-2px';
                } else {
                    target.classList.add('drag-over');
                }
            } else if (type === 'article') {
                target.classList.add('drag-over');
            }
        } else if (target.classList.contains('dropzone-background')) {
            target.classList.add('drag-over');
            target.style.borderColor = '#c47a44';
            target.style.background = 'rgba(196, 122, 68, 0.15)';
        }
    };

    const onDrop = async function (e) {
        e.preventDefault();
        // 放置前清空全部高亮
        container.querySelectorAll('.drag-over, .dropzone-sibling-highlight').forEach(el => {
            el.classList.remove('drag-over', 'dropzone-sibling-highlight');
            if (el.classList.contains('dropzone-background')) {
                el.style.borderColor = '';
                el.style.background = '';
            } else if (el.classList.contains('tree-node')) {
                el.style.outline = '';
            }
        });

        if (!dragData) {
            console.warn('[DragDrop] 无 dragData，退出');
            return;
        }

        const target = e.target.closest('.tree-node, .dropzone-background');
        if (!target) {
            dragData = null;
            return;
        }

        const sourceType = dragData.type;
        const sourceId = dragData.id;
        let targetFolderId = null;
        // 平级放置：插到目标所在层级；否则拖入目标内部
        let isSibling = false;

        if (target.classList.contains('dropzone-background')) {
            // 底部空白区 = 移到根目录
            isSibling = true;
        } else if (target.classList.contains('tree-node')) {
            const targetType = target.dataset.type;
            if (targetType === 'folder') {
                // 下半区判为平级插入，上半区判为拖入该文件夹
                const rect = target.getBoundingClientRect();
                const y = e.clientY;
                isSibling = (y - rect.top) > (rect.height / 2);
                if (isSibling) {
                    // 平级目标取该文件夹的父级，可能与源相同则为无效移动
                    targetFolderId = ArticleService.getCategoryParent(target.dataset.name);
                    if (targetFolderId === undefined) {
                        Utils.showToast(UI.toast.dragTargetFolderNotFound, true);
                        dragData = null;
                        return;
                    }
                } else {
                    targetFolderId = target.dataset.name;
                }
            } else if (targetType === 'article') {
                // 拖到文章 = 拖入该文章所属文件夹
                const articleId = parseInt(target.dataset.articleId);
                const article = Article.allArticles.find(a => a.id === articleId);
                if (!article) {
                    Utils.showToast(UI.toast.articleNotFound, true);
                    dragData = null;
                    return;
                }
                targetFolderId = article.category || '未分类';
                isSibling = false;
            } else {
                Utils.showToast(UI.toast.dragUnknownType, true);
                dragData = null;
                return;
            }
        } else {
            Utils.showToast(UI.toast.dragUnknownType, true);
            dragData = null;
            return;
        }

        // 源是文件夹时禁止移动到自身
        if (sourceType === 'folder' && isSibling && targetFolderId === sourceId) {
            Utils.showToast(UI.toast.dragCannotMoveToSelf, true);
            dragData = null;
            return;
        }

        // 源是文件夹时禁止移入自身子孙：否则目录树会形成环，渲染时无限递归
        if (sourceType === 'folder' && !isSibling) {
            const isDescendant = (id, targetId) => {
                const children = ArticleService.getCategoryChildren(id);
                for (const child of children) {
                    if (child.id === targetId) return true;
                    if (isDescendant(child.id, targetId)) return true;
                }
                return false;
            };
            if (targetFolderId && isDescendant(sourceId, targetFolderId)) {
                Utils.showToast(UI.toast.dragCannotMoveToChild, true);
                dragData = null;
                return;
            }
        }

        if (sourceType === 'folder') {
            // 平级插入与拖入最终都落到 targetFolderId（差异已在上游落点计算时承担）
            const finalParent = targetFolderId;
            const success = ArticleService.moveCategory(sourceId, finalParent);
            if (success) {
                const msg = finalParent ? '到 "' + finalParent + '"' : '到根目录';
                Utils.showToast(UI.toast.folderMoveSuccess(msg), false);
                ArticleService.fetchArticles(true).then(() => {
                    if (updateTreeFn) updateTreeFn();
                });
            } else {
                Utils.showToast(UI.toast.folderMoveFailed, true);
            }
            dragData = null;
            return;
        }

        if (sourceType === 'article') {
            // 文章移动
            const article = Article.allArticles.find(a => a.id === parseInt(sourceId));
            if (!article) {
                Utils.showToast(UI.toast.articleNotFound, true);
                dragData = null;
                return;
            }
            let newCategory;
            // 两种落点最终都落到目标文件夹；targetFolderId 为空时归入「未分类」
            if (isSibling) {
                newCategory = targetFolderId || '未分类';
            } else {
                newCategory = targetFolderId || '未分类';
            }
            // 目标与现状相同时跳过请求，避免无意义的写库与列表刷新
            if (article.category === newCategory) {
                Utils.showToast(UI.toast.articleAlreadyInTarget, false);
                dragData = null;
                return;
            }
            ApiClient.put('/api/articles/' + article.id, {
                title: article.title,
                content: article.content,
                category: newCategory
            }).then(() => {
                Utils.showToast(UI.toast.articleMoveSuccess(newCategory), false);
                ArticleService.fetchArticles(true).then(() => {
                    if (updateTreeFn) updateTreeFn();
                });
            }).catch(err => {
                Utils.showToast(UI.toast.articleMoveFailed(err.message || err), true);
            });
            dragData = null;
            return;
        }

        Utils.showToast(UI.toast.dragUnknownType, true);
        dragData = null;
    };

    const onDragEnd = function () {
        // dragend 兜底清理：拖拽被 Esc 取消时不会走 drop，高亮需在此复位
        container.querySelectorAll('.drag-over, .dropzone-sibling-highlight').forEach(el => {
            el.classList.remove('drag-over', 'dropzone-sibling-highlight');
            if (el.classList.contains('dropzone-background')) {
                el.style.borderColor = '';
                el.style.background = '';
            } else if (el.classList.contains('tree-node')) {
                el.style.outline = '';
            }
        });
        container.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        dragData = null;
    };

    container.addEventListener('dragstart', onDragStart);
    container.addEventListener('dragover', onDragOver);
    container.addEventListener('drop', onDrop);
    container.addEventListener('dragend', onDragEnd);

    // 停用拖放
    return function disableDragDrop() {
        const treeItems = container.querySelectorAll('.tree-node');
        treeItems.forEach(item => {
            item.setAttribute('draggable', 'false');
        });
        container.removeEventListener('dragstart', onDragStart);
        container.removeEventListener('dragover', onDragOver);
        container.removeEventListener('drop', onDrop);
        container.removeEventListener('dragend', onDragEnd);
        container.style.outline = 'none';
        container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    };
}

// 应用/清除拖放态的可视边框
export function applyDragDropVisuals(container, enable) {
    if (!container) return;
    if (enable) {
        container.style.outline = '2px dashed #c47a44';
        container.style.outlineOffset = '-2px';
    } else {
        container.style.outline = 'none';
    }
}