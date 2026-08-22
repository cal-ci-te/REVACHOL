// sql.js：纯 JavaScript 的 SQLite 实现（编译为 WASM），无需系统安装 SQLite。
// 选择理由：开发机无需额外配置数据库服务，部署时一个二进制文件就是完整数据库。
// 已知限制：WASM 在 Windows 下 BLOB 序列化偶发损坏，因此贴图改为文件系统存储（image_path），
// decos 表的 image_data 列仅保留用于兼容旧数据迁移。
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'revachol.db');
let db = null;
let dbInitialized = false;

// 保存节流：多个并发写入合并为单次 db.export()，避免 "no transaction is active" 冲突。
// 默认 5000ms，可通过环境变量 DB_SAVE_INTERVAL 调整。
const SAVE_INTERVAL = parseInt(process.env.DB_SAVE_INTERVAL) || 5000;
let pendingSave = false;
let saveTimer = null;

function scheduleSave() {
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_INTERVAL);
}

function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!pendingSave) return;
  const start = Date.now();
  saveDb();
  pendingSave = false;
  console.log('[DB] 批量保存完成，耗时:', Date.now() - start, 'ms');
}

async function initDb() {
    if (dbInitialized) return db;

    try {
        const SQL = await initSqlJs({});
        let data = null;
        if (fs.existsSync(DB_PATH)) {
            data = fs.readFileSync(DB_PATH);
            console.log('[DB] 数据库文件已读取，大小:', data.length, 'bytes');
        } else {
            console.log('[DB] 数据库文件不存在，将创建新数据库');
        }
        db = new SQL.Database(data);

        db.run(`CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, content TEXT,
            category TEXT, updateTime TEXT, visible INTEGER DEFAULT 1)`);
        db.run(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)`);
        db.run(`CREATE TABLE IF NOT EXISTS decos (
            id TEXT PRIMARY KEY, name TEXT, position TEXT, style TEXT, image_data BLOB)`);
        db.run(`CREATE TABLE IF NOT EXISTS article_drafts (
            id INTEGER PRIMARY KEY AUTOINCREMENT, article_id INTEGER NOT NULL,
            title TEXT, content TEXT, category TEXT, saved_at TEXT NOT NULL,
            FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE)`);
        db.run('CREATE INDEX IF NOT EXISTS idx_drafts_article ON article_drafts(article_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_drafts_saved_at ON article_drafts(saved_at)');

        // 用户表：为三模式认证预留（当前仅 admin 种子用户）
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'user',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )`);

        // Token 消耗仪表盘数据表
        db.run(`CREATE TABLE IF NOT EXISTS crew_usage (
            id                 INTEGER PRIMARY KEY AUTOINCREMENT,
            run_id             TEXT    NOT NULL,
            agent              TEXT    NOT NULL,
            model              TEXT    NOT NULL DEFAULT 'unknown',
            provider           TEXT    NOT NULL DEFAULT 'unknown',
            prompt_tokens      INTEGER DEFAULT 0,
            completion_tokens  INTEGER DEFAULT 0,
            total_tokens       INTEGER DEFAULT 0,
            cost               REAL    DEFAULT 0.0,
            created_at         DATETIME DEFAULT CURRENT_TIMESTAMP
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_run_id ON crew_usage(run_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_agent ON crew_usage(agent)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_model ON crew_usage(model)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_provider ON crew_usage(provider)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_created_at ON crew_usage(created_at)');

        try {
            db.run(`ALTER TABLE decos ADD COLUMN image_path TEXT`);
            console.log('✅ 已添加 image_path 列');
        } catch (e) {
            console.log('ℹ️ image_path 列已存在');
        }

        // 迁移：为三模式扩展预留 author_id 字段（现有文章默认归属于管理员 id=1）
        try {
            db.run(`ALTER TABLE articles ADD COLUMN author_id INTEGER DEFAULT 1`);
            console.log('✅ 已添加 author_id 列');
        } catch (e) {
            console.log('ℹ️ author_id 列已存在');
        }

        saveDb();
        dbInitialized = true;
        console.log('✅ SQLite 数据库初始化完成');
        try {
          const count = db.exec('SELECT COUNT(*) as c FROM article_drafts');
          if (count && count[0] && count[0].values) {
            console.log('[DB] article_drafts 表行数:', count[0].values[0][0]);
          }
        } catch (e) {
          console.warn('[DB] article_drafts 表检查失败:', e.message);
        }
        return db;
    } catch (err) {
        console.error('[DB] 初始化失败:', err);
        throw err;
    }
}

function saveDb() {
    if (!db) { console.warn('[DB] saveDb 被调用但 db 为空'); return; }
    try {
        const data = db.export();
        console.log('[DB] 导出数据大小:', data.length, 'bytes, 写入:', path.resolve(DB_PATH));
        fs.writeFileSync(DB_PATH, Buffer.from(data));
        const stat = fs.statSync(DB_PATH);
        console.log('[DB] 写入后文件大小:', stat.size, 'bytes',
          stat.size === data.length ? '✓' : '✗ 大小不匹配');
    } catch (err) {
        console.error('[DB] 保存失败:', err);
        throw err;
    }
}
function escapeSql(sql, params) {
    let idx = 0;
    return sql.replace(/\?/g, () => {
        const val = params[idx++];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    });
}

function run(sql, params = []) {
    if (!db) throw new Error('数据库未初始化');
    const escapedSql = escapeSql(sql, params);
    // 显式事务确保 sql.js export 能捕获变更（绕过 WASM 层变更追踪 bug）
    db.exec('BEGIN');
    db.exec(escapedSql);
    db.exec('COMMIT');
    console.log('[DB] INSERT committed, 当前总行数:',
      db.exec('SELECT COUNT(*) as c FROM article_drafts')[0]?.values?.[0]?.[0]);
    scheduleSave();
    let lastId = 0;
    try {
        const rows = db.exec('SELECT last_insert_rowid()');
        if (rows && rows.length > 0 && rows[0].values && rows[0].values[0]) {
            lastId = rows[0].values[0][0];
        }
    } catch (e) {
        /* fallback */
    }
    console.log('[DB] lastInsertRowid:', lastId);
    return { lastInsertRowid: lastId };
}

function query(sql, params = []) {
    if (!db) throw new Error('数据库未初始化');
    const escapedSql = escapeSql(sql, params);
    const resultSet = db.exec(escapedSql);
    if (!resultSet || resultSet.length === 0) return null;
    const rows = resultSet[0];
    if (!rows.values || rows.values.length === 0) return null;
    const row = {};
    rows.columns.forEach((col, i) => {
        const val = rows.values[0][i];
        row[col] = val instanceof Uint8Array ? Buffer.from(val) : val;
    });
    return row;
}

function queryAll(sql, params = []) {
    if (!db) throw new Error('数据库未初始化');
    const escapedSql = escapeSql(sql, params);
    const resultSet = db.exec(escapedSql);
    if (!resultSet || resultSet.length === 0) return [];
    const rows = resultSet[0];
    const results = [];
    for (let i = 0; i < rows.values.length; i++) {
        const row = {};
        rows.columns.forEach((col, j) => {
            const val = rows.values[i][j];
            row[col] = val instanceof Uint8Array ? Buffer.from(val) : val;
        });
        results.push(row);
    }
    return results;
}

function exec(sql, params = []) {
    if (!db) throw new Error('数据库未初始化');
    const escapedSql = escapeSql(sql, params);
    db.exec(escapedSql);
    scheduleSave();
    let changes = 0;
    try {
        const rows = db.exec('SELECT changes()');
        if (rows && rows.length > 0 && rows[0].values && rows[0].values[0]) {
            changes = rows[0].values[0][0];
        }
    } catch (e) { /* ignore */ }
    return { changes };
}

function closeDb() {
    if (db) {
        try { db.close(); console.log('✅ 数据库连接已关闭'); }
        catch (err) { console.warn('⚠️ 关闭数据库时出错:', err.message); }
    }
}

// 进程退出前强制刷盘，防止 5 秒窗口内的写入丢失
process.on('beforeExit', () => flushSave());
process.on('exit', () => closeDb());
process.on('SIGINT', () => { flushSave(); closeDb(); process.exit(0); });

module.exports = {
    initDb,
    getDb: () => db,
    save: flushSave,  // 手动立即保存
    saveDb,
    run,
    query,
    queryAll,
    exec,
    closeDb,
};
