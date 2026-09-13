// ！后端服务入口
// 组装路由、中间件与 WebSocket，并负责启动 HTTP 服务与优雅关闭。
// 路由注册集中在文件上半部分，请求分发统一在一次 match 查找中完成。
const http = require('http');
const dbModule = require('./db.cjs');
// 健康检查需要 clients 统计当前连接数，故一并引入
const { initWebSocket, clients } = require('./websocket.cjs');
const { ensureUploadDir } = require('./utils.cjs');
const { handleDecoUpload } = require('./upload.cjs');

// 认证模块：Token 的生成 / 校验 / 撤销，以及 requireAuth 包装器
const { requireAuth, generateToken, revokeToken } = require('./auth.cjs');

// 管理员凭据：优先取环境变量，未设置时回退默认值（便于开发环境直接启动）
// 生产部署应通过 .env 或 docker-compose.yml 注入 ADMIN_PASSWORD
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// 存储层：以适配器模式在本地文件系统与 S3 兼容存储之间切换，业务代码无感知
const { storage } = require('./storage/index.cjs');
console.log('[Server] 存储服务已初始化:', storage.isLocal() ? '本地' : 'RustFS');

// 自研路由层（enhance.cjs）：项目仅约 15 个端点，引入 Express 会使框架代码多于业务代码
// 若 API 增长到 50 个以上，可迁移到 Express 的控制器结构
// 健康检查需要 send 直接返回 JSON，故一并引入
const { GET, POST, PUT, DELETE, match, routes, send } = require('./enhance.cjs');

const { init } = require('@errpulse/node');
// ErrPulse 后端采集默认关闭：需启用时改为 enabled: true 并另行启动 errpulse-server
init({ serverUrl: 'http://localhost:3800', projectId: 'revachol-backend', enabled: false });

const { registerArticleRoutes } = require('./routes/articles.cjs');
const { registerDecoRoutes } = require('./routes/decos.cjs');
const { registerSettingsRoutes } = require('./routes/settings.cjs');
const { registerDraftsRoutes } = require('./routes/drafts.cjs');
const { registerCrewRoutes } = require('./routes/crew.cjs');
const { registerCrewUsageRoutes } = require('./routes/crew-usage.cjs');
const { registerIconPackRoutes } = require('./routes/icon-packs.cjs');

registerArticleRoutes(GET, POST, PUT, DELETE);
registerDecoRoutes(GET, PUT, DELETE);
registerSettingsRoutes(GET, PUT);
registerDraftsRoutes(GET, POST, PUT, DELETE);
registerCrewRoutes(GET, POST);
registerCrewUsageRoutes(GET);
registerIconPackRoutes(GET, POST, PUT, DELETE);

// 健康检查端点，供 Docker / K8s 探活
// 四项检查：数据库执行 SELECT 1、存储写入并删除临时文件、WebSocket 连接数、内存占比
// 前两项各记录延迟，便于定位是「不可用」还是「变慢」
GET('/api/health', async (req, res) => {
  const checks = {
    database: { status: 'ok', latency: 0 },
    storage: { status: 'ok', latency: 0 },
    websocket: { status: 'ok', connections: 0 },
    memory: { status: 'ok', usage: 0 },
  };

  // 数据库检查（含响应延迟）
  const dbStart = Date.now();
  try {
    dbModule.query('SELECT 1');
    checks.database.latency = Date.now() - dbStart;
  } catch (_) {
    checks.database.status = 'error';
    checks.database.latency = Date.now() - dbStart;
  }

  // 存储检查（含响应延迟）
  // 用「写入后立即删除」验证读写两端，临时文件名固定且会被清理，不留残余
  const storageStart = Date.now();
  try {
    const testFile = 'health-check.tmp';
    await storage.upload(Buffer.from('health'), testFile, 'text/plain');
    await storage.delete(testFile);
    checks.storage.latency = Date.now() - storageStart;
  } catch (_) {
    checks.storage.status = 'error';
    checks.storage.latency = Date.now() - storageStart;
  }

  checks.websocket.connections = clients ? clients.size : 0;

  // 内存使用率（heapUsed / heapTotal 百分比）
  const mem = process.memoryUsage();
  checks.memory.usage = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  const healthy = checks.database.status === 'ok' && checks.storage.status === 'ok';

  // 额外写入 X-Health-Status 响应头，便于容器编排直接解析而无需读 body
  res.setHeader('X-Health-Status', healthy ? 'healthy' : 'unhealthy');

  // 健康检查失败时上报 ErrPulse
  if (!healthy) {
    try {
      const { capture } = require('@errpulse/node');
      capture(new Error('Health check failed'), {
        level: 'critical',
        tags: { service: 'revachol-backend' },
        extra: { checks },
      });
    } catch (_) {
      // ErrPulse 未安装或不可用，静默忽略：上报失败不应影响健康检查本身的响应
    }
  }

  send(res, {
    status: healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: Math.round(process.uptime() * 100) / 100,
    checks,
  }, healthy ? 200 : 503);
});

