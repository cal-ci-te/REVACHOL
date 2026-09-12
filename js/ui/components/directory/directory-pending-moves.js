// ！待提交移动队列
// 位置模式下拖拽产生的分类变更先入队，点保存时再统一提交，避免每次拖拽都发一次请求。
import { ArticleService } from '../../../services/article-service.js';
import { ApiClient } from '../../../services/api-client.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';

// 创建待移动队列管理器
export function createPendingMovesManager() {
    let pendingMoves = [];

    // 加入队列
    function recordMove(articleId, newCategory) {
        pendingMoves.push({ articleId, newCategory });
        console.log('[PendingMoves] 记录移动操作:', articleId, '->', newCategory);
    }

    // 清空队列
    function clearMoves() {
        if (pendingMoves.length > 0) {
            console.log('[PendingMoves] 清空待处理移动操作，共', pendingMoves.length, '项');
            pendingMoves = [];
        }
    }

    // 逐条提交
    // 先复制并清空队列再提交：中途失败或刷新时不会把已完成项重复提交
    async function commitMoves(updateTreeFn) {
        if (pendingMoves.length === 0) {
            console.log('[PendingMoves] 无待提交的移动操作');
            return;
        }
        console.log('[PendingMoves] 提交移动操作，共', pendingMoves.length, '项');
        const moves = [...pendingMoves];
        pendingMoves = [];
        let hasError = false;

        for (const move of moves) {
            try {
                const articles = ArticleService.getAllArticles();
                const article = articles.find(a => a.id === move.articleId);
                if (!article) {
                    console.warn('[PendingMoves] 文章不存在，跳过:', move.articleId);
                    continue;
                }
                await ApiClient.put('/api/articles/' + move.articleId, {
                    title: article.title,
                    content: article.content,
                    category: move.newCategory
                });
                console.log('[PendingMoves] 提交成功:', move.articleId);
            } catch (err) {
                console.error('[PendingMoves] 提交移动失败:', move.articleId, err);
                Utils.showToast(UI.toast.positionModeSaveError(err.message), true);
                hasError = true;
            }
        }

        await ArticleService.fetchArticles(true);
        if (updateTreeFn) updateTreeFn();
        // 部分失败时改报「部分成功」：全量失败提示会掩盖已生效的那几条
        if (!hasError) {
            Utils.showToast(UI.toast.positionModeSaved, false);
        } else {
            Utils.showToast(UI.toast.positionModeSavePartialError, true);
        }
    }

    // 读取队列副本
    function getPendingMoves() {
        return pendingMoves.slice();
    }

    return {
        recordMove,
        clearMoves,
        commitMoves,
        getPendingMoves,
    };
}