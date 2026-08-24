// CrewAI Web Dashboard 组件。
// 以 ComponentManager 标准组件形态接入：init 准备服务，mount 渲染 DOM + 订阅
// EventBus（CREW_*），unmount 清理 WebSocket 与订阅。页面状态统一存放在 AppState.crew。
import { AppState } from '../core/app-state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { ApiClient } from '../services/api-client.js';
import { CrewService } from '../services/crew-service.js';
import { Utils } from '../utils.js';

const STATUS_META = {
  idle: { icon: '⏸', label: '空闲' },
  waiting: { icon: '⏳', label: '等待' },
  running: { icon: '▶', label: '执行中' },
  done: { icon: '✅', label: '完成' },
  failed: { icon: '❌', label: '失败' },
};

function getCrewState() {
  return AppState.get('crew') || {};
}

function patchCrew(patchFn) {
  const current = getCrewState();
  const next = patchFn(JSON.parse(JSON.stringify(current)));
  AppState.commit(MUTATIONS.SET_CREW_STATE, next);
}

function formatTime(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return date.toLocaleTimeString('zh-CN', { hour12: false });
}

function createComponent() {
  let root = null;
  let listeners = [];
  let wsPillTimer = null;

  function on(eventName, callback) {
    EventBus.on(eventName, callback);
    listeners.push({ eventName, callback });
  }

  function render() {
    if (!root) return;
    const state = getCrewState();
    const isLoggedIn = !!AppState.get('isLoggedIn');

    // 状态徽标
    const pill = root.querySelector('#crewStatusPill');
    if (pill) {
      pill.textContent = state.running ? '运行中' : '空闲';
      pill.className = `crew-status-pill ${state.running ? 'running' : 'idle'}`;
    }
    const enginePill = root.querySelector('#crewEnginePill');
    if (enginePill) {
      enginePill.textContent = `引擎: ${state.engine === 'crew' ? 'Crew' : 'Flow'}`;
      enginePill.className = `crew-engine-pill ${state.engine === 'crew' ? 'crew' : 'flow'}`;
    }
    const wsPill = root.querySelector('#crewWsPill');
    if (wsPill) {
      wsPill.textContent = CrewService.isConnected ? 'WebSocket 已连接' : 'WebSocket 未连接';
      wsPill.className = `crew-ws-pill ${CrewService.isConnected ? 'connected' : 'disconnected'}`;
    }

    renderAuth(state, isLoggedIn);
    renderAgents(state);
    renderLogs(state);
    renderOutputs(state);
    renderStats(state);
  }

  function renderAuth(state, isLoggedIn) {
    const authPanel = root.querySelector('#crewAuthPanel');
    const runForm = root.querySelector('#crewRunForm');
    const runBtn = root.querySelector('#crewRunBtn');
    const stopBtn = root.querySelector('#crewStopBtn');
    if (!authPanel || !runForm) return;

    const loginBox = root.querySelector('#crewLoginBox');
    const userBox = root.querySelector('#crewUserBox');
    const userName = root.querySelector('#crewUserName');

    if (isLoggedIn) {
      authPanel.hidden = true;
      if (loginBox) loginBox.hidden = true;
      if (userBox) userBox.hidden = false;
      if (userName) userName.textContent = localStorage.getItem('user_role') || 'admin';
      runForm.hidden = false;
      if (runBtn) {
        runBtn.disabled = !!state.running;
        runBtn.textContent = state.running ? '任务执行中...' : '▶ 开始任务';
      }
      if (stopBtn) stopBtn.hidden = !state.running;
      const requirement = root.querySelector('#crewRequirement');
      if (requirement && !state.running) requirement.disabled = false;
      if (requirement && state.running) requirement.disabled = true;
    } else {
      authPanel.hidden = false;
      if (loginBox) loginBox.hidden = false;
      if (userBox) userBox.hidden = true;
      runForm.hidden = true;
      if (stopBtn) stopBtn.hidden = true;
    }
  }

  function renderAgents(state) {
    const container = root.querySelector('#crewAgents');
    if (!container) return;
    const agents = Array.isArray(state.agents) && state.agents.length > 0
      ? state.agents
      : [
          { id: 'planner', name: 'Planner', status: 'idle', task: '', detail: '' },
          { id: 'text_processor', name: 'Text Processor', status: 'idle', task: '', detail: '' },
          { id: 'coder', name: 'Coder', status: 'idle', task: '', detail: '' },
          { id: 'reviewer', name: 'Reviewer', status: 'idle', task: '', detail: '' },
          { id: 'document_admin', name: 'Document Admin', status: 'idle', task: '', detail: '' },
        ];

    container.innerHTML = agents.map((agent) => {
      const meta = STATUS_META[agent.status] || STATUS_META.idle;
      const safeName = Utils.escapeHtml(agent.name || agent.id || 'Agent');
      const safeTask = Utils.escapeHtml(agent.task || '');
      const safeDetail = Utils.escapeHtml(agent.detail || '');
      return `
        <article class="crew-agent-card status-${agent.status || 'idle'}">
          <div class="crew-agent-icon">${meta.icon}</div>
          <div class="crew-agent-body">
            <h3>${safeName}</h3>
            <p class="crew-agent-task">${safeTask || '等待任务'}</p>
            <p class="crew-agent-detail">${safeDetail}</p>
            <span class="crew-agent-status-label">${meta.label}</span>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderLogs(state) {
    const stream = root.querySelector('#crewLogStream');
    if (!stream) return;
    const logs = Array.isArray(state.logs) ? state.logs : [];
    if (logs.length === 0) {
      stream.innerHTML = '<div class="crew-log-empty">等待执行日志...</div>';
      return;
    }
    const html = logs.map((log) => {
      const level = log.level || 'info';
      const time = formatTime(log.timestamp);
      const message = Utils.escapeHtml(String(log.message || ''));
      return `<div class="crew-log-line level-${level}">
        <span class="crew-log-time">${time}</span>
        <span class="crew-log-message">${message}</span>
      </div>`;
    }).join('');
    stream.innerHTML = html;
    stream.scrollTop = stream.scrollHeight;
  }

  function renderOutputs(state) {
    const container = root.querySelector('#crewOutputList');
    if (!container) return;
    const outputs = Array.isArray(state.outputs) ? state.outputs : [];
    if (outputs.length === 0) {
      container.innerHTML = '<div class="crew-log-empty">暂无输出</div>';
      return;
    }
    container.innerHTML = outputs.map((output, index) => {
      const time = formatTime(output.timestamp);
      const task = Utils.escapeHtml(output.task || `输出 ${index + 1}`);
      const content = Utils.escapeHtml(String(output.content || ''));
      return `<details class="crew-output-item" ${index === outputs.length - 1 ? 'open' : ''}>
        <summary>${task} <span class="crew-output-time">${time}</span></summary>
        <pre>${content}</pre>
      </details>`;
    }).join('');
  }

  function renderStats(state) {
    const container = root.querySelector('#crewStats');
    if (!container) return;
    const stats = state.stats || {};
    const entries = Object.entries(stats);
    if (entries.length === 0) {
      container.innerHTML = '<p class="crew-stats-empty">Token 统计将在任务结束后显示</p>';
      return;
    }
    const total = entries.reduce((sum, [, value]) => sum + (Number(value.tokens) || 0), 0);
    const rows = entries.map(([agent, value]) => `
      <div class="crew-stat-row">
        <span class="crew-stat-agent">${Utils.escapeHtml(agent)}</span>
        ${value.model ? `<span class="crew-stat-model">${Utils.escapeHtml(value.model)}</span>` : ''}
        ${value.provider ? `<span class="crew-stat-provider">${Utils.escapeHtml(value.provider)}</span>` : ''}
        <span class="crew-stat-tokens">${Number(value.tokens) || 0} tokens</span>
      </div>
    `).join('');
    container.innerHTML = `<div class="crew-stats-header">Token 消耗（合计 ${total}）</div>${rows}`;
  }

  function showError(message) {
    const errorBox = root.querySelector('#crewFormError');
    if (!errorBox) return;
    errorBox.textContent = message;
    errorBox.hidden = false;
    setTimeout(() => { errorBox.hidden = true; }, 8000);
  }

  function bindAuthEvents() {
    const loginBtn = root.querySelector('#crewLoginBtn');
    if (!loginBtn) return;
    loginBtn.addEventListener('click', async () => {
      const username = (root.querySelector('#crewUsername') || {}).value || '';
      const password = (root.querySelector('#crewPassword') || {}).value || '';
      try {
        const data = await ApiClient.post('/api/auth/login', { username, password });
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('user_role', data.role || 'admin');
        AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
        EventBus.emit(EVENTS.AUTH_LOGGED_IN, data);
        render();
      } catch (err) {
        showError(`登录失败: ${err.message || err}`);
      }
    });

    const logoutBtn = root.querySelector('#crewLogoutBtn');
    if (!logoutBtn) return;
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('user_role');
      AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
      EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
      render();
    });
  }

  function bindRunEvents() {
    const form = root.querySelector('#crewRunForm');
    if (!form) return;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (getCrewState().running) return;

      const requirementInput = root.querySelector('#crewRequirement');
      const requirement = (requirementInput.value || '').trim();
      if (!requirement) {
        showError('请输入需求描述');
        return;
      }

      const processCheckbox = root.querySelector('input[name="process"]');
      const memoryCheckbox = root.querySelector('input[name="memory"]');
      const planningCheckbox = root.querySelector('input[name="planning"]');
      const debugCheckbox = root.querySelector('input[name="debug"]');
      const dryRunCheckbox = root.querySelector('input[name="dryRun"]');
      const noOutputFilesCheckbox = root.querySelector('input[name="noOutputFiles"]');

      const payload = {
        // RFC-001：Dashboard 固定使用 Flow 引擎（dry-run 与正常运行一致）
        engine: 'flow',
        requirement,
        process: processCheckbox && processCheckbox.checked ? 'hierarchical' : 'sequential',
        memory: !!(memoryCheckbox && memoryCheckbox.checked),
        planning: !!(planningCheckbox && planningCheckbox.checked),
        debug: !!(debugCheckbox && debugCheckbox.checked),
        dryRun: !!(dryRunCheckbox && dryRunCheckbox.checked),
        noOutputFiles: !!(noOutputFilesCheckbox && noOutputFilesCheckbox.checked),
      };

      const runBtn = root.querySelector('#crewRunBtn');
      if (runBtn) runBtn.disabled = true;
      try {
        await CrewService.startRun(payload);
      } catch (err) {
        showError(`启动失败: ${err.message || err}`);
        if (runBtn) runBtn.disabled = false;
      }
    });

    const stopBtn = root.querySelector('#crewStopBtn');
    if (!stopBtn) return;
    stopBtn.addEventListener('click', async () => {
      try {
        await CrewService.stopRun();
      } catch (err) {
        showError(`停止失败: ${err.message || err}`);
      }
    });
  }

  function bindEventListeners() {
    on(EVENTS.CREW_STATUS_LOADED, (payload) => {
      AppState.commit(MUTATIONS.SET_CREW_STATE, payload);
      render();
    });

    on(EVENTS.CREW_STARTED, (payload) => {
      patchCrew((state) => {
        state.running = true;
        if (payload.runId) state.runId = payload.runId;
        if (payload.requirement) state.requirement = payload.requirement;
        if (payload.process) state.process = payload.process;
        if (payload.engine) state.engine = payload.engine;
        state.dryRun = !!payload.dryRun;
        state.startedAt = payload.startedAt || state.startedAt;
        state.finishedAt = null;
        state.lastError = null;
        state.outputs = [];
        return state;
      });
      render();
    });

    on(EVENTS.CREW_AGENT_STATUS, (payload) => {
      patchCrew((state) => {
        if (!Array.isArray(state.agents)) state.agents = [];
        const target = state.agents.find((a) => a.name === payload.agent || a.id === payload.agent);
        if (target) {
          target.status = payload.status || target.status;
          if (payload.task) target.task = payload.task;
          if (payload.detail) target.detail = payload.detail;
        } else {
          state.agents.push({
            id: payload.agent,
            name: payload.agent,
            status: payload.status || 'idle',
            task: payload.task || '',
            detail: payload.detail || '',
          });
        }
        return state;
      });
      render();
    });

    on(EVENTS.CREW_LOG, (payload) => {
      patchCrew((state) => {
        if (!Array.isArray(state.logs)) state.logs = [];
        state.logs.push({
          timestamp: payload.timestamp || new Date().toISOString(),
          level: payload.level || 'info',
          message: payload.message || '',
        });
        if (state.logs.length > 500) state.logs = state.logs.slice(-500);
        return state;
      });
      render();
    });

    on(EVENTS.CREW_OUTPUT, (payload) => {
      patchCrew((state) => {
        if (!Array.isArray(state.outputs)) state.outputs = [];
        state.outputs.push({
          timestamp: payload.timestamp || new Date().toISOString(),
          task: payload.task || '',
          content: payload.content || '',
          isJson: !!payload.isJson,
        });
        if (state.outputs.length > 100) state.outputs = state.outputs.slice(-100);
        return state;
      });
      render();
    });

    on(EVENTS.CREW_STATS, (payload) => {
      patchCrew((state) => {
        if (!state.stats) state.stats = {};
        state.stats[payload.agent] = {
          tokens: Number(payload.tokens) || 0,
          cost: Number(payload.cost) || 0,
        };
        return state;
      });
      render();
    });

    on(EVENTS.CREW_FINISHED, (payload) => {
      patchCrew((state) => {
        state.running = false;
        state.finishedAt = payload.finishedAt || new Date().toISOString();
        state.lastError = payload.error || null;
        return state;
      });
      render();
    });

    on(EVENTS.CREW_STOPPED, (payload) => {
      patchCrew((state) => {
        state.running = false;
        state.finishedAt = payload.finishedAt || new Date().toISOString();
        state.lastError = '任务已停止';
        return state;
      });
      render();
    });

    on(EVENTS.CREW_FLOW_STAGED, (payload) => {
      // RFC-001 D4：Flow 任务进入暂存区，自动通知人工
      patchCrew((state) => {
        if (!Array.isArray(state.logs)) state.logs = [];
        state.logs.push({
          timestamp: new Date().toISOString(),
          level: 'warning',
          message: `[FLOW_STAGED] 任务 ${payload.taskId || ''} 已进入暂存区（${payload.stagingArea || ''}），等待人工处理`,
        });
        if (state.logs.length > 500) state.logs = state.logs.slice(-500);
        return state;
      });
      render();
      showError('⚠️ Flow 任务已进入暂存区，等待人工处理');
    });

    on(EVENTS.CREW_ERROR, (payload) => {
      showError(payload.message || 'Crew 服务错误');
    });
  }

  function cleanupListeners() {
    listeners.forEach(({ eventName, callback }) => EventBus.off(eventName, callback));
    listeners = [];
  }

  const component = {
    name: 'crew-dashboard',

    config: {
      dependencies: [],
      desktopOnly: false,
      requiresAuth: false,
      initTimeout: 15000,
      mountTimeout: 10000,
      unmountTimeout: 5000,
    },

    init: async function () {
      console.log('[crew-dashboard] init: 准备 CrewService');
      return CrewService;
    },

    mount: async function (instance) {
      root = document.getElementById('crewDashboardRoot');
      if (!root) {
        console.error('[crew-dashboard] 未找到 #crewDashboardRoot 容器');
        return instance;
      }

      root.innerHTML = `
        <div class="crew-dashboard">
          <header class="crew-header">
            <div class="crew-header-titles">
              <h1>REVACHOL Crew Dashboard</h1>
              <p>Flow: Planner → TextProcessor → Coder → Reviewer ↺ → Merging / Staging · RFC-001</p>
            </div>
            <div class="crew-header-status">
              <span class="crew-engine-pill flow" id="crewEnginePill">引擎: Flow</span>
              <span class="crew-status-pill idle" id="crewStatusPill">空闲</span>
              <span class="crew-ws-pill disconnected" id="crewWsPill">WebSocket 未连接</span>
            </div>
          </header>

          <section class="crew-auth" id="crewAuthPanel">
            <div class="crew-login-box" id="crewLoginBox">
              <h2>管理员登录</h2>
              <div class="crew-login-fields">
                <input type="text" id="crewUsername" placeholder="用户名" value="admin" autocomplete="username">
                <input type="password" id="crewPassword" placeholder="密码" autocomplete="current-password">
                <button type="button" id="crewLoginBtn">登录</button>
              </div>
            </div>
            <div class="crew-user-box" id="crewUserBox" hidden>
              <span>已登录：<b id="crewUserName">admin</b></span>
              <button type="button" id="crewLogoutBtn">退出登录</button>
            </div>
          </section>

          <section class="crew-controls">
            <form id="crewRunForm">
              <textarea id="crewRequirement" rows="3" required placeholder="请输入需求描述，例如：为贴纸系统新增旋转功能"></textarea>
              <div class="crew-options">
                <span class="crew-options-note">Flow 引擎：process / memory / planning 不适用</span>
                <label><input type="checkbox" name="debug"> debug</label>
                <label><input type="checkbox" name="dryRun"> dry-run</label>
                <label><input type="checkbox" name="noOutputFiles"> 不写 output/</label>
              </div>
              <div class="crew-controls-actions">
                <button type="submit" id="crewRunBtn">▶ 开始任务</button>
                <button type="button" id="crewStopBtn" hidden>⏹ 停止任务</button>
              </div>
              <p class="crew-form-error" id="crewFormError" hidden></p>
            </form>
          </section>

          <section class="crew-agents" id="crewAgents"></section>

          <div class="crew-columns">
            <section class="crew-log-panel">
              <h2>实时日志</h2>
              <div class="crew-log-stream" id="crewLogStream"></div>
            </section>
            <section class="crew-output-panel">
              <h2>执行回放</h2>
              <div class="crew-output-list" id="crewOutputList"></div>
            </section>
          </div>

          <section class="crew-stats" id="crewStats"></section>

          <section class="crew-usage-section" id="crewUsageContainer"></section>
        </div>
      `;

      bindAuthEvents();
      bindRunEvents();
      bindEventListeners();

      // 首次渲染（使用 AppState 默认状态 / 历史快照）
      render();

      // 连接 WebSocket + 拉取后端状态快照
      if (instance && typeof instance.init === 'function') {
        instance.init();
      }

      // WebSocket 连接状态小圆点定时刷新
      wsPillTimer = setInterval(() => {
        const wsPill = root.querySelector('#crewWsPill');
        if (wsPill) {
          wsPill.textContent = CrewService.isConnected ? 'WebSocket 已连接' : 'WebSocket 未连接';
          wsPill.className = `crew-ws-pill ${CrewService.isConnected ? 'connected' : 'disconnected'}`;
        }
      }, 3000);

      console.log('[crew-dashboard] mount: 已渲染并订阅 CREW_* 事件');
      return instance;
    },

    unmount: async function (instance) {
      cleanupListeners();
      if (wsPillTimer) {
        clearInterval(wsPillTimer);
        wsPillTimer = null;
      }
      if (instance && typeof instance.destroy === 'function') {
        instance.destroy();
      }
      if (root) {
        root.innerHTML = '';
        root = null;
      }
      console.log('[crew-dashboard] unmount: 已清理');
      return instance;
    },
  };

  return component;
}

export const crewDashboardComponent = createComponent();
export default crewDashboardComponent;
