import { ArticleService } from '../../../services/article-service.js';
import { ApiClient } from '../../../services/api-client.js';
import { Utils } from '../../../utils.js';

/**
 * 处理拖拽放置
 * @param {Object} sourceData - { type, id }
 * @param {Object} targetData - { targetFolderId, isSibling }
 * @param {Object} context - { positionManager, pendingMovesManager, updateTreeFn, isPositionMode }
 * @returns {Promise<void>}
 */
export async function handleDirectoryDrop(sourceData, targetData, context) {
    const { type: sourceType, id: sourceId } = sourceData;
    const { targetFolderId, isSibling } = targetData;
    const {
        positionManager,
        pendingMovesManager,
        updateTreeFn,
        isPositionMode,
    } = context;

    if (sourceType === 'folder') {
        const finalParent = isSibling ? targetFolderId : targetFolderId;
        const success = ArticleService.moveCategory(sourceId, finalParent);
        if (success) {
            const msg = finalParent ? '到 "' + finalParent + '"' : '到根目录';
            Utils.showToast(UI.toast.folderMoveSuccess(msg), false);
            if (updateTreeFn) updateTreeFn();
        } else {
            Utils.showToast(UI.toast.folderMoveFailed, true);
        }
        return;
    }

    if (sourceType === 'article') {
        const allArticles = ArticleService.getAllArticles();
        const article = allArticles.find(a => a.id === parseInt(sourceId));
        if (!article) {
            Utils.showToast(UI.toast.articleNotFound, true);
            return;
        }

        const newCategory = isSibling ? (targetFolderId || '未分类') : (targetFolderId || '未分类');
        if (article.category === newCategory) {
            Utils.showToast(UI.toast.articleAlreadyInTarget, false);
            return;
        }

        // 判断是否处于位置模式（通过快照是否存在）
        if (isPositionMode && positionManager.getSnapshot()) {
            // 位置模式：仅修改内存，记录操作
            article.category = newCategory;
            pendingMovesManager.recordMove(article.id, newCategory);
            if (updateTreeFn) updateTreeFn();
            Utils.showToast(UI.toast.articleMovePending, false);
            return;
        }

        // 非位置模式：立即发送 API
        try {
            await ApiClient.put('/api/articles/' + article.id, {
                title: article.title,
                content: article.content,
                category: newCategory
            });
            Utils.showToast(UI.toast.articleMoveSuccess(newCategory), false);
            await ArticleService.fetchArticles(true);
            if (updateTreeFn) updateTreeFn();
        } catch (err) {
            console.error('[DropHandler] 移动文章失败:', err);
            Utils.showToast(UI.toast.articleMoveFailed(err.message), true);
        }
        return;
    }

    Utils.showToast(UI.toast.dragUnknownType, true);
}