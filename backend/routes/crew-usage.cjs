// CrewAI Token 消耗仪表盘后端路由。
//
// 数据来源：crew:stats NDJSON 事件 → crew.cjs 写入 crew_usage 表。
// 本模块提供总览 / 时间线 / Agent 排行 / Model 排行 / 筛选选项五个只读 API。
// 路由统一由 server.cjs 通过 registerCrewUsageRoutes(GET) 注册。
const { send, sendError } = require('../enhance.cjs');
const db = require('../db.cjs');

// GET /api/crew/usage/overview - 总览统计
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

// GET /api/crew/usage/timeline - 时间序列数据
function getTimeline(req, res) {
  try {
    const { startDate, endDate, agent, model, provider, groupBy } = req.query || {};

    let groupBySql = "DATE(created_at)";
    if (groupBy === 'month') groupBySql = "strftime('%Y-%m', created_at)";
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
    const params = [];
    if (startDate) { sql += ' AND DATE(created_at) >= DATE(?)'; params.push(startDate); }
    if (endDate) { sql += ' AND DATE(created_at) <= DATE(?)'; params.push(endDate); }
    if (agent) { sql += ' AND agent = ?'; params.push(agent); }
    if (model) { sql += ' AND model = ?'; params.push(model); }
    if (provider) { sql += ' AND provider = ?'; params.push(provider); }
    sql += ' GROUP BY period, agent ORDER BY period ASC';

    const rows = db.queryAll(sql, params) || [];

    // 转换为前端图表需要的格式
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

// GET /api/crew/usage/agents - Agent 排行
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

// GET /api/crew/usage/models - Model 排行
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

// GET /api/crew/usage/filters - 获取可用筛选值
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
