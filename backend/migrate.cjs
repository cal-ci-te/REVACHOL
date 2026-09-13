// ！data.json 一次性迁移脚本
// 把早期的 data.json 数据导入 SQLite 库（articles / settings 两类）。
// 属一次性迁移工具：目标库会被先删除再重建，执行前请确认 data.json 已备份。
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function migrate() {
    const SQL = await initSqlJs();
    const dataPath = path.join(__dirname, 'data.json');

    // 无 data.json 即视为已迁移完毕，直接返回而不报错（便于重复执行）
    if (!fs.existsSync(dataPath)) {
        console.log('data.json 不存在，跳过迁移');
        return;
    }

    const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const DB_PATH = path.join(__dirname, 'revachol.db');

    // 删库重建而非增量导入：迁移要求结果干净可预期，避免残留旧结构
    if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
    const db = new SQL.Database();

    // 建表语句需与 db.cjs 保持一致，否则迁移产物与运行期预期结构不符
    db.run(`
        CREATE TABLE articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            content TEXT,
            category TEXT,
            updateTime TEXT,
            visible INTEGER DEFAULT 1
        )
    `);
    db.run(`
        CREATE TABLE settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    `);
    db.run(`
        CREATE TABLE decos (
            id TEXT PRIMARY KEY,
            name TEXT,
            position TEXT,
            style TEXT,
            image_data BLOB
        )
    `);
    db.run(`
        CREATE TABLE article_drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            article_id INTEGER NOT NULL,
            title TEXT,
            content TEXT,
            category TEXT,
            saved_at TEXT NOT NULL,
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
        )
    `);
    // 两个索引服务于按文章查草稿与按时间排序两种访问路径
    db.run('CREATE INDEX idx_drafts_article ON article_drafts(article_id)');
    db.run('CREATE INDEX idx_drafts_saved_at ON article_drafts(saved_at)');

    // 迁移文章：显式带入原 id，保持既有引用关系
    if (data.articles && data.articles.length > 0) {
        const stmt = db.prepare(`
            INSERT INTO articles (id, title, content, category, updateTime, visible) 
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        data.articles.forEach(a => {
            // visible 缺省按可见处理，与 db.cjs 的默认值一致
            stmt.run([a.id, a.title, a.content, a.category, a.updateTime, a.visible !== undefined ? a.visible : 1]);
        });
        stmt.free();
        console.log('✅ 迁移文章:', data.articles.length);
    }

    // 迁移设置：值以 JSON 序列化写入，与运行期读写口径一致
    if (data.settings) {
        const stmt = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');
        Object.entries(data.settings).forEach(([key, value]) => {
            stmt.run([key, JSON.stringify(value)]);
        });
        stmt.free();
        console.log('✅ 迁移设置');
    }

    const exported = db.export();
    const buffer = Buffer.from(exported);
    fs.writeFileSync(DB_PATH, buffer);
    console.log('💾 数据库已重建，大小:', buffer.length, 'bytes');
    db.close();
    console.log('🎉 迁移完成！');
}

migrate().catch(err => {
    console.error('❌ 迁移失败:', err);
});