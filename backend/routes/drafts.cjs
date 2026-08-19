// 文章草稿历史：每次保存草稿追加一条记录（不覆盖），支持预览/恢复/删除。
// 使用 sendBeacon 在页面关闭前自动保存，避免数据丢失。
// 写操作（POST/DELETE）通过 requireAuth 保护；GET 保持公开（草稿列表本身不敏感）。
const { send, sendError, json } = require('../enhance.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { cleanExpiredDrafts, enforceDraftLimit } = require('../cleanup-drafts.cjs');
const { requireAuth } = require('../auth.cjs');

function registerDraftsRoutes(GET, POST, PUT, DELETE) {

    GET('/api/articles/:id/drafts', async (req, res) => {
        const articleId = parseInt(req.params.id);
        const rows = dbModule.queryAll(
            'SELECT id, article_id, title, content, category, saved_at FROM article_drafts WHERE article_id = ? ORDER BY saved_at DESC',
            [articleId]
        );
        send(res, rows);
    });

    POST('/api/articles/:id/drafts', requireAuth(async (req, res) => {
        const articleId = parseInt(req.params.id);
        try {
            const body = await json(req);
            const { title, content, category } = body;
            console.log('[Drafts] POST articleId:', articleId, 'title:', title, 'content length:', content ? content.length : 0);
            if (!title) {
                sendError(res, 400, '标题不能为空');
                return;
            }
            const now = new Date().toISOString();
            const result = dbModule.run(
                'INSERT INTO article_drafts (article_id, title, content, category, saved_at) VALUES (?, ?, ?, ?, ?)',
                [articleId, title, content, category || '未分类', now]
            );
            console.log('[Drafts] INSERT result lastInsertRowid:', result.lastInsertRowid);

            // 数量限制：每个文章最多保留 MAX 条草稿，超出删最旧
            const MAX = 20;
            const countRow = dbModule.query(
                'SELECT COUNT(*) as count FROM article_drafts WHERE article_id = ?',
                [articleId]
            );
            const total = countRow ? countRow.count : 0;
            if (total > MAX) {
                const excess = total - MAX;
                dbModule.exec(
                    'DELETE FROM article_drafts WHERE id IN (SELECT id FROM article_drafts WHERE article_id = ? ORDER BY saved_at ASC LIMIT ?)',
                    [articleId, excess]
                );
                console.log('[Drafts] 清理了', excess, '条旧草稿（文章', articleId, '）');
            }

            broadcast({ type: 'draft_saved', payload: { articleId, savedAt: now } });

            // 增量清理（过期 + 数量限制），不阻断响应
            try { cleanExpiredDrafts(articleId); enforceDraftLimit(articleId); } catch (e) {}

            send(res, { success: true, savedAt: now, id: result.lastInsertRowid });
        } catch (err) {
            console.error('[Drafts] POST 失败:', err.message);
            sendError(res, 500, '服务器错误');
        }
    }));

    DELETE('/api/articles/:id/drafts/:draftId', requireAuth(async (req, res) => {
        const draftId = parseInt(req.params.draftId);
        const existing = dbModule.query('SELECT id FROM article_drafts WHERE id = ?', [draftId]);
        if (!existing) {
            sendError(res, 404, 'Draft not found');
            return;
        }
        dbModule.exec('DELETE FROM article_drafts WHERE id = ?', [draftId]);
        send(res, { success: true });
    }));
}

module.exports = { registerDraftsRoutes };
