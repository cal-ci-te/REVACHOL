// tests/unit/auth.test.js
// 认证核心模块单元测试 — backend/auth.js
// @vitest-environment node

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================
// 策略：不 mock crypto，改为 mock tokenStore 来控制 Token 验证流程
// vi.mock('crypto') 对 CJS 的 require() 拦截不生效，所以直接操作真实的模块。
// generateToken 测试验证 64 字符 hex 格式（不校验具体值），
// 中间件测试通过 spyOn tokenStore 来控制行为。
// ============================================================

const authModule = await import('../../backend/auth.cjs');
const auth = authModule.default || authModule;

// ============================================================
// 工具函数：创建 mock req/res
// ============================================================

function mockReqRes(authHeader) {
  const req = {
    headers: { authorization: authHeader },
    user: undefined,
  };
  const res = {
    _status: null,
    _body: null,
    writeHead(status, headers) {
      this._status = status;
      this._headers = headers;
    },
    end(body) {
      this._body = body;
    },
  };
  return { req, res };
}

// ============================================================
// 测试套件
// ============================================================

describe('auth — generateToken', () => {

  it('应返回 64 字符十六进制字符串', () => {
    const token = auth.generateToken('admin', 'admin');
    expect(token).toHaveLength(64);
    expect(/^[0-9a-f]{64}$/.test(token)).toBe(true);
  });

  it('应将 userId 和 role 存入 tokenStore', () => {
    const token = auth.generateToken('user1', 'editor');
    const stored = auth.tokenStore.get(token);
    expect(stored).toEqual({ userId: 'user1', role: 'editor' });
  });

  it('每次生成的 Token 应不同（随机性）', () => {
    const token1 = auth.generateToken('admin', 'admin');
    const token2 = auth.generateToken('admin', 'admin');
    expect(token1).not.toBe(token2);
  });

  it('覆盖同一 Token 不应发生（每次都是新 Token）', () => {
    const token = auth.generateToken('original', 'admin');
    const stored = auth.tokenStore.get(token);
    expect(stored).toEqual({ userId: 'original', role: 'admin' });

    // 再次生成另一个 Token 不应影响前者
    const anotherToken = auth.generateToken('other', 'user');
    expect(auth.tokenStore.get(token)).toEqual({ userId: 'original', role: 'admin' });
    expect(auth.tokenStore.get(anotherToken)).toEqual({ userId: 'other', role: 'user' });
  });
});

describe('auth — verifyToken', () => {

  it('有效 Token 应返回 { userId, role }', () => {
    const token = auth.generateToken('admin', 'admin');
    const result = auth.verifyToken(token);
    expect(result).toEqual({ userId: 'admin', role: 'admin' });
  });

  it('无效 Token 应返回 undefined', () => {
    expect(auth.verifyToken('nonexistent_token')).toBeUndefined();
  });

  it('空字符串 Token 应返回 undefined', () => {
    expect(auth.verifyToken('')).toBeUndefined();
  });
});

describe('auth — revokeToken', () => {

  it('应删除有效 Token 并返回 true', () => {
    const token = auth.generateToken('admin', 'admin');
    expect(auth.revokeToken(token)).toBe(true);
    expect(auth.verifyToken(token)).toBeUndefined();
  });

  it('删除不存在的 Token 应返回 false（幂等）', () => {
    expect(auth.revokeToken('no_such_token')).toBe(false);
  });

  it('重复删除同一 Token 应返回 false（幂等）', () => {
    const token = auth.generateToken('admin', 'admin');
    auth.revokeToken(token);
    expect(auth.revokeToken(token)).toBe(false);
  });
});

// ============================================================
// 中间件测试 — 通过 spyOn tokenStore 控制行为
// ============================================================

