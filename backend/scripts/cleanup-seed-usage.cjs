// 清理 crew_usage 表中的种子模拟数据（seed-run-*）。
//
// 背景：v1.22 Token 仪表盘上线时使用种子数据（seed-run-1 / seed-run-2）
// 直接写入了 crew_usage 表。真实任务产生的 crew:stats 会继续写入同一张表，
// 因此仪表盘“看起来”一直显示模拟数据。
//
// 用法：
//   docker compose exec backend node /app/scripts/cleanup-seed-usage.cjs
//   node backend/scripts/cleanup-seed-usage.cjs   # 本地开发库
//
// 只删除 run_id 以 seed- 开头的行，真实任务数据不受影响。
const db = require('../db.cjs');

async function main() {
  await db.initDb();

  const before = db.queryAll("SELECT run_id FROM crew_usage WHERE run_id LIKE 'seed-%'");
  const deleted = db.run("DELETE FROM crew_usage WHERE run_id LIKE 'seed-%'");
  db.saveDb();

  console.log(`[cleanup-seed-usage] 删除种子行: ${before.length} 条（seed-run-*）`);
  if (before.length > 0) {
    for (const row of before) console.log(`  - ${row.run_id}`);
  }
  const remaining = db.queryAll('SELECT COUNT(*) AS cnt FROM crew_usage');
  console.log(`[cleanup-seed-usage] crew_usage 剩余记录: ${remaining[0] ? remaining[0].cnt : 0} 条`);

  await db.closeDb();
  process.exit(0);
}

main().catch((err) => {
  console.error('[cleanup-seed-usage] 执行失败:', err);
  process.exit(1);
});
