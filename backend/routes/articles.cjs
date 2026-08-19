// 文章 CRUD + 可见性控制。每次写操作后通过 WebSocket broadcast 通知所有客户端刷新。
// 所有写操作前通过 validate.cjs 做输入长度校验，防止超长字符串导致数据库性能问题。
// 写操作通过 requireAuth 包装器保护：仅携带有效 Token 的管理员可执行。
const { send, sendError, json } = require('../enhance.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { validate } = require('../validate.cjs');
const { requireAuth } = require('../auth.cjs');

function validateFields(res, fields) {
    const err = validate(fields);
    if (err) {
        sendError(res, 400, err.error);
        return true; // 表示已处理
    }
    return false;
}

function registerArticleRoutes(GET, POST, PUT, DELETE) {

    GET('/api/articles', async (req, res) => {
        const rows = dbModule.queryAll('SELECT * FROM articles ORDER BY id');
        send(res, rows);
    });

    POST('/api/articles', requireAuth(async (req, res) => {
        const { title, content, category } = await json(req);
        if (validateFields(res, { title, content, category })) return;
        const now = new Date().toISOString();
        dbModule.run(
            'INSERT INTO articles (title, content, category, updateTime, visible) VALUES (?, ?, ?, ?, 1)',
            [title, content, category || '默认分类', now]
        );
        const row = dbModule.query('SELECT last_insert_rowid() as id');
        const newArticle = {
            id: row.id,
            title,
            content,
            category: category || '默认分类',
            updateTime: now,
            visible: 1,
        };
        broadcast({ type: 'article_created', payload: { article: newArticle } });
        send(res, newArticle, 201);
    }));

    PUT('/api/articles/:id', requireAuth(async (req, res) => {
        const id = parseInt(req.params.id);
        const { title, content, category } = await json(req);
        if (validateFields(res, { title, content, category })) return;
        const existing = dbModule.query('SELECT id FROM articles WHERE id = ?', [id]);
        if (!existing) {
            sendError(res, 404, 'Article not found');
            return;
        }
        const now = new Date().toISOString();
        dbModule.exec(
            'UPDATE articles SET title = ?, content = ?, category = ?, updateTime = ? WHERE id = ?',
            [title, content, category || '未分类', now, id]
        );
        broadcast({ type: 'article_updated', payload: { id, title, content, category, updateTime: now } });
        send(res, { success: true });
    }));

    DELETE('/api/articles/:id', requireAuth(async (req, res) => {
        const id = parseInt(req.params.id);
        const existing = dbModule.query('SELECT id FROM articles WHERE id = ?', [id]);
        if (!existing) {
            sendError(res, 404, 'Article not found');
            return;
        }
        dbModule.exec('DELETE FROM articles WHERE id = ?', [id]);
        broadcast({ type: 'article_deleted', payload: { id } });
        send(res, { success: true });
    }));

    PUT('/api/articles/:id/visibility', requireAuth(async (req, res) => {
        const id = parseInt(req.params.id);
        const { visible } = await json(req);
        const existing = dbModule.query('SELECT id FROM articles WHERE id = ?', [id]);
        if (!existing) {
            sendError(res, 404, 'Article not found');
            return;
        }
        dbModule.exec('UPDATE articles SET visible = ? WHERE id = ?', [visible ? 1 : 0, id]);
        broadcast({ type: 'visibility_changed', payload: { articleId: id, visible: !!visible } });
        send(res, { success: true });
    }));
}

module.exports = { registerArticleRoutes };