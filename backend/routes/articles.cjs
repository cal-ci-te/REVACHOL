// ！文章 CRUD 路由
// 文章的增删改查与可见性控制，每次写操作后经 WebSocket 广播，通知所有客户端刷新。
// 写操作一律经 requireAuth 包装（仅持有效 Token 的管理员可执行），并在写库前校验输入长度。
const { send, sendError, json } = require('../enhance.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { validate } = require('../validate.cjs');
const { requireAuth } = require('../auth.cjs');

// 校验输入长度，不合规时直接回写 400
// 返回 true 表示已处理：调用方据此提前 return，避免继续写库
function validateFields(res, fields) {
    const err = validate(fields);
    if (err) {
        sendError(res, 400, err.error);
        return true;
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
        // category 缺省补「默认分类」：前端未选择分类时不应写入空值
        dbModule.run(
            'INSERT INTO articles (title, content, category, updateTime, visible) VALUES (?, ?, ?, ?, 1)',
            [title, content, category || '默认分类', now]
        );
        // 取回自增 id 以便广播中携带完整对象，避免客户端再拉一次列表
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
        // 先确认存在再更新：否则会把不存在的 id 当作成功返回
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
        // 布尔值落库前转为 0/1：SQLite 无布尔类型
        dbModule.exec('UPDATE articles SET visible = ? WHERE id = ?', [visible ? 1 : 0, id]);
        // 广播时转回布尔，保持与前端约定的类型一致
        broadcast({ type: 'visibility_changed', payload: { articleId: id, visible: !!visible } });
        send(res, { success: true });
    }));
}

module.exports = { registerArticleRoutes };