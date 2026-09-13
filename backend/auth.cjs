// ！Token 认证
// 基于内存 Map 的 Token 认证，不引入 jsonwebtoken / bcrypt 等外部依赖。
// 自研而非 JWT：当前只有 admin 单一角色，JWT 的签名、过期与刷新机制在此场景属过度设计。
// Token 存于进程内存，服务重启即全部失效；若要持久化，替换 tokenStore 的实现即可。

const crypto = require('crypto');

// Token 存储抽象层
// 把 Map 封装为 set / get / delete 三个方法：将来换 Redis 只需重写这三处，调用方不受影响
// 例：set → client.setEx(key, 86400, JSON.stringify(value))，get → client.get(key)，delete → client.del(key)
const tokenStore = {
    _map: new Map(),

    // 存储 Token 到用户信息的映射
    set(key, value) {
        this._map.set(key, value);
    },

    // 按 Token 取用户信息，不存在返回 undefined
    get(key) {
        return this._map.get(key);
    },

    // 删除 Token，成功返回 true
    delete(key) {
        return this._map.delete(key);
    },
};

// Token 生命周期管理

// 生成随机 Token 并写入 tokenStore
// 用 crypto.randomBytes 而非 Math.random：后者在 V8 中不是密码学安全的随机源
// 待办：尚无刷新机制。可增设 refreshToken 接口（有效期 30 天，登录时一并下发），
// 客户端在 accessToken 过期前换取新 token，同时作废旧 token
function generateToken(userId, role) {
    const token = crypto.randomBytes(32).toString('hex');
    tokenStore.set(token, { userId, role });
    return token;
}

// 校验 Token，返回 { userId, role } 或 undefined
function verifyToken(token) {
    return tokenStore.get(token);
}

// 使 Token 失效，登出时调用
function revokeToken(token) {
    return tokenStore.delete(token);
}

// 中间件组合工具
// 把多个 handler 包装器（requireAuth、requireRole、限流等）合成单个包装器
// 执行顺序与数组顺序一致（从左到右）：compose(a, b)(handler) 即 a 先执行，再 b，最后 handler
// 用法：const adminOnly = compose(requireAuth, requireRole('admin'))
function compose(...middlewares) {
    if (middlewares.length === 0) {
        return (handler) => handler;
    }
    // 从末尾开始归约，使执行时呈从左到右：
    // [requireAuth, requireRole] → requireAuth(requireRole(handler))
    // 调用链：requireAuth 先拦截 → 通过后进 requireRole → 通过后到 handler
    return (handler) => middlewares.reduceRight((h, mw) => mw(h), handler);
}

// 认证中间件：采用 handler 包装器模式，不修改 enhance.cjs

// 通用鉴权包装器：从 Authorization 头取 Bearer token，校验失败返回 401
// 校验通过后把用户信息注入 req.user，供后续中间件（如 requireRole）使用
function requireAuth(handler) {
    return async (req, res) => {
        const authHeader = req.headers['authorization'];

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '未提供认证令牌' }));
            return;
        }

        // slice(7) 即去掉 "Bearer " 前缀的 7 个字符
        const token = authHeader.slice(7);
        const user = verifyToken(token);

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '令牌无效或已过期' }));
            return;
        }

        // 挂到 req.user 上，后续中间件与业务代码据此取当前用户
        req.user = user;
        return handler(req, res);
    };
}

// 角色校验包装器：检查 req.user.role 是否等于指定角色
// 调用方须保证 requireRole 之前已执行 requireAuth（用 compose 组合），
// 否则 req.user 为空会一律返回 403
// 扩展点：目前仅比对单个 role，将来可改为权限矩阵查找
function requireRole(role) {
    return (handler) => {
        return async (req, res) => {
            // req.user 应由 requireAuth 注入；缺失说明中间件未正确组合
            if (!req.user || req.user.role !== role) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '权限不足，需要 ' + role + ' 角色' }));
                return;
            }
            return handler(req, res);
        };
    };
}

// 可选认证包装器
// 用于「登录用户看到更多、访客也能看基础内容」的场景
// 携带有效 Token 则注入 req.user；无 Token 或 Token 无效则不阻塞，req.user 为 undefined
function optionalAuth(handler) {
    return async (req, res) => {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const user = verifyToken(token);
            if (user) {
                req.user = user;
            }
            // Token 无效时静默忽略，不阻塞请求
        }
        // 无论是否识别到用户都继续执行 handler
        return handler(req, res);
    };
}

module.exports = {
    // Token 生命周期
    generateToken,
    verifyToken,
    revokeToken,

    // 认证与授权中间件
    requireAuth,
    requireRole,
    optionalAuth,

    // 工具
    compose,

    // 导出 tokenStore 供测试与高级场景使用（如服务重启前持久化 Token）
    tokenStore,
};

// 后续可迁移的方向，按优先级排列
//
// 1. Token 存储迁移（tokenStore → Redis）
//    只需重写 tokenStore 的 set/get/delete，其余代码（generateToken/verifyToken/revokeToken）不动
//
// 2. 用户凭据迁移（硬编码 → 数据库用户表）
//    当前登录校验硬编码比对 admin/admin123，实现在 server.cjs 的 POST /api/auth/login
//    迁移时在 db.cjs 新增 users 表，登录端点改为查表验证，密码改用 bcrypt.hash / bcrypt.compare
//
// 3. 多角色权限矩阵（访客 / user / editor / admin）
//    在 requireRole 中把 !== role 换成矩阵查找，例如：
//      const ROLE_PERMISSIONS = {
//        user:   ['read', 'write_own'],
//        editor: ['read', 'write_own', 'publish'],
//        admin:  ['read', 'write_all', 'publish', 'manage_users'],
//      };
//    中间件相应改为 checkPermission(requiredPermission)
//
// 4. Token 过期机制
//    当前 Token 永不过期（服务重启即清空）。可在 set 时存 expiresAt: Date.now() + TTL，
//    并在 verifyToken 中检查；若已迁移到 Redis，直接用 EXPIRE 命令
//
// 5. 登录失败限制（防暴力破解）
//    当前 POST /api/auth/login 不记录失败次数，可被无限尝试
//    简单方案：失败后延迟 1–2 秒响应（setTimeout），不增加存储开销
//    完整方案：记录 _loginAttempts Map<ip, {count, lastAttempt}>，连续失败 5 次锁定 15 分钟；
//      迁移到 Redis 后可用 INCR + EXPIRE 实现
