// CrewAI Web Dashboard 后端路由。
//
// 职责：
//   1. 通过 child_process.spawn() 调用 my_first_crew/run_revachol_crew.py
//      （--once --json-logs 无头模式），单次执行一个需求后退出；
//   2. 解析 Python 输出的 NDJSON 事件流（crew:*），翻译为 WebSocket 广播的
//      CREW_* 事件，推送给所有连接的 Web Dashboard 客户端；
//   3. 提供 status / run / stop 三个 API，run 与 stop 需要管理员 Token。
//
// 约束：
//   - 不修改 Agent 定义、Task 链路与 document_admin 的 Git MCP；
//   - 同一时间只允许一个 Crew 子进程运行（并发冲突返回 409）；
//   - 后端持有最近一次运行的内存快照（agents/logs/outputs/stats），
//     页面刷新后可通过 GET /api/crew/status 恢复现场。
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { send, sendError, json } = require('../enhance.cjs');
const { broadcast } = require('../websocket.cjs');
const { requireAuth } = require('../auth.cjs');

// Crew 目录定位：
// 本地开发时 backend/routes → ../../my_first_crew 正确；
// Docker compose 将 host ./backend 挂载为容器 /app，因此 ../../my_first_crew
// 会解析到 /my_first_crew（错误），必须通过 CREW_DIR 显式指定 /app/my_first_crew。
const CREW_DIR = process.env.CREW_DIR || path.resolve(__dirname, '../../my_first_crew');
const CREW_SCRIPT = path.join(CREW_DIR, 'run_revachol_crew.py');

const MAX_LOGS = 500;
const MAX_OUTPUTS = 100;

// 与 ui/agent_panel.py 对齐的四 Agent 显示名
const AGENT_IDS = ['planner', 'coder', 'reviewer', 'document_admin'];
const AGENT_DISPLAY_NAMES = {
  planner: 'Planner',
  coder: 'Coder',
  reviewer: 'Reviewer',
  document_admin: 'Document Admin',
};

function createInitialAgents() {
  return AGENT_IDS.reduce((acc, id) => {
    acc[id] = {
      id,
      name: AGENT_DISPLAY_NAMES[id],
      status: 'idle',
      task: '',
      detail: '',
    };
    return acc;
  }, {});
}

// 单例运行状态：后端只允许一个 Crew 子进程同时运行
const runState = {
  running: false,
  runId: null,
  requirement: '',
  process: 'sequential',
  memory: false,
  planning: false,
  debug: false,
  dryRun: false,
  startedAt: null,
  finishedAt: null,
  child: null,
  agents: createInitialAgents(),
  logs: [],
  outputs: [],
  stats: {},
  lastError: null,
};

function snapshotState() {
  return {
    running: runState.running,
    runId: runState.runId,
    requirement: runState.requirement,
    process: runState.process,
    memory: runState.memory,
    planning: runState.planning,
    debug: runState.debug,
    dryRun: runState.dryRun,
    startedAt: runState.startedAt,
    finishedAt: runState.finishedAt,
    agents: Object.values(runState.agents),
    logs: runState.logs.slice(-MAX_LOGS),
    outputs: runState.outputs.slice(-MAX_OUTPUTS),
    stats: runState.stats,
    lastError: runState.lastError,
  };
}

function pushLog(level, message) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message: String(message).slice(0, 4000),
  };
  runState.logs.push(entry);
  if (runState.logs.length > MAX_LOGS) {
    runState.logs = runState.logs.slice(-MAX_LOGS);
  }
  broadcast({
    type: 'CREW_LOG',
    payload: { runId: runState.runId, ...entry },
  });
}

function updateAgentStatus(agentName, status, task = '', detail = '') {
  const entry = Object.values(runState.agents).find((a) => a.name === agentName)
    || Object.values(runState.agents).find((a) => a.id === agentName);

  if (entry) {
    entry.status = status;
    if (task) entry.task = task;
    if (detail) entry.detail = detail;
  }
  broadcast({
    type: 'CREW_AGENT_STATUS',
    payload: {
      runId: runState.runId,
      agent: agentName,
      status,
      task,
      detail,
    },
  });
}

function updateStats(agentName, tokens, cost) {
  runState.stats[agentName] = {
    tokens: Number(tokens) || 0,
    cost: Number(cost) || 0,
  };
  broadcast({
    type: 'CREW_STATS',
    payload: {
      runId: runState.runId,
      agent: agentName,
      tokens: Number(tokens) || 0,
      cost: Number(cost) || 0,
    },
  });
}

