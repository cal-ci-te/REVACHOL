// 基于内存 Map 的简单 Token 认证模块。不引入外部依赖（如 jsonwebtoken、bcrypt），
// 因为当前仅 admin 单一角色，JWT 的签名/过期/刷新机制在此场景属于过度设计。
// 若未来需要多角色 + Token 过期，可迁移至 JWT + Redis 方案（见文件末尾迁移注释）。
//
// [DEPLOY] Token 存储在内存 Map 中，服务器重启后所有 Token 将失效。
// 如需持久化，请将 tokenStore 替换为 Redis 实现（已预留 set/get/delete 接口，见下方 tokenStore）。

const crypto = require('crypto');

// ============================================================
// 改动 1：Token 存储抽象层 — 封装 Map 为 tokenStore 对象
// 未来替换为 Redis 时，只需重写 set/get/delete 三个方法的内部实现。
// Redis 迁移示例：
//   const redis = require('redis'); const client = redis.createClient();
//   set(key, value) → client.setEx(key, 86400, JSON.stringify(value))
//   get(key)        → JSON.parse(await client.get(key))
//   delete(key)     → client.del(key)
// ============================================================
const tokenStore = {
    _map: new Map(),

    /** 存储 Token → 用户信息映射 */
    set(key, value) {
        this._map.set(key, value);
    },

    /** 根据 Token 获取用户信息，不存在返回 undefined */
    get(key) {
        return this._map.get(key);
    },

    /** 删除 Token，成功返回 true */
    delete(key) {
        return this._map.delete(key);
    },
};

// ============================================================
// 核心 API：Token 生命周期管理
// ============================================================

/**
 * 生成随机 Token 并存入 tokenStore。
 * 使用 crypto.randomBytes 而非 Math.random()，因为后者在 V8 中不是密码学安全的随机源。
 * @param {string} userId
 * @param {string} role
 * @returns {string} 64 字符十六进制 Token
 */
function generateToken(userId, role) {
    const token = crypto.randomBytes(32).toString('hex');
    // [FUTURE] Token 过期后需要刷新机制：可增加 refreshToken 接口，
    // refreshToken 有效期 30 天，登录时一并返回，客户端在 accessToken 过期前
    // 用 refreshToken 换取新 token（同时废弃旧 token）。
    tokenStore.set(token, { userId, role });
    return token;
}

/**
 * 验证 Token 有效性。
 * @param {string} token
 * @returns {{ userId: string, role: string } | undefined}
 */
function verifyToken(token) {
    return tokenStore.get(token);
}

/**
 * 使 Token 失效（登出时调用）。
 * @param {string} token
 * @returns {boolean}
 */
function revokeToken(token) {
    return tokenStore.delete(token);
}

// ============================================================
// 改动 2：多中间件组合工具 compose
// 将多个 handler 包装器（如 requireAuth、requireRole、限流等）组合成单个包装器。
// 执行顺序与数组顺序一致（从左到右），即 compose(a, b)(handler) → a 先执行，再 b，最后 handler。
//
// 使用示例：
//   const adminOnly = compose(requireAuth, requireRole('admin'));
//   GET('/api/articles', adminOnly(createArticleHandler));
// ============================================================
function compose(...middlewares) {
    if (middlewares.length === 0) {
        return (handler) => handler;
    }
    // reduceRight 从数组末尾开始归约，保证执行时从左到右：
    // [requireAuth, requireRole] → requireAuth(requireRole(handler))
    // 调用链：requireAuth 先拦截 → 通过后进入 requireRole → 通过后到 handler
    return (handler) => middlewares.reduceRight((h, mw) => mw(h), handler);
}

// ============================================================
// 认证中间件：handler 包装器模式（不修改 enhance.cjs）
// ============================================================

/**
 * 通用鉴权包装器：从 Authorization 头提取 Bearer token，验证失败返回 401。
 * 验证成功后将用户信息注入 req.user，供后续中间件（如 requireRole）使用。
 *
 * @param {Function} handler - 原始路由处理函数 (req, res) => void
 * @returns {Function} 包装后的处理函数
 */
function requireAuth(handler) {
    return async (req, res) => {
        const authHeader = req.headers['authorization'];

        // 缺少 Authorization 头或格式不正确 → 401
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '未提供认证令牌' }));
            return;
        }

        const token = authHeader.slice(7); // 去掉 "Bearer " 前缀（7 个字符）
        const user = verifyToken(token);

        if (!user) {
            res.writeHead(401, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '令牌无效或已过期' }));
            return;
        }

        // 将用户信息挂载到 req 上，后续中间件/业务代码可通过 req.user 获取
        req.user = user;
        return handler(req, res);
    };
}

