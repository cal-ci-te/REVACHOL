// ！Agent 启停状态服务测试
// 覆盖 backend/agent-state.cjs 的初始状态、开关切换、并发写入、env 覆盖与子进程 env 注入。
// 前置：node 环境，且每个用例动态 import 以重置模块缓存（状态文件路径在加载时确定）。
// @vitest-environment node

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 被测模块在加载时读取状态文件路径，故每个用例都需重置模块缓存后重新导入，
// 否则第一个用例的临时路径会被后续用例复用
const AGENT_IDS = ['planner', 'text_processor', 'coder', 'csser', 'reviewer', 'document_admin'];

let tmpDir;
let mod;

// 清空所有 Agent 开关残留，避免宿主机环境变量污染断言
function clearAgentEnv() {
  AGENT_IDS.forEach((id) => { delete process.env['CREW_DISABLE_' + id.toUpperCase()]; });
}

async function loadModule() {
  vi.resetModules();
  const imported = await import('../../backend/agent-state.cjs');
  return imported.default || imported;
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-agent-state-'));
  process.env.CREW_AGENT_STATE_FILE = path.join(tmpDir, 'agent-state.json');
  clearAgentEnv();
  mod = await loadModule();
});

afterEach(() => {
  delete process.env.CREW_AGENT_STATE_FILE;
  clearAgentEnv();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('初始状态', () => {
  it('状态文件不存在时全部启用，revision 从 0 起', () => {
    const state = mod.getState();
    expect(state.schemaVersion).toBe(1);
    expect(state.revision).toBe(0);
    AGENT_IDS.forEach((id) => {
      expect(state.agents[id].enabled).toBe(true);
      expect(state.agents[id].lockedByEnv).toBe(false);
    });
  });

  it('状态文件损坏时回落默认值而非抛错', () => {
    fs.writeFileSync(process.env.CREW_AGENT_STATE_FILE, '{ 这不是合法 JSON', 'utf8');
    const state = mod.getState();
    AGENT_IDS.forEach((id) => expect(state.agents[id].enabled).toBe(true));
  });

  it('字段缺失时按默认值补齐，不整体丢弃已有配置', () => {
    fs.writeFileSync(
      process.env.CREW_AGENT_STATE_FILE,
      JSON.stringify({ agents: { coder: false } }),
      'utf8'
    );
    const state = mod.getState();
    expect(state.agents.coder.enabled).toBe(false);
    expect(state.agents.planner.enabled).toBe(true);
  });

  it('状态文件落在 CREW_AGENT_STATE_FILE 指定路径', () => {
    expect(mod.STATE_FILE).toBe(process.env.CREW_AGENT_STATE_FILE);
  });
});

describe('切换开关', () => {
  it('切换后持久化并递增 revision', async () => {
    const next = await mod.setAgentEnabled('csser', false);
    expect(next.revision).toBe(1);
    expect(next.agents.csser.enabled).toBe(false);

    const persisted = JSON.parse(fs.readFileSync(mod.STATE_FILE, 'utf8'));
    expect(persisted.agents.csser).toBe(false);
    expect(persisted.revision).toBe(1);
  });

  it('重新读取时保持上次切换结果', async () => {
    await mod.setAgentEnabled('reviewer', false);
    expect(mod.getState().agents.reviewer.enabled).toBe(false);
  });

  it('返回值与 GET 结构一致（前端依赖同一形状）', async () => {
    const fromToggle = await mod.setAgentEnabled('planner', false);
    const fromGet = mod.getState();
    expect(Object.keys(fromToggle.agents.planner).sort())
      .toEqual(Object.keys(fromGet.agents.planner).sort());
    expect(fromToggle.agents.planner.enabled).toBe(false);
  });

  it('未知 Agent 抛 UNKNOWN_AGENT', async () => {
    await expect(mod.setAgentEnabled('nope', true)).rejects.toMatchObject({
      code: 'AGENT_STATE_UNKNOWN_AGENT',
    });
  });

  it('enabled 非布尔抛 INVALID_BODY', async () => {
    await expect(mod.setAgentEnabled('csser', 'yes')).rejects.toMatchObject({
      code: 'AGENT_STATE_INVALID_BODY',
    });
  });

  it('baseRevision 过期抛 CONFLICT，且不写入', async () => {
    await mod.setAgentEnabled('coder', false);
    const before = fs.readFileSync(mod.STATE_FILE, 'utf8');
    await expect(mod.setAgentEnabled('coder', true, 999)).rejects.toMatchObject({
      code: 'AGENT_STATE_CONFLICT',
    });
    expect(fs.readFileSync(mod.STATE_FILE, 'utf8')).toBe(before);
  });

  it('baseRevision 匹配时允许切换', async () => {
    const first = await mod.setAgentEnabled('coder', false);
    const second = await mod.setAgentEnabled('coder', true, first.revision);
    expect(second.agents.coder.enabled).toBe(true);
  });
});

describe('并发写入', () => {
  it('并发切换不同 Agent 不丢失更新', async () => {
    await Promise.all([
      mod.setAgentEnabled('planner', false),
      mod.setAgentEnabled('coder', false),
      mod.setAgentEnabled('reviewer', false),
      mod.setAgentEnabled('document_admin', false),
    ]);
    const state = mod.getState();
    expect(state.agents.planner.enabled).toBe(false);
    expect(state.agents.coder.enabled).toBe(false);
    expect(state.agents.reviewer.enabled).toBe(false);
    expect(state.agents.document_admin.enabled).toBe(false);
    expect(state.revision).toBe(4);
  });

  it('并发切换同一 Agent 时结果为其中之一，不出现结构损坏', async () => {
    await Promise.all([
      mod.setAgentEnabled('csser', false),
      mod.setAgentEnabled('csser', true),
      mod.setAgentEnabled('csser', false),
    ]);
    const state = mod.getState();
    expect(typeof state.agents.csser.enabled).toBe('boolean');
    expect(state.revision).toBe(3);
  });

  it('保留临时文件不残留（原子写入后应清理）', async () => {
    await mod.setAgentEnabled('csser', false);
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });
});

describe('环境变量覆盖', () => {
  it('env 优先于持久化层，并标记 lockedByEnv', async () => {
    await mod.setAgentEnabled('reviewer', true);
    process.env.CREW_DISABLE_REVIEWER = '1';
    const state = mod.getState();
    expect(state.agents.reviewer.enabled).toBe(false);
    expect(state.agents.reviewer.lockedByEnv).toBe(true);
  });

  it('env 覆盖不会被写入持久化层，撤销后即恢复', async () => {
    process.env.CREW_DISABLE_REVIEWER = '1';
    const persistedRaw = fs.existsSync(mod.STATE_FILE)
      ? fs.readFileSync(mod.STATE_FILE, 'utf8')
      : '';
    // 仅读取不应产生写入
    expect(fs.existsSync(mod.STATE_FILE) ? fs.readFileSync(mod.STATE_FILE, 'utf8') : '')
      .toBe(persistedRaw);

    await mod.setAgentEnabled('coder', false);
    const persisted = JSON.parse(fs.readFileSync(mod.STATE_FILE, 'utf8'));
    expect(persisted.agents.reviewer).toBe(true);

    delete process.env.CREW_DISABLE_REVIEWER;
    expect(mod.getState().agents.reviewer.enabled).toBe(true);
  });

  it('被 env 锁定的 Agent 拒绝切换并抛 ENV_LOCKED', async () => {
    process.env.CREW_DISABLE_CSSER = '1';
    await expect(mod.setAgentEnabled('csser', false)).rejects.toMatchObject({
      code: 'AGENT_STATE_ENV_LOCKED',
    });
  });

  it('真值字面量统一：1/true/yes/on 均表示禁用', () => {
    ['1', 'true', 'yes', 'on', 'TRUE', ' 1 '].forEach((v) => {
      process.env.CREW_DISABLE_CODER = v;
      expect(mod.getState().agents.coder.enabled).toBe(false);
    });
  });

  it('假值或空值不构成禁用', () => {
    ['0', 'false', 'no', 'off', ''].forEach((v) => {
      process.env.CREW_DISABLE_CODER = v;
      expect(mod.getState().agents.coder.enabled).toBe(true);
    });
  });

  it('envKeyFor 按 AGENT_ID 大写生成变量名', () => {
    expect(mod.envKeyFor('text_processor')).toBe('CREW_DISABLE_TEXT_PROCESSOR');
    expect(mod.envKeyFor('document_admin')).toBe('CREW_DISABLE_DOCUMENT_ADMIN');
  });
});

describe('子进程环境变量注入', () => {
  it('禁用的 Agent 置 1，启用的 Agent 删除该键', async () => {
    await mod.setAgentEnabled('csser', false);
    const env = mod.buildChildEnv({ CREW_DISABLE_PLANNER: '1', PATH: '/x' });
    expect(env.CREW_DISABLE_CSSER).toBe('1');
    // 显式删除而非置 0：Python 侧约定「未设置即启用」
    expect(env.CREW_DISABLE_PLANNER).toBeUndefined();
    expect(env.PATH).toBe('/x');
  });

  it('不修改传入的基础环境对象', () => {
    const base = { CREW_DISABLE_PLANNER: '1' };
    mod.buildChildEnv(base);
    expect(base.CREW_DISABLE_PLANNER).toBe('1');
  });
});
