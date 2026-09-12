// ！目录拖放处理
// 处理拖入目录树的放置：文件夹走内存搬迁，文章按「位置模式/即时模式」决定入队还是立刻发请求。
import { ArticleService } from '../../../services/article-service.js';
import { ApiClient } from '../../../services/api-client.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';

// 处理拖放
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
        // 平级插入与拖入最终都落到 targetFolderId（差异已在上游 targetData 计算时承担）
        const finalParent = targetFolderId;
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

        // 平级插入与拖入最终都归入同一目标分类（差异已在上游 targetData 计算时承担）
        const newCategory = targetFolderId || '未分类';
        // 落到原分类时直接返回：避免产生一次无意义的移动请求
        if (article.category === newCategory) {
            Utils.showToast(UI.toast.articleAlreadyInTarget, false);
            return;
        }

        // 位置模式以「存在快照」为判据：该模式下落库要等用户点保存
        if (isPositionMode && positionManager.getSnapshot()) {
            // 位置模式：仅改内存并记录，保存时统一提交
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