describe('auth — requireAuth', () => {

  it('有有效 Bearer Token 时调用 handler', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const token = auth.generateToken('admin', 'admin');
    const { req, res } = mockReqRes('Bearer ' + token);

    await auth.requireAuth(handler)(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'admin', role: 'admin' });
  });

  it('无 Authorization 头时返回 401', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes(undefined);

    await auth.requireAuth(handler)(req, res);

    expect(res._status).toBe(401);
    expect(JSON.parse(res._body).error).toContain('未提供认证令牌');
    expect(handler).not.toHaveBeenCalled();
  });

  it('Authorization 头不以 Bearer 开头时返回 401', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes('Basic dXNlcjpwYXNz');

    await auth.requireAuth(handler)(req, res);

    expect(res._status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });

  it('Token 无效时返回 401', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes('Bearer invalid_token_here');

    await auth.requireAuth(handler)(req, res);

    expect(res._status).toBe(401);
    expect(JSON.parse(res._body).error).toContain('令牌无效');
    expect(handler).not.toHaveBeenCalled();
  });

  it('空字符串 Bearer Token 应返回 401', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes('Bearer ');

    await auth.requireAuth(handler)(req, res);

    expect(res._status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('auth — requireRole', () => {

  it('角色匹配时调用 handler', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const { req, res } = mockReqRes();
    req.user = { userId: 'admin', role: 'admin' };

    await auth.requireRole('admin')(handler)(req, res);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('角色不匹配时返回 403', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes();
    req.user = { userId: 'user1', role: 'user' };

    await auth.requireRole('admin')(handler)(req, res);

    expect(res._status).toBe(403);
    expect(JSON.parse(res._body).error).toContain('权限不足');
    expect(handler).not.toHaveBeenCalled();
  });

  it('req.user 不存在时返回 403', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes();

    await auth.requireRole('admin')(handler)(req, res);

    expect(res._status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});

describe('auth — optionalAuth', () => {

  it('有有效 Token 时注入 req.user，继续调用 handler', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const token = auth.generateToken('admin', 'admin');
    const { req, res } = mockReqRes('Bearer ' + token);

    await auth.optionalAuth(handler)(req, res);

    expect(req.user).toEqual({ userId: 'admin', role: 'admin' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('无 Token 时不注入 req.user，仍调用 handler', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const { req, res } = mockReqRes(undefined);

    await auth.optionalAuth(handler)(req, res);

    expect(req.user).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('Token 无效时不注入 req.user，仍调用 handler（静默忽略）', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const { req, res } = mockReqRes('Bearer bad_token');

    await auth.optionalAuth(handler)(req, res);

    expect(req.user).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(res._status).toBeNull();
  });
});

describe('auth — compose', () => {

  it('应正确组合 2 个中间件，从左到右执行', async () => {
    const order = [];
    const mw1 = (h) => async (req, res) => { order.push('mw1'); return h(req, res); };
    const mw2 = (h) => async (req, res) => { order.push('mw2'); return h(req, res); };
    const handler = () => { order.push('handler'); };

    const composed = auth.compose(mw1, mw2);
    await composed(handler)({}, {});

    expect(order).toEqual(['mw1', 'mw2', 'handler']);
  });

  it('compose 无参数时返回透传包装器', async () => {
    const handler = vi.fn();
    const composed = auth.compose();
    await composed(handler)({}, {});
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('auth — 集成：compose(requireAuth, requireRole)', () => {

  it('管理员凭据通过两层中间件，handler 被调用', async () => {
    const handler = vi.fn((req, res) => { res.end('ok'); });
    const token = auth.generateToken('admin', 'admin');
    const { req, res } = mockReqRes('Bearer ' + token);

    const adminOnly = auth.compose(auth.requireAuth, auth.requireRole('admin'));
    await adminOnly(handler)(req, res);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({ userId: 'admin', role: 'admin' });
  });

  it('非管理员角色被 requireRole 拦截，返回 403', async () => {
    const token = auth.generateToken('user1', 'user');
    const handler = vi.fn();
    const { req, res } = mockReqRes('Bearer ' + token);

    const adminOnly = auth.compose(auth.requireAuth, auth.requireRole('admin'));
    await adminOnly(handler)(req, res);

    expect(res._status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('无 Token 被 requireAuth 拦截，返回 401', async () => {
    const handler = vi.fn();
    const { req, res } = mockReqRes(undefined);

    const adminOnly = auth.compose(auth.requireAuth, auth.requireRole('admin'));
    await adminOnly(handler)(req, res);

    expect(res._status).toBe(401);
    expect(handler).not.toHaveBeenCalled();
  });
});
