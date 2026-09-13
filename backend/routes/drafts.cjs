// ！文章草稿路由
// 草稿历史按「每次保存追加一条、不覆盖」存储，支持列表、保存与删除。
// 前端用 sendBeacon 在页面关闭前自动保存，避免草稿丢失。
// POST / DELETE 经 requireAuth 保护；GET 保持公开（草稿列表本身不含敏感信息）。
const { send, sendError, json } = require('../enhance.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { cleanExpiredDrafts, enforceDraftLimit } = require('../cleanup-drafts.cjs');
const { requireAuth } = require('../auth.cjs');

function registerDraftsRoutes(GET, POST, PUT, DELETE) {

    GET('/api/articles/:id/drafts', async (req, res) => {
        const articleId = parseInt(req.params.id);
        // 按 saved_at 倒序：前端列表以最新草稿置顶
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

            // 数量上限：超出部分按 saved_at 升序删除，即保留最新的 20 条
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

            // 再做一次过期与数量清理；包在内层 try 中，维护失败不影响本次保存的响应
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
