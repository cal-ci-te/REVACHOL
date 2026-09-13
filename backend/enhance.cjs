// ！路由与响应增强层
// 自研的零依赖路由与 HTTP 响应封装：原生 http 加正则路由匹配，保留底层控制力。
// 选择自研而非 Express：项目仅约 15 个 REST 端点，引入 Express 的收益不足以抵消其概念开销。
// 若 API 增长到 50 个以上，可按同样的注册签名平滑迁移到 Express 的路由写法。

// 以 JSON 返回数据并附带 CORS 头
function send(res, data, status = 200) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify(data));
}

// 统一错误响应格式
// 前后端约定：所有错误响应均为 { error: string, code?: string }
// code 供前端按类型分支处理，缺省时不写入该字段
function sendError(res, statusCode, message, code = null) {
    const payload = { error: message };
    if (code) payload.code = code;
    send(res, payload, statusCode);
}

// 读取并解析请求体
// 解析失败统一转成 Invalid JSON：调用方只需处理一种错误文案
function json(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(body ? JSON.parse(body) : {}); }
            catch (err) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

const routes = { GET: {}, POST: {}, PUT: {}, DELETE: {} };

function register(method, path, handler) {
    routes[method][path] = handler;
}

const GET    = (path, handler) => register('GET', path, handler);
const POST   = (path, handler) => register('POST', path, handler);
const PUT    = (path, handler) => register('PUT', path, handler);
const DELETE = (path, handler) => register('DELETE', path, handler);

// 路由匹配：先精确命中，未命中再按 /api/articles/:id 形式的参数路由逐个匹配
// 参数路由用正则实现，把 :name 段替换为捕获组，再把捕获值回填到 req.params
function match(method, pathname) {
    if (routes[method] && routes[method][pathname]) {
        return routes[method][pathname];
    }
    for (const routePath of Object.keys(routes[method] || {})) {
        const pattern = routePath.replace(/:[^/]+/g, '([^/]+)');
        const regex = new RegExp(`^${pattern}$`);
        const matchResult = pathname.match(regex);
        if (matchResult) {
            const handler = routes[method][routePath];
            const keys = (routePath.match(/:[^/]+/g) || []).map(k => k.slice(1));
            // 包一层以注入 params：捕获组从下标 1 开始，故取 i+1
            return (req, res) => {
                req.params = {};
                keys.forEach((key, i) => { req.params[key] = matchResult[i + 1]; });
                handler(req, res);
            };
        }
    }
    return null;
}

module.exports = { send, sendError, json, GET, POST, PUT, DELETE, match, routes };
