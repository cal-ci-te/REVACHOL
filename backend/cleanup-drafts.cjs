// ！草稿清理
// 删除过期草稿，并强制单篇文章的草稿数量上限。
// 保留期 30 天、单篇上限 20 条；启动时与每次保存时各执行一次。
const dbModule = require('./db.cjs');

const MAX_AGE_DAYS = 30;
const MAX_PER_ARTICLE = 20;

// 清理超过保留期的草稿
// 传入 articleId 时只清理该篇，省略则全量清理
// 整体 try-catch：属后台维护动作，失败不应影响主流程，故以返回 0 表示未删除
function cleanExpiredDrafts(articleId) {
    const cutoff = new Date(Date.now() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    try {
        let sql, params;
        if (articleId !== undefined && articleId !== null) {
            sql = 'DELETE FROM article_drafts WHERE saved_at < ? AND article_id = ?';
            params = [cutoff, articleId];
        } else {
            sql = 'DELETE FROM article_drafts WHERE saved_at < ?';
            params = [cutoff];
        }
        const result = dbModule.exec(sql, params);
        if (result.changes > 0) {
            console.log('[Cleanup] 删除了', result.changes, '条过期草稿',
                articleId !== undefined ? '(文章 ' + articleId + ')' : '(全量)');
        }
        return result.changes;
    } catch (err) {
        console.error('[Cleanup] 清理失败:', err.message);
        return 0;
    }
}

// 强制执行单篇文章的草稿数量上限
// 传入 articleId 处理单篇，省略则先查出所有超限文章再逐篇处理
function enforceDraftLimit(articleId) {
    try {
        if (articleId !== undefined && articleId !== null) {
            const row = dbModule.query(
                'SELECT COUNT(*) as cnt FROM article_drafts WHERE article_id = ?', [articleId]
            );
            if (row && row.cnt > MAX_PER_ARTICLE) {
                const excess = row.cnt - MAX_PER_ARTICLE;
                // 按 saved_at 升序删，超限部分保留最新的一批
                const result = dbModule.exec(
                    'DELETE FROM article_drafts WHERE id IN (SELECT id FROM article_drafts WHERE article_id = ? ORDER BY saved_at ASC LIMIT ?)',
                    [articleId, excess]
                );
                if (result.changes > 0) {
                    console.log('[Cleanup] 文章', articleId, '超出限制，删除了', result.changes, '条旧草稿');
                }
                return result.changes;
            }
        } else {
            // 全量模式：先用 HAVING 一次查出超限文章，避免逐篇探测
            const rows = dbModule.queryAll(
                'SELECT article_id, COUNT(*) as cnt FROM article_drafts GROUP BY article_id HAVING cnt > ?',
                [MAX_PER_ARTICLE]
            );
            let total = 0;
            rows.forEach(r => {
                total += enforceDraftLimit(r.article_id);
            });
            return total;
        }
    } catch (err) {
        console.error('[Cleanup] 数量限制执行失败:', err.message);
        return 0;
    }
    return 0;
}

module.exports = { cleanExpiredDrafts, enforceDraftLimit };
