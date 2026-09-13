// ！CrewAI 用量仪表盘路由
// 提供 Token 用量仪表盘的五个只读接口：总览、时间线、Agent 排行、Model 排行与筛选选项。
// 数据来源：crew:stats 的 NDJSON 事件经 crew.cjs 写入 crew_usage 表，本模块只读。
// 路由统一由 server.cjs 通过 registerCrewUsageRoutes(GET) 注册。
const { send, sendError } = require('../enhance.cjs');
const db = require('../db.cjs');

// 总览统计（GET /api/crew/usage/overview）
// 全部字段走 COALESCE：空表时返回 0 而非 null，前端无需再做空值分支
function getOverview(req, res) {
  try {
    const row = db.query(`
      SELECT
        COALESCE(SUM(total_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(DISTINCT run_id) AS totalRuns,
        COUNT(DISTINCT agent) AS totalAgents,
        COUNT(DISTINCT model) AS totalModels
      FROM crew_usage
    `);
    send(res, row || { totalTokens: 0, totalCost: 0, totalRuns: 0, totalAgents: 0, totalModels: 0 });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// 时间序列数据（GET /api/crew/usage/timeline）
// 分组粒度由 groupBy 决定：day 按天、month 按月、total 汇总为单一区间
function getTimeline(req, res) {
  try {
    const { startDate, endDate, agent, model, provider, groupBy } = req.query || {};

    let groupBySql = "DATE(created_at)";
    if (groupBy === 'month') groupBySql = "strftime('%Y-%m', created_at)";
    // total 用字面量常量分组，使所有记录落入同一区间
    if (groupBy === 'total') groupBySql = "'total'";

    let sql = `
      SELECT
        ${groupBySql} AS period,
        agent,
        COALESCE(SUM(total_tokens), 0) AS tokens,
        COALESCE(SUM(cost), 0) AS cost
      FROM crew_usage
      WHERE 1=1
    `;
    // 以 WHERE 1=1 起头，使各可选条件都能以 AND 追加，无需判断是否首个条件
    const params = [];
    if (startDate) { sql += ' AND DATE(created_at) >= DATE(?)'; params.push(startDate); }
    if (endDate) { sql += ' AND DATE(created_at) <= DATE(?)'; params.push(endDate); }
    if (agent) { sql += ' AND agent = ?'; params.push(agent); }
    if (model) { sql += ' AND model = ?'; params.push(model); }
    if (provider) { sql += ' AND provider = ?'; params.push(provider); }
    sql += ' GROUP BY period, agent ORDER BY period ASC';

    const rows = db.queryAll(sql, params) || [];

    // 转成前端图表所需形态：横轴为时间区间，每个 Agent 一条序列
    // 缺失区间补 0，保证各序列长度一致、与 periods 对齐
    const periods = [...new Set(rows.map(r => r.period))];
    const agents = [...new Set(rows.map(r => r.agent))];
    const series = agents.map(agentName => ({
      name: agentName,
      data: periods.map(period => {
        const found = rows.find(r => r.period === period && r.agent === agentName);
        return found ? Number(found.tokens) || 0 : 0;
      }),
    }));

    send(res, { periods, series });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// Agent 排行（GET /api/crew/usage/agents）
function getAgentRanking(req, res) {
  try {
    const rows = db.queryAll(`
      SELECT
        agent,
        COALESCE(SUM(total_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS executions
      FROM crew_usage
      GROUP BY agent
      ORDER BY totalTokens DESC
    `) || [];
    send(res, rows);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// Model 排行（GET /api/crew/usage/models）
// 按 model 与 provider 联合分组：同名模型可能来自不同供应商，需分别统计
function getModelRanking(req, res) {
  try {
    const rows = db.queryAll(`
      SELECT
        model,
        provider,
        COALESCE(SUM(total_tokens), 0) AS totalTokens,
        COALESCE(SUM(cost), 0) AS totalCost,
        COUNT(*) AS executions
      FROM crew_usage
      GROUP BY model, provider
      ORDER BY totalTokens DESC
    `) || [];
    send(res, rows);
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

// 可用筛选值（GET /api/crew/usage/filters）
// 供前端填充下拉选项，取当前表中实际出现过的值
function getFilterOptions(req, res) {
  try {
    const agentRows = db.queryAll('SELECT DISTINCT agent FROM crew_usage ORDER BY agent') || [];
    const modelRows = db.queryAll('SELECT DISTINCT model, provider FROM crew_usage ORDER BY model') || [];
    const providerRows = db.queryAll('SELECT DISTINCT provider FROM crew_usage ORDER BY provider') || [];
    send(res, {
      agents: agentRows.map(r => r.agent),
      models: modelRows.map(r => r.model),
      providers: providerRows.map(r => r.provider),
    });
  } catch (err) {
    sendError(res, 500, err.message);
  }
}

function registerCrewUsageRoutes(GET) {
  GET('/api/crew/usage/overview', getOverview);
  GET('/api/crew/usage/timeline', getTimeline);
  GET('/api/crew/usage/agents', getAgentRanking);
  GET('/api/crew/usage/models', getModelRanking);
  GET('/api/crew/usage/filters', getFilterOptions);
}

module.exports = { registerCrewUsageRoutes };