console.log('[Server] 已注册路由 — GET:', Object.keys(routes.GET || {}),
  'POST:', Object.keys(routes.POST || {}),
  'PUT:', Object.keys(routes.PUT || {}),
  'DELETE:', Object.keys(routes.DELETE || {}));

ensureUploadDir();

// 启动 3 秒后再跑一次草稿清理：避开初始化高峰，也确保库已就绪
const { cleanExpiredDrafts, enforceDraftLimit } = require('./cleanup-drafts.cjs');
setTimeout(() => { cleanExpiredDrafts(); enforceDraftLimit(); }, 3000);

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    const pathname = parsedUrl.pathname;
    const method = req.method;
    // 预先解析查询串到 req.query，供路由层直接使用（如 /api/crew/usage/timeline?groupBy=day）
    req.query = Object.fromEntries(parsedUrl.searchParams.entries());

    // CORS：开发环境 Vite 端口 3000 与后端 9999 不同源
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    // 贴图上传需手动处理请求体（base64 JSON），不走通用 json() 解析
    // 经 requireAuth 包装：仅持有效 Token 的管理员可上传
    if (pathname === '/api/decos' && method === 'POST') {
        await requireAuth(handleDecoUpload)(req, res);
        return;
    }

    // 认证路由：登录 / 登出 / 当前用户
    // 登录比对 ADMIN_PASSWORD（环境变量，开发环境回退 admin123）
    // 待办：升级为 bcrypt 时，把明文比对替换为 bcrypt.compare(password, hash)
    if (pathname === '/api/auth/login' && method === 'POST') {
        try {
            const body = await new Promise((resolve, reject) => {
                let data = '';
                req.on('data', chunk => data += chunk);
                // 解析失败回退空对象：由下方凭据比对统一判为失败，无需单独分支
                req.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { resolve({}); } });
                req.on('error', reject);
            });
            const { username, password } = body;
            if (username === 'admin' && password === ADMIN_PASSWORD) {
                const token = generateToken('admin', 'admin');
                // 7 天，单位秒；返回给前端以便提前提示用户重新登录
                const expiresIn = 7 * 24 * 60 * 60;
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ token, userId: 'admin', role: 'admin', expiresIn }));
            } else {
                res.writeHead(401, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: '用户名或密码错误' }));
            }
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '服务器错误' }));
        }
        return;
    }

    // 登出：需携带有效 Token，成功后该 Token 失效
    // slice(7) 即去掉 "Bearer " 前缀
    if (pathname === '/api/auth/logout' && method === 'POST') {
        await requireAuth(async (req, res) => {
            const authHeader = req.headers['authorization'];
            const token = authHeader.slice(7);
            revokeToken(token);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        })(req, res);
        return;
    }

    // 当前用户信息：需携带有效 Token
    if (pathname === '/api/auth/me' && method === 'GET') {
        await requireAuth(async (req, res) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ userId: req.user.userId, role: req.user.role }));
        })(req, res);
        return;
    }

    // 兜底分发给路由表；命中则执行，未命中返回 404
    const handler = match(method, pathname);
    if (handler) {
        try {
            await handler(req, res);
        } catch (err) {
            console.error('[Server] 路由错误:', err);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message || 'Internal error' }));
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
    }
});

initWebSocket(server);

server.on('error', (err) => { console.error('❌ 服务器错误:', err); });

// 先初始化数据库再监听端口：避免端口已开但查询不可用的中间态
const PORT = parseInt(process.env.PORT) || 9999;
dbModule.initDb().then(() => {
    const host = process.env.HOST || '127.0.0.1';
    server.listen(PORT, host, () => {
        console.log(`✅ API & WebSocket 服务运行在 http://${host}:${PORT}`);
        console.log(`🔍 ErrPulse 仪表盘: http://localhost:3800（已禁用，需启用时改 serverUrl + enabled:true）`);
        console.log(`📁 贴纸存储于: ${storage.isLocal() ? '本地文件系统' : 'MinIO/RustFS'}`);
        console.log(`[MONITOR] /api/health 健康检查端点已启用`);
    });
}).catch(err => {
    console.error('❌ 数据库初始化失败:', err);
    process.exit(1);
});

// 优雅关闭：先停止接收新连接，再关闭数据库
process.on('SIGINT', () => {
    console.log('\n🛑 正在关闭服务...');
    server.close(() => {
        console.log('✅ 服务已关闭');
        if (dbModule.closeDb) dbModule.closeDb();
        process.exit(0);
    });
});