/**
 * 角色校验包装器：检查 req.user.role 是否匹配指定角色。
 * 调用方需确保在 requireRole 之前已执行 requireAuth（通过 compose 组合），
 * 否则 req.user 为 undefined 时会返回 403。
 *
 * 扩展点（三模式）：当前仅校验单个 role === 指定值。
 * 未来可改为 roleMatrix[role].includes(requiredPermission) 的权限矩阵模式。
 *
 * @param {string} role - 要求的角色名（如 'admin'）
 * @returns {Function} 包装器函数 (handler) => wrappedHandler
 */
function requireRole(role) {
    return (handler) => {
        return async (req, res) => {
            // req.user 应由 requireAuth 注入；若缺失说明未正确组合中间件
            if (!req.user || req.user.role !== role) {
                res.writeHead(403, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '权限不足，需要 ' + role + ' 角色' }));
                return;
            }
            return handler(req, res);
        };
    };
}

// ============================================================
// 改动 3：可选认证包装器 optionalAuth
// 适用于"登录用户看更多，访客也能看基础内容"的场景。
// 携带有效 Token → 注入 req.user；无 Token 或 Token 无效 → 不阻塞，req.user 为 undefined。
// 不修改 requireAuth 的行为，两者互不影响。
// ============================================================

/**
 * 可选认证包装器：验证 Token 但不强制。
 * - 有有效 Token → req.user 被注入用户信息
 * - 无 Token 或 Token 无效 → req.user 为 undefined，handler 正常执行
 *
 * 适用场景示例：
 *   GET('/api/articles', optionalAuth(handler))
 *   handler 内通过 req.user 判断是访客还是登录用户，返回不同粒度的数据。
 *
 * @param {Function} handler
 * @returns {Function}
 */
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
        // 无论如何都继续执行 handler
        return handler(req, res);
    };
}

module.exports = {
    // Token 生命周期
    generateToken,
    verifyToken,
    revokeToken,

    // 认证/授权中间件
    requireAuth,
    requireRole,
    optionalAuth,

    // 工具
    compose,

    // 导出 tokenStore 供测试和高级场景（如服务重启前的 Token 持久化）
    tokenStore,
};

// ============================================================
// 未来迁移指南（按优先级排列）
// ============================================================
//
// 1. Token 存储迁移（tokenStore → Redis）：
//    重写 tokenStore.set/get/delete 三个方法，调用 Redis client。
//    其余代码（generateToken/verifyToken/revokeToken）无需改动。
//
// 2. 用户凭据迁移（硬编码 → 数据库用户表）：
//    当前登录验证在 routes/auth.cjs 中硬编码比对 admin/admin123。
//    迁移时在 db.cjs 中新增 users 表，login 端点改为查表验证。
//    密码存储使用 bcrypt.hash/bcrypt.compare（当前因不引入依赖，用明文比对）。
//
// 3. 多角色权限矩阵（访客 / user / editor / admin）：
//    在 requireRole 中替换简单的 !== role 为权限矩阵查找。
//    示例矩阵结构：
//      const ROLE_PERMISSIONS = {
//        user:   ['read', 'write_own'],
//        editor: ['read', 'write_own', 'publish'],
//        admin:  ['read', 'write_all', 'publish', 'manage_users'],
//      };
//    中间件改为：checkPermission(requiredPermission) → 查矩阵。
//
// 4. Token 过期机制：
//    当前 Token 永不过期（服务重启即清空）。
//    在 tokenStore.set 时存储 { userId, role, expiresAt: Date.now() + TTL }，
//    在 verifyToken 时检查 expiresAt。
//    若迁移到 Redis，使用 EXPIRE 命令即可。
//
// 5. 登录失败限制（防止暴力破解）：
//    当前 POST /api/auth/login 对失败次数无记录，可被无限尝试。
//    方案一（简单）：失败后延迟 1-2 秒响应（setTimeout），不增加存储开销。
//    方案二（完整）：在 tokenStore 中记录 _loginAttempts Map<ip, {count, lastAttempt}>，
//      连续失败 5 次后锁定 15 分钟。迁移到 Redis 后可用 INCR + EXPIRE 实现。
// ============================================================
