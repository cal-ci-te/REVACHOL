// ！Agent 启停状态
// 维护六个 Agent 的启用开关，持久化到 backend/data/agent-state.json，供后端 API 与 Python 子进程共同遵循。
// 环境变量 CREW_DISABLE_<AGENT_ID> 优先于 JSON：Python 子进程只读环境变量，
// 若以 JSON 为准会出现「接口显示已启用、子进程实际跳过」的三方不一致。
const fs = require('fs');
const path = require('path');

// 锚定项目根而非 process.cwd()：服务从不同工作目录启动时，状态文件必须落在同一处
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(PROJECT_ROOT, 'backend', 'data');
// 允许通过环境变量改指状态文件：测试需隔离到临时目录，运维也可能重定向到持久卷
const STATE_FILE = process.env.CREW_AGENT_STATE_FILE
  ? path.resolve(process.env.CREW_AGENT_STATE_FILE)
  : path.join(STATE_DIR, 'agent-state.json');
const SCHEMA_VERSION = 1;

// 与 routes/crew.cjs 的 AGENT_IDS 保持一致，Python 侧 document_review_flow.py 同名单
const AGENT_IDS = ['planner', 'text_processor', 'coder', 'csser', 'reviewer', 'document_admin'];

// 禁用字面量：统一全局语义，避免「仅 1 表示禁用」与「多个真值」两种说法并存
const TRUTHY = ['1', 'true', 'yes', 'on'];

class AgentStateError extends Error {
  // code 供路由层映射 HTTP 状态码，避免路由自行猜测错误性质
  constructor(code, message) {
    super(message);
    this.name = 'AgentStateError';
    this.code = code;
  }
}

// 环境变量名与 Agent ID 的映射
function envKeyFor(agentId) {
  return 'CREW_DISABLE_' + String(agentId).toUpperCase();
}

// 解析环境变量禁用值
function isTruthy(v) {
  return TRUTHY.indexOf(String(v || '').trim().toLowerCase()) !== -1;
}

// 读取环境变量覆盖层
// 只返回被显式设置的 Agent，未设置的项留给 JSON 决定，避免默认值把已有配置冲掉
function readEnvOverrides() {
  const overrides = {};
  AGENT_IDS.forEach((id) => {
    const raw = process.env[envKeyFor(id)];
    if (raw !== undefined && raw !== '') {
      overrides[id] = !isTruthy(raw);
    }
  });
  return overrides;
}

// 构造默认状态（全部启用）
function createDefaultState() {
  const agents = {};
  AGENT_IDS.forEach((id) => { agents[id] = true; });
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    updatedAt: new Date().toISOString(),
    agents,
  };
}

