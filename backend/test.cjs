// ！数据库连通性自检（手工排查脚本）
// 按「加载模块 → initDb → closeDb」顺序验证后端数据库能否正常初始化，失败以非零码退出。
// 供手工排查使用，不被服务启动流程或自动化测试引用。
console.log('✅ 开始加载...');

try {
    const dbModule = require('./db.cjs');
    console.log('✅ db.cjs 加载成功');
    
    dbModule.initDb()
        .then(() => {
            console.log('✅ 数据库初始化成功');
            console.log('✅ 一切正常');
            // 先 closeDb 再延时退出：给 sql.js 留出落盘时间，避免进程被立即终止
            dbModule.closeDb();
            setTimeout(() => process.exit(0), 50);
        })
        .catch(err => {
            console.error('❌ 数据库初始化失败:', err);
            process.exit(1);
        });
} catch (err) {
    console.error('❌ 加载失败:', err);
    process.exit(1);
}