// ！SQLite 数据访问层
// 基于 sql.js（编译为 WASM 的纯 JS SQLite），开发机无需安装数据库服务，部署时单文件即完整库。
// 已知限制：WASM 在 Windows 下 BLOB 序列化偶发损坏，故贴图改为文件系统存储（image_path），
// decos 表的 image_data 列仅为兼容旧数据迁移而保留。
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'revachol.db');
let db = null;
let dbInitialized = false;

// 保存节流：把多个并发写入合并为一次 db.export()，避免 "no transaction is active" 冲突
// 默认 5000ms，可用环境变量 DB_SAVE_INTERVAL 覆盖
const SAVE_INTERVAL = parseInt(process.env.DB_SAVE_INTERVAL) || 5000;
let pendingSave = false;
let saveTimer = null;

// 安排一次延迟保存
// 重复调用会重置计时器：连续写入只在最后一次之后落盘，实现合并
function scheduleSave() {
  pendingSave = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, SAVE_INTERVAL);
}

// 立即执行待处理的保存
// 先清计时器再判 pendingSave，避免与 scheduleSave 的重置竞争
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (!pendingSave) return;
  const start = Date.now();
  saveDb();
  pendingSave = false;
  console.log('[DB] 批量保存完成，耗时:', Date.now() - start, 'ms');
}

// 初始化数据库并建表
// 幂等：已初始化则直接返回同一实例，避免重复读盘与重复建表
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

        // 建表统一用 IF NOT EXISTS，使初始化可安全重复执行
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

        // 用户表：为后续多角色认证预留（当前仅 admin 种子用户）
        db.run(`CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            role        TEXT    NOT NULL DEFAULT 'user',
            created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
        )`);

        // Token 用量仪表盘数据表
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
        // 五个索引分别对应仪表盘的筛选维度（run/agent/model/provider）与时间轴
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_run_id ON crew_usage(run_id)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_agent ON crew_usage(agent)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_model ON crew_usage(model)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_provider ON crew_usage(provider)');
        db.run('CREATE INDEX IF NOT EXISTS idx_crew_usage_created_at ON crew_usage(created_at)');

        // 图标包：icon_pack_icons 只存图标 key 与 MIME，文件本体在存储适配器
        db.run(`CREATE TABLE IF NOT EXISTS icon_packs (
            id TEXT PRIMARY KEY,                -- iconpack_{ts}_{rand}
            name TEXT NOT NULL,
            themes TEXT NOT NULL DEFAULT '[]',  -- JSON 数组
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS icon_pack_icons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pack_id TEXT NOT NULL,
            icon_key TEXT NOT NULL,
            file_key TEXT NOT NULL,             -- 存储适配器中的文件名/key
            mime TEXT NOT NULL,                 -- image/png | image/svg+xml
            UNIQUE(pack_id, icon_key)
        )`);
        db.run('CREATE INDEX IF NOT EXISTS idx_icon_pack_icons_pack ON icon_pack_icons(pack_id)');

        // 补列用 try-catch 包住：列已存在时 ALTER 会抛错，此处按「已迁移」处理
        try {
            db.run(`ALTER TABLE decos ADD COLUMN image_path TEXT`);
            console.log('✅ 已添加 image_path 列');
        } catch (e) {
            console.log('ℹ️ image_path 列已存在');
        }

        // 为多角色扩展预留 author_id，存量文章默认归属管理员 id=1
        try {
            db.run(`ALTER TABLE articles ADD COLUMN author_id INTEGER DEFAULT 1`);
            console.log('✅ 已添加 author_id 列');
        } catch (e) {
            console.log('ℹ️ author_id 列已存在');
        }

        saveDb();
        dbInitialized = true;
        console.log('✅ SQLite 数据库初始化完成');
        // 启动时打印草稿行数，便于排查草稿相关的异常
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

// 导出内存库并写盘
// 写后复查文件大小：不一致说明落盘不完整，便于尽早暴露磁盘或权限问题
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

// 把 ? 占位符替换为转义后的字面量
// sql.js 不直接支持参数绑定，故在 JS 层做转义；字符串中的单引号按 SQL 规则双写
function escapeSql(sql, params) {
    let idx = 0;
    return sql.replace(/\?/g, () => {
        const val = params[idx++];
        if (val === null || val === undefined) return 'NULL';
        if (typeof val === 'number') return String(val);
        return "'" + String(val).replace(/'/g, "''") + "'";
    });
}

// 执行写语句（INSERT/UPDATE/DELETE）
// 显式 BEGIN/COMMIT：确保 sql.js 的 export 能捕获变更，绕开 WASM 层的变更追踪缺陷
function run(sql, params = []) {
    if (!db) throw new Error('数据库未初始化');
    const escapedSql = escapeSql(sql, params);
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
        // 取不到自增 id 时按 0 返回，由调用方判断可用性
    }
    console.log('[DB] lastInsertRowid:', lastId);
    return { lastInsertRowid: lastId };
}

// 查询单行，无结果返回 null
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
        // BLOB 列返回 Uint8Array，统一转成 Buffer 便于调用方处理
        row[col] = val instanceof Uint8Array ? Buffer.from(val) : val;
    });
    return row;
}

// 查询多行，无结果返回空数组
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

// 执行语句并返回受影响行数
// 与 run 的区别：不包事务、不取自增 id，供 UPDATE/DELETE 使用
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
    } catch (e) {
        // 取不到变更数时按 0 处理
    }
    return { changes };
}

// 关闭数据库连接
function closeDb() {
    if (db) {
        try { db.close(); console.log('✅ 数据库连接已关闭'); }
        catch (err) { console.warn('⚠️ 关闭数据库时出错:', err.message); }
    }
}

// 进程退出前强制刷盘：避免 5 秒节流窗口内的写入随进程结束而丢失
process.on('beforeExit', () => flushSave());
process.on('exit', () => closeDb());
process.on('SIGINT', () => { flushSave(); closeDb(); process.exit(0); });

module.exports = {
    initDb,
    getDb: () => db,
    // 手动立即保存（flushSave），不等待节流计时器
    save: flushSave,
    saveDb,
    run,
    query,
    queryAll,
    exec,
    closeDb,
};
