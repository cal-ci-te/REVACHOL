// ！WebSocket 广播
// 简单的广播式 WebSocket：所有已连接客户端共享同一条消息流，不做房间或频道隔离。
// 面向并发量很小的后台场景；若将来需要频道隔离，可迁移到 Socket.IO。
const WebSocket = require('ws');

const clients = new Set();

// 心跳间隔：连续两个周期未收到 pong 即判定连接失活并断开
const HEARTBEAT_INTERVAL = 30000;

function initWebSocket(server) {
    // 两处取舍：
    // 1. 关闭 perMessageDeflate——Docker Desktop 端口转发对该扩展的握手存在兼容问题
    //    （宿主 ws 客户端会报 closed before connection established），而本项目广播量小，
    //    放弃压缩换取跨环境稳定。
    // 2. 限定 path 为 /websocket/——仅接受 Crew Dashboard 的 WS 路径，其余 upgrade 返回 404。
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

    // 心跳保活：定期 ping，本轮未回应的连接在下轮被 terminate
    // 先判 isAlive 再置 false 并 ping，使判定恰好滞后一个周期
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

// 向所有处于 OPEN 态的客户端推送同一条消息
// 逐个判断 readyState：握手未完成或正在关闭的连接直接 send 会抛错
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
