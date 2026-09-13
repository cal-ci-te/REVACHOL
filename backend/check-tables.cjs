// ！数据表清单检查（孤儿调试脚本）
// 直接读取项目根的 revachol.db，列出 sqlite_master 中登记的全部表名。
// 不经后端服务即可运行，便于库文件异常时脱离应用单独核对表结构。
// 全仓无任何引用，保留仅作排查参考：如需清理可整体删除，不影响任何功能。
const initSqlJs = require('sql.js');
const fs = require('fs');

(async () => {
    const SQL = await initSqlJs();
    // 按相对路径读库，需在项目根目录下执行，否则定位不到 revachol.db
    const data = fs.readFileSync('revachol.db');
    const db = new SQL.Database(data);
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
    console.log('Tables:', result[0]?.values || []);
    db.close();
})();