function pushOutput(task, content, isJson) {
  const entry = {
    timestamp: new Date().toISOString(),
    task: task || '',
    content: String(content || '').slice(0, 8000),
    isJson: !!isJson,
  };
  runState.outputs.push(entry);
  if (runState.outputs.length > MAX_OUTPUTS) {
    runState.outputs = runState.outputs.slice(-MAX_OUTPUTS);
  }
  broadcast({ type: 'CREW_OUTPUT', payload: { runId: runState.runId, ...entry } });
}

/**
 * 解析 Python --json-logs 模式输出的一行事件。
 * 返回 false 表示该行不是有效的 crew:* JSON 事件。
 */
function handleCrewEvent(line) {
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return false;
  }

  const type = data && data.type;
  const payload = (data && data.payload) || {};
  if (!type || !String(type).startsWith('crew:')) return false;

  switch (type) {
    case 'crew:started':
      runState.requirement = payload.requirement || runState.requirement;
      runState.process = payload.process || runState.process;
      runState.memory = !!payload.memory;
      runState.planning = !!payload.planning;
      broadcast({
        type: 'CREW_STARTED',
        payload: {
          runId: runState.runId,
          requirement: runState.requirement,
          process: runState.process,
          memory: runState.memory,
          planning: runState.planning,
          startedAt: runState.startedAt,
        },
      });
      break;
    case 'crew:log':
      pushLog(payload.level || 'info', payload.message || '');
      break;
    case 'crew:agent-status':
      updateAgentStatus(
        payload.agent || '',
        payload.status || 'idle',
        payload.task || '',
        payload.detail || ''
      );
      break;
    case 'crew:task':
      broadcast({
        type: 'CREW_TASK',
        payload: { runId: runState.runId, task: payload.task || '' },
      });
      break;
    case 'crew:output':
      pushOutput(payload.task || '', payload.content || '', payload.isJson);
      break;
    case 'crew:stats':
      updateStats(payload.agent || '', payload.tokens || 0, payload.cost || 0);
      break;
    case 'crew:finished': {
      const success = payload.success !== false;
      const error = payload.error || null;
      runState.finishedAt = new Date().toISOString();
      runState.lastError = error;
      runState.running = false;
      broadcast({
        type: 'CREW_FINISHED',
        payload: { runId: runState.runId, success, error, finishedAt: runState.finishedAt },
      });
      break;
    }
    default:
      // 未知 crew:* 事件：降级为日志，不中断
      pushLog('info', `[crew] 未知事件 ${type}: ${JSON.stringify(payload)}`);
  }
  return true;
}

function resolvePython() {
  if (process.env.CREW_PYTHON) return process.env.CREW_PYTHON;

  const isWindows = process.platform === 'win32';
  const venvCandidates = isWindows
    ? [path.join(CREW_DIR, '.venv', 'Scripts', 'python.exe')]
    : [path.join(CREW_DIR, '.venv', 'bin', 'python')];

  for (const candidate of venvCandidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* 尝试下一个 */ }
  }

  return process.env.PYTHON || (isWindows ? 'python' : 'python3');
}

