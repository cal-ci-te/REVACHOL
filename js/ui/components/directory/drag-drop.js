import { Utils } from '../../../utils.js';
import { Article } from '../../../models/article-model.js';
import { ArticleService } from '../../../services/article-service.js';
import { ApiClient } from '../../../services/api-client.js';
// [新增] 导入 UI 文案
import { UI } from '../../../utils/ui-strings.js';

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
        setTimeout(() => target.classList.add('dragging'), 0);
    };

    const onDragOver = function (e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const target = e.target.closest('.tree-node, .dropzone-background');
        if (!target) return;
        // 清除之前的 hover 样式
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
                // 检查鼠标是否在节点下半部分（平级放置）
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
        // 清除所有高亮
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
        let isSibling = false; // 是否为平级放置

        if (target.classList.contains('dropzone-background')) {
            // 底部空白区 → 平级
            isSibling = true;
        } else if (target.classList.contains('tree-node')) {
            const targetType = target.dataset.type;
            if (targetType === 'folder') {
                // 检查鼠标是否在节点下半部分（平级放置）
                const rect = target.getBoundingClientRect();
                const y = e.clientY;
                isSibling = (y - rect.top) > (rect.height / 2);
                if (isSibling) {
                    // 平级目标：该文件夹的父级
                    targetFolderId = ArticleService.getCategoryParent(target.dataset.name);
                    if (targetFolderId === undefined) {
                        // [修改] 使用 UI 文案
                        Utils.showToast(UI.toast.dragTargetFolderNotFound, true);
                        dragData = null;
                        return;
                    }
                } else {
                    // 拖入目标：该文件夹本身
                    targetFolderId = target.dataset.name;
                }
            } else if (targetType === 'article') {
                // 拖到文章 → 目标为该文章所属文件夹（仅当源为文件夹或文章时）
                const articleId = parseInt(target.dataset.articleId);
                const article = Article.allArticles.find(a => a.id === articleId);
                if (!article) {
                    Utils.showToast(UI.toast.articleNotFound, true);
                    dragData = null;
                    return;
                }
                targetFolderId = article.category || '未分类';
                isSibling = false; // 拖到文章视为拖入该文章所在文件夹（默认）
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

        // 如果源是文件夹，平级移动时目标不能是源自身
        if (sourceType === 'folder' && isSibling && targetFolderId === sourceId) {
            Utils.showToast(UI.toast.dragCannotMoveToSelf, true);
            dragData = null;
            return;
        }

        // 如果源是文件夹且目标文件夹是源自身的子文件夹（拖入时），禁止
        if (sourceType === 'folder' && !isSibling) {
            // 检查是否将文件夹拖到其子文件夹中（形成循环）
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
            // 文件夹移动
            const finalParent = isSibling ? targetFolderId : targetFolderId;
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
            if (isSibling) {
                // 平级放置：将文章移动到目标文件夹的父级（可能为 null）
                newCategory = targetFolderId || '未分类';
            } else {
                // 拖入文件夹
                newCategory = targetFolderId || '未分类';
            }
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

export function applyDragDropVisuals(container, enable) {
    if (!container) return;
    if (enable) {
        container.style.outline = '2px dashed #c47a44';
        container.style.outlineOffset = '-2px';
    } else {
        container.style.outline = 'none';
    }
}