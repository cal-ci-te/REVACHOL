// ！管理员种子脚本
// 首次部署时创建 admin 账户，可重复执行而不产生重复账户。
// 幂等由 INSERT OR IGNORE 保证：同名账户已存在时静默跳过。
//
// 用法：node backend/scripts/seed-admin.js
// 环境变量：ADMIN_PASSWORD（可选，默认 admin123）
const db = require('../db.cjs');
const bcrypt = require('bcrypt');

async function seedAdmin() {
    await db.initDb();

    // 未设置环境变量时回退默认密码，与 server.cjs 的登录逻辑保持同一取值
    const plain = process.env.ADMIN_PASSWORD || 'admin123';

    // saltRounds=10 为安全与性能的平衡点
    // 待办：后续可换用更强的哈希算法，届时需同步把 server.cjs 中的密码校验改为 bcrypt.compare
    const hashed = await bcrypt.hash(plain, 10);

    // 用 run() 而非 exec()：run() 内部已包装 BEGIN/COMMIT 事务并触发 scheduleSave
    const result = db.run(
        `INSERT OR IGNORE INTO users (username, password, role, created_at)
         VALUES ('admin', ?, 'admin', datetime('now'))`,
        [hashed]
    );

    if (result.changes > 0) {
        console.log('✅ 管理员账户已创建');
    } else {
        console.log('ℹ️ 管理员账户已存在，跳过创建');
    }
}

seedAdmin().catch((err) => {
    console.error('❌ 种子脚本执行失败:', err);
    process.exit(1);
});