function startCrewRun({ requirement, process: crewProcess = 'sequential', memory = false, planning = false, debug = false, noOutputFiles = false, dryRun = false }) {
  const runId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  runState.running = true;
  runState.runId = runId;
  runState.requirement = requirement;
  runState.process = crewProcess;
  runState.memory = !!memory;
  runState.planning = !!planning;
  runState.debug = !!debug;
  runState.dryRun = !!dryRun;
  runState.startedAt = new Date().toISOString();
  runState.finishedAt = null;
  runState.lastError = null;
  runState.agents = createInitialAgents();
  runState.outputs = [];

  const args = [
    CREW_SCRIPT,
    '--once',
    '--json-logs',
    '--requirement',
    requirement,
  ];
  if (crewProcess === 'hierarchical') args.push('--process', 'hierarchical');
  if (memory) args.push('--memory');
  if (planning) args.push('--planning');
  if (debug) args.push('--debug');
  if (noOutputFiles) args.push('--no-output-files');
  if (dryRun) args.push('--dry-run');

  const pythonBin = resolvePython();
  console.log(`[Crew] 启动子进程: ${pythonBin} ${args.join(' ')}`);

  let child;
  try {
    child = spawn(pythonBin, args, {
      cwd: CREW_DIR,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        CREWAI_DISABLE_ASYNC: '1',
        HTTPX_USE_SYNC: '1',
      },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    runState.running = false;
    runState.lastError = `无法启动 Python 子进程: ${err.message}`;
    pushLog('error', runState.lastError);
    broadcast({
      type: 'CREW_FINISHED',
      payload: { runId, success: false, error: runState.lastError, finishedAt: new Date().toISOString() },
    });
    return null;
  }

  runState.child = child;

  let stdoutBuffer = '';
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newlineIndex;
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) !== -1) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1);
      if (!line) continue;
      if (!handleCrewEvent(line)) {
        // 非 JSON 行（CrewAI/LiteLLM 直接 print 的内容）降级为 raw 日志
        pushLog('raw', line);
      }
    }
  });
  child.stdout.on('end', () => {
    const rest = stdoutBuffer.trim();
    if (rest && !handleCrewEvent(rest)) pushLog('raw', rest);
    stdoutBuffer = '';
  });

  child.stderr.on('data', (chunk) => {
    const text = chunk.toString('utf8').trim();
    if (!text) return;
    // stderr 通常是 Python logging / LiteLLM / MCP 输出，统一进日志流
    pushLog('stderr', text);
  });

  child.on('error', (err) => {
    runState.running = false;
    runState.lastError = `Crew 子进程错误: ${err.message}`;
    pushLog('error', runState.lastError);
    broadcast({
      type: 'CREW_FINISHED',
      payload: { runId, success: false, error: runState.lastError, finishedAt: new Date().toISOString() },
    });
  });

  child.on('close', (code) => {
    runState.child = null;
    // Python 已发 crew:finished 时 finishedAt 非空，这里只收尾；
    // 未发则按退出码兜底，确保前端一定能收到结束事件。
    if (!runState.finishedAt && runState.runId === runId) {
      const success = code === 0;
      runState.finishedAt = new Date().toISOString();
      runState.lastError = success ? null : `Crew 子进程退出，code=${code}`;
      runState.running = false;
      broadcast({
        type: 'CREW_FINISHED',
        payload: {
          runId,
          success,
          error: runState.lastError,
          finishedAt: runState.finishedAt,
        },
      });
    }
    console.log(`[Crew] 子进程退出 code=${code}`);
  });

  return child;
}

function stopCrewRun() {
  const child = runState.child;
  if (!child) return false;

  runState.running = false;
  runState.finishedAt = new Date().toISOString();
  runState.lastError = '已被管理员手动停止';
  try {
    child.kill('SIGTERM');
  } catch { /* 已退出则忽略 */ }
  broadcast({
    type: 'CREW_STOPPED',
    payload: { runId: runState.runId, finishedAt: runState.finishedAt },
  });
  broadcast({
    type: 'CREW_FINISHED',
    payload: { runId: runState.runId, success: false, error: runState.lastError, finishedAt: runState.finishedAt },
  });
  runState.child = null;
  return true;
}

function registerCrewRoutes(GET, POST) {
  // 运行状态（无需登录：仪表盘可展示当前是否忙碌；触发才需管理员）
  GET('/api/crew/status', async (req, res) => {
    send(res, snapshotState());
  });

  // 触发一轮 Crew 任务（需管理员）
  POST('/api/crew/run', requireAuth(async (req, res) => {
    if (runState.running) {
      sendError(res, 409, 'Crew 任务正在运行中，请等待完成或先停止', 'CREW_BUSY');
      return;
    }

    const body = await json(req).catch(() => ({}));
    const requirement = String(body.requirement || '').trim();
    if (!requirement) {
      sendError(res, 400, 'requirement 不能为空', 'CREW_REQUIREMENT_REQUIRED');
      return;
    }
    if (requirement.length > 5000) {
      sendError(res, 400, 'requirement 过长（最多 5000 字符）', 'CREW_REQUIREMENT_TOO_LONG');
      return;
    }

    const crewProcess = body.process === 'hierarchical' ? 'hierarchical' : 'sequential';
    const dryRun = !!body.dryRun;
    const child = startCrewRun({
      requirement,
      process: crewProcess,
      memory: !!body.memory,
      planning: !!body.planning,
      debug: !!body.debug,
      noOutputFiles: !!body.noOutputFiles,
      dryRun,
    });

    if (!child) {
      sendError(res, 500, 'Crew 子进程启动失败', 'CREW_SPAWN_FAILED');
      return;
    }

    send(res, {
      runId: runState.runId,
      status: 'started',
      requirement,
      process: crewProcess,
      dryRun,
      startedAt: runState.startedAt,
    }, 202);
  }));

  // 手动停止当前任务（需管理员）
  POST('/api/crew/stop', requireAuth(async (req, res) => {
    const stopped = stopCrewRun();
    send(res, { success: stopped, stopped: stopped });
  }));
}

module.exports = { registerCrewRoutes, runState, snapshotState, stopCrewRun };
