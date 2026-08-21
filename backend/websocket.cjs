// 简单的广播式 WebSocket：所有连接的客户端共享同一消息流。
// 适用于当前场景（< 10 并发管理员），若后续需要房间/频道隔离，可迁移至 Socket.IO。
const WebSocket = require('ws');

const clients = new Set();

// 心跳间隔：超过两个周期未收到 pong 则判定连接失活并断开
const HEARTBEAT_INTERVAL = 30000;

function initWebSocket(server) {
    // perMessageDeflate: false — Docker Desktop 端口转发对 permessage-deflate
    // 扩展的握手存在兼容性问题（宿主 ws 客户端报 “closed before connection established”）。
    // 本项目广播消息量小，禁用压缩换取跨环境兼容性。
    // path: '/websocket/' — 仅接受 Crew Dashboard 的 WS 路径，其余 upgrade 返回 404。
    const wss = new WebSocket.Server({
        server,
        perMessageDeflate: false,
        path: '/websocket/',
    });

    console.log('[WebSocket] 服务已挂载: /websocket/');

    wss.on('connection', (ws) => {
        console.log('🔗 WebSocket 客户端连接');
        clients.add(ws);
        ws.isAlive = true;

        ws.on('pong', () => {
            ws.isAlive = true;
        });

        ws.send(JSON.stringify({ type: 'welcome', message: '连接到 REVACHOL 后端' }));

        ws.on('close', () => {
            console.log('🔌 客户端断开');
            clients.delete(ws);
        });

        ws.on('error', (err) => {
            console.warn('[WebSocket] 连接错误:', err.message);
            clients.delete(ws);
        });
    });

    // 心跳保活：定期 ping，未响应的连接 terminate
    const heartbeatTimer = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                console.warn('[WebSocket] 心跳超时，断开连接');
                ws.terminate();
                clients.delete(ws);
                return;
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('close', () => {
        clearInterval(heartbeatTimer);
    });

    return wss;
}

function broadcast(data) {
    const msg = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

module.exports = {
    initWebSocket,
    broadcast,
    clients,
};