// 校验并补齐状态结构
// 字段缺失或类型错误时按默认值补，而不是整体丢弃：避免一次手工编辑让全部开关回退
function normalizeState(raw) {
  const base = createDefaultState();
  if (!raw || typeof raw !== 'object') return base;
  const agents = {};
  AGENT_IDS.forEach((id) => {
    const v = raw.agents && raw.agents[id];
    agents[id] = typeof v === 'boolean' ? v : true;
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: Number.isInteger(raw.revision) && raw.revision >= 0 ? raw.revision : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : base.updatedAt,
    agents,
  };
}

// 迁移旧版本状态（当前仅 v1，保留入口以便后续扩展字段时不丢数据）
function migrateState(raw) {
  const normalized = normalizeState(raw);
  return {
    state: normalized,
    notes: [],
  };
}

// 读取持久化层（不含环境变量覆盖）
function readBase() {
  let raw = null;
  try {
    const text = fs.readFileSync(STATE_FILE, 'utf8');
    raw = JSON.parse(text);
  } catch (err) {
    // 文件不存在属首次启动的正常情形；其余读取失败按默认值处理，避免服务无法启动
    if (err.code !== 'ENOENT') {
      raw = null;
    }
  }
  return migrateState(raw).state;
}

// 读取生效状态（持久化层 + 环境变量覆盖，env 优先）
// 与持久化层分开：写入只改持久化层，避免环境变量覆盖被固化进 JSON 后无法撤销
function readState() {
  const state = readBase();
  const overrides = readEnvOverrides();
  Object.keys(overrides).forEach((id) => { state.agents[id] = overrides[id]; });
  state.envOverrides = overrides;
  return state;
}

// 原子写入：先写唯一临时文件再 rename，避免进程中断留下半截 JSON
function writeStateAtomic(state) {
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  } catch (err) {
    throw new AgentStateError('AGENT_STATE_UNAVAILABLE', '状态目录不可写: ' + err.message);
  }

  // 临时文件名含 pid 与时间戳：并发写入时不会共用同一路径而互相覆盖
  const tmp = STATE_FILE + '.' + process.pid + '.' + Date.now() + '.tmp';
  try {
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
    // fsync 尽力而为：Windows 对非写句柄会抛 EPERM，而 rename 已能防止半截写入，
    // 不应因持久化增强手段失败而让整次切换失败
    try {
      const fd = fs.openSync(tmp, 'r+');
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch (_) { /* 忽略：不影响原子性与内容完整性 */ }
    fs.renameSync(tmp, STATE_FILE);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch (_) { /* 清理失败不影响错误上报 */ }
    throw new AgentStateError('AGENT_STATE_UNAVAILABLE', '状态写入失败: ' + err.message);
  }
}

// 写入队列：单进程内串行化「读-改-写」，避免并发切换丢失更新
let writeChain = Promise.resolve();

// 将任务追加到队列尾部
function enqueue(task) {
  const next = writeChain.then(task, task);
  // 队列自身不因单个任务失败而中断
  writeChain = next.catch(() => {});
  return next;
}

// 切换单个 Agent 开关
// baseRevision 用于乐观并发：客户端携带过期的 revision 时返回冲突，避免覆盖他人刚做的修改
// 声明为 async：入参校验与队列内失败统一以 Promise 拒绝形式暴露，调用方无需同时处理同步抛出
async function setAgentEnabled(agentId, enabled, baseRevision) {
  if (AGENT_IDS.indexOf(agentId) === -1) {
    throw new AgentStateError('AGENT_STATE_UNKNOWN_AGENT', '未知 Agent: ' + agentId);
  }
  if (typeof enabled !== 'boolean') {
    throw new AgentStateError('AGENT_STATE_INVALID_BODY', 'enabled 必须为布尔值');
  }

  return enqueue(() => {
    const base = readBase();
    if (baseRevision !== undefined && baseRevision !== null && baseRevision !== base.revision) {
      throw new AgentStateError('AGENT_STATE_CONFLICT', '状态已被其他会话修改，请刷新后重试');
    }
    // 环境变量锁定的项进程内无法改写，直接拒绝而非静默无效
    if (Object.prototype.hasOwnProperty.call(readEnvOverrides(), agentId)) {
      throw new AgentStateError(
        'AGENT_STATE_ENV_LOCKED',
        'Agent 由环境变量 ' + envKeyFor(agentId) + ' 控制，请修改后重启服务'
      );
    }

    const next = JSON.parse(JSON.stringify(base));
    next.agents[agentId] = enabled;
    next.revision = base.revision + 1;
    next.updatedAt = new Date().toISOString();

    try {
      writeStateAtomic(next);
    } catch (err) {
      // 写盘失败即整体失败：不做「内存已改、磁盘未改」的部分成功
      throw err instanceof AgentStateError
        ? err
        : new AgentStateError('AGENT_STATE_UNAVAILABLE', '状态持久化失败: ' + err.message);
    }

    // 返回公共结构（与 GET 一致）：两处形状不同会让前端把已禁用的 Agent 误渲染为开启
    return getState();
  });
}

// 查询状态（含每个 Agent 最终是否生效，供前端渲染）
function getState() {
  const state = readState();
  const agents = {};
  AGENT_IDS.forEach((id) => {
    agents[id] = {
      id,
      enabled: state.agents[id] !== false,
      // 来自环境变量的项前端应只读展示，因为进程内无法改写父进程环境
      lockedByEnv: Object.prototype.hasOwnProperty.call(state.envOverrides, id),
    };
  });
  return {
    schemaVersion: state.schemaVersion,
    revision: state.revision,
    updatedAt: state.updatedAt,
    agents,
  };
}

// 生成 Python 子进程的附加环境变量
function buildChildEnv(baseEnv) {
  const state = readState();
  const env = Object.assign({}, baseEnv || process.env);
  AGENT_IDS.forEach((id) => {
    const key = envKeyFor(id);
    if (state.agents[id] === false) {
      env[key] = '1';
    } else {
      // 显式删除而非置 0：Python 侧约定「未设置即启用」
      delete env[key];
    }
  });
  return env;
}

module.exports = {
  AGENT_IDS,
  STATE_FILE,
  AgentStateError,
  envKeyFor,
  getState,
  readState,
  setAgentEnabled,
  buildChildEnv,
};
