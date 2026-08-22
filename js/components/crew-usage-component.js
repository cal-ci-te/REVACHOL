// CrewAI Token 消耗仪表盘组件。
// 以 ComponentManager 标准组件形态接入：init 准备服务，mount 渲染 DOM + 订阅
// EventBus（CREW_STATS / CREW_FINISHED），unmount 清理图表与订阅。
// 图表优先使用全局 Chart.js；未加载时降级为纯 CSS 柱状图，两者均支持点击下钻。
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { CrewUsageService } from '../services/crew-usage-service.js';
import { Utils } from '../utils.js';

const CHART_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#9C27B0'];

function createComponent() {
  let root = null;
  let chart = null;
  let listeners = [];

  const state = {
    overview: null,
    timeline: null,
    timelineRows: [],
    agents: [],
    models: [],
    filters: { agents: [], models: [], providers: [] },
    selectedFilters: { agent: '', model: '', provider: '', groupBy: 'day' },
    dateRange: { startDate: '', endDate: '' },
    drillDown: null, // { period, rows }
    loading: false,
    error: null,
  };

  function on(eventName, callback) {
    EventBus.on(eventName, callback);
    listeners.push({ eventName, callback });
  }

  function cleanupListeners() {
    listeners.forEach(({ eventName, callback }) => EventBus.off(eventName, callback));
    listeners = [];
  }

  async function loadFilters() {
    try {
      state.filters = await CrewUsageService.getFilterOptions();
    } catch (err) {
      console.warn('[CrewUsage] 加载筛选选项失败:', err);
    }
  }

  async function loadData(silent = false) {
    if (state.loading) return;
    if (!silent) state.loading = true;

    try {
      const [overview, timeline, agents, models] = await Promise.all([
        CrewUsageService.getOverview(),
        CrewUsageService.getTimeline({
          groupBy: state.selectedFilters.groupBy,
          agent: state.selectedFilters.agent,
          model: state.selectedFilters.model,
          provider: state.selectedFilters.provider,
          startDate: state.dateRange.startDate,
          endDate: state.dateRange.endDate,
        }),
        CrewUsageService.getAgentRanking(),
        CrewUsageService.getModelRanking(),
      ]);

      state.overview = overview;
      state.timeline = timeline;
      state.agents = Array.isArray(agents) ? agents : [];
      state.models = Array.isArray(models) ? models : [];
      state.error = null;
      state.drillDown = null;

      render();
      renderChart();
    } catch (err) {
      state.error = err.message || String(err);
      render();
    } finally {
      state.loading = false;
    }
  }

  function formatNumber(num) {
    const value = Number(num) || 0;
    if (value >= 1000000) return (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return (value / 1000).toFixed(1) + 'K';
    return value.toString();
  }

  function buildDrillRows(period) {
    const timeline = state.timeline || { periods: [], series: [] };
    const index = timeline.periods.indexOf(period);
    if (index === -1) return [];
    return timeline.series
      .map((s) => ({ agent: s.name, tokens: Number(s.data[index]) || 0 }))
      .filter((r) => r.tokens > 0)
      .sort((a, b) => b.tokens - a.tokens);
  }

  function drillTo(period) {
    state.drillDown = { period, rows: buildDrillRows(period) };
    renderDrillDown();
  }

  function render() {
    if (!root) return;
    root.innerHTML = buildHTML();
    bindDOMEvents();
  }

  function buildHTML() {
    const { overview, loading, error, selectedFilters, filters } = state;
    const totalTokens = overview?.totalTokens || 0;
    const totalCost = Number(overview?.totalCost || 0);
    const totalRuns = overview?.totalRuns || 0;
    const totalAgents = overview?.totalAgents || 0;

    return `
      <div class="crew-usage-dashboard">
        <div class="usage-header">
          <h3>📊 Token 消耗仪表盘</h3>
          <div class="usage-controls">
            <div class="filter-group">
              <select data-filter="agent">
                <option value="">全部 Agent</option>
                ${(filters.agents || []).map((a) =>
                  `<option value="${Utils.escapeHtml(a)}" ${selectedFilters.agent === a ? 'selected' : ''}>${Utils.escapeHtml(a)}</option>`
                ).join('')}
              </select>
              <select data-filter="model">
                <option value="">全部 Model</option>
                ${(filters.models || []).map((m) =>
                  `<option value="${Utils.escapeHtml(m)}" ${selectedFilters.model === m ? 'selected' : ''}>${Utils.escapeHtml(m)}</option>`
                ).join('')}
              </select>
              <select data-filter="provider">
                <option value="">全部 Provider</option>
                ${(filters.providers || []).map((p) =>
                  `<option value="${Utils.escapeHtml(p)}" ${selectedFilters.provider === p ? 'selected' : ''}>${Utils.escapeHtml(p)}</option>`
                ).join('')}
              </select>
              <select data-filter="groupBy">
                <option value="day" ${selectedFilters.groupBy === 'day' ? 'selected' : ''}>日</option>
                <option value="month" ${selectedFilters.groupBy === 'month' ? 'selected' : ''}>月</option>
                <option value="total" ${selectedFilters.groupBy === 'total' ? 'selected' : ''}>总消耗</option>
              </select>
            </div>
            <button class="btn-refresh" data-action="refresh">🔄 刷新</button>
          </div>
        </div>

        ${loading ? '<div class="usage-loading">加载中...</div>' : ''}
        ${error ? `<div class="usage-error">❌ ${Utils.escapeHtml(error)}</div>` : ''}

        <div class="usage-stats-grid">
          <div class="stat-card">
            <span class="stat-label">总消耗 Token</span>
            <span class="stat-value">${formatNumber(totalTokens)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">总费用</span>
            <span class="stat-value">$${totalCost.toFixed(4)}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">执行次数</span>
            <span class="stat-value">${totalRuns}</span>
          </div>
          <div class="stat-card">
            <span class="stat-label">活跃 Agent</span>
            <span class="stat-value">${totalAgents}</span>
          </div>
        </div>

        <div class="usage-chart-container">
          <canvas id="usageChart"></canvas>
          <div id="usageSimpleChart"></div>
        </div>

        <div class="usage-drilldown" id="usageDrillDown"></div>

        <div class="usage-rankings">
          <div class="agent-ranking">
            <h4>Agent 消耗排行</h4>
            <ul>
              ${(state.agents || []).map((a) => {
                const max = (state.agents[0]?.totalTokens) || 1;
                const width = Math.max(2, Math.round((Number(a.totalTokens) / max) * 100));
                return `
                  <li>
                    <span class="rank-name">${Utils.escapeHtml(a.agent)}</span>
                    <span class="rank-bar" style="width:${width}%"></span>
                    <span class="rank-value">${formatNumber(a.totalTokens)}</span>
                  </li>
                `;
              }).join('')}
            </ul>
          </div>
          <div class="model-ranking">
            <h4>Model 消耗排行</h4>
            <ul>
              ${(state.models || []).map((m) => `
                <li>
                  <span class="rank-name">${Utils.escapeHtml(m.model)}</span>
                  <span class="rank-provider">(${Utils.escapeHtml(m.provider || '')})</span>
                  <span class="rank-value">${formatNumber(m.totalTokens)}</span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>
      </div>
    `;
  }

  function renderChart() {
    if (!root) return;
    const canvas = root.querySelector('#usageChart');
    const simpleContainer = root.querySelector('#usageSimpleChart');
    if (!canvas || !simpleContainer) return;

    const { periods, series } = state.timeline || { periods: [], series: [] };
    simpleContainer.innerHTML = '';

    if (typeof window.Chart === 'undefined') {
      canvas.style.display = 'none';
      simpleContainer.style.display = 'block';
      renderSimpleChart(simpleContainer, periods, series);
      return;
    }

    canvas.style.display = 'block';
    simpleContainer.style.display = 'none';
    const ctx = canvas.getContext('2d');
    if (chart) chart.destroy();

    const datasets = series.map((s, i) => ({
      label: s.name,
      data: s.data,
      backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + '80',
      borderColor: CHART_COLORS[i % CHART_COLORS.length],
      borderWidth: 1,
    }));

    chart = new window.Chart(ctx, {
      type: 'bar',
      data: { labels: periods, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: {
            callbacks: {
              label(context) {
                return `${context.dataset.label}: ${context.raw.toLocaleString()} tokens`;
              },
            },
          },
        },
        scales: {
          x: { stacked: false },
          y: {
            stacked: false,
            ticks: {
              callback(value) { return value.toLocaleString(); },
            },
          },
        },
        onClick(event, elements) {
          if (!elements || elements.length === 0) return;
          const index = elements[0].index;
          const period = periods[index];
          if (period) drillTo(period);
        },
      },
    });
  }

  function renderSimpleChart(container, periods, series) {
    const maxVal = Math.max(...series.flatMap((s) => s.data), 1);
    let html = '<div class="simple-chart">';
    html += '<div class="chart-labels">' + periods.map((p) => `<span>${Utils.escapeHtml(String(p))}</span>`).join('') + '</div>';
    series.forEach((s, i) => {
      html += `<div class="chart-row">`;
      html += `<span class="chart-row-label">${Utils.escapeHtml(s.name)}</span>`;
      s.data.forEach((v, idx) => {
        const pct = Math.round((v / maxVal) * 100);
        html += `<div class="chart-bar-wrap" data-period="${Utils.escapeHtml(String(periods[idx]))}" title="${Utils.escapeHtml(String(periods[idx]))}: ${v} tokens">
          <div class="chart-bar" style="height:${Math.max(pct, v > 0 ? 2 : 0)}%;background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
        </div>`;
      });
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('[data-period]').forEach((el) => {
      el.addEventListener('click', () => drillTo(el.dataset.period));
    });
  }

  function renderDrillDown() {
    const container = root && root.querySelector('#usageDrillDown');
    if (!container) return;
    if (!state.drillDown) {
      container.innerHTML = '';
      return;
    }
    const { period, rows } = state.drillDown;
    const rowHtml = rows.length === 0
      ? '<p class="usage-drill-empty">该时段无 Token 消耗数据</p>'
      : rows.map((r) => `
          <li>
            <span class="rank-name">${Utils.escapeHtml(r.agent)}</span>
            <span class="rank-bar" style="width:${Math.max(2, Math.round((r.tokens / (rows[0]?.tokens || 1)) * 100))}%"></span>
            <span class="rank-value">${formatNumber(r.tokens)} tokens</span>
          </li>
        `).join('');
    container.innerHTML = `
      <div class="usage-drill-header">
        <span>🔍 下钻：${Utils.escapeHtml(String(period))}</span>
        <button type="button" data-action="close-drill">✕ 关闭</button>
      </div>
      <ul>${rowHtml}</ul>
    `;
    const closeBtn = container.querySelector('[data-action="close-drill"]');
    if (closeBtn) closeBtn.addEventListener('click', () => {
      state.drillDown = null;
      renderDrillDown();
    });
  }

  function bindDOMEvents() {
    if (!root) return;

    root.querySelectorAll('[data-filter]').forEach((el) => {
      el.addEventListener('change', (e) => {
        const key = e.target.dataset.filter;
        state.selectedFilters[key] = e.target.value;
        loadData();
      });
    });

    const refreshBtn = root.querySelector('[data-action="refresh"]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        CrewUsageService.clearCache();
        loadData();
      });
    }
  }

  const component = {
    name: 'crew-usage',

    config: {
      dependencies: [],
      desktopOnly: false,
      requiresAuth: false,
      initTimeout: 15000,
      mountTimeout: 10000,
      unmountTimeout: 5000,
    },

    init: async function () {
      console.log('[CrewUsage] init: 准备 CrewUsageService');
      await loadFilters();
      return {};
    },

    mount: async function (instance) {
      root = document.getElementById('crewUsageContainer');
      if (!root) {
        console.error('[CrewUsage] 未找到 #crewUsageContainer 容器');
        return instance;
      }

      on(EVENTS.CREW_STATS, () => {
        loadData(true);
      });
      on(EVENTS.CREW_FINISHED, () => {
        CrewUsageService.clearCache();
        loadData(true);
      });

      render();
      await loadData();
      console.log('[CrewUsage] mount: 已渲染并订阅 CREW_* 事件');
      return instance;
    },

    unmount: async function (instance) {
      cleanupListeners();
      if (chart) {
        chart.destroy();
        chart = null;
      }
      if (root) {
        root.innerHTML = '';
        root = null;
      }
      console.log('[CrewUsage] unmount: 已清理');
      return instance;
    },
  };

  return component;
}

export const crewUsageComponent = createComponent();
export default crewUsageComponent;
