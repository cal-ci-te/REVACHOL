// ！站点设置路由
// 站点设置以键值对存储：GET 公开（前端需读取主题等配置），PUT 经 requireAuth 保护。
// 写入后广播 settings_updated，使已连接的多端界面即时同步。
const { send, json } = require('../enhance.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { requireAuth } = require('../auth.cjs');

function registerSettingsRoutes(GET, PUT) {

    GET('/api/settings', async (req, res) => {
        const rows = dbModule.queryAll('SELECT key, value FROM settings');
        const settings = {};
        // 逐键解析：历史数据里可能存有未序列化的裸字符串，解析失败即按原值返回
        rows.forEach(row => {
            try { settings[row.key] = JSON.parse(row.value); } catch (e) { settings[row.key] = row.value; }
        });
        send(res, settings);
    });

    PUT('/api/settings', requireAuth(async (req, res) => {
        const settings = await json(req);
        // 逐键 upsert 而非整表替换：未提交的键保持原状，避免并发写入相互覆盖
        Object.entries(settings).forEach(([key, value]) => {
            dbModule.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
        });
        broadcast({ type: 'settings_updated', payload: settings });
        send(res, { success: true });
    }));
}

module.exports = { registerSettingsRoutes };