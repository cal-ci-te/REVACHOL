# REVACHOL WebSocket 协议

> 版本：v1.21.0-wip | 更新：2026-08-21
>
> 本文档基于 `backend/websocket.cjs`、`backend/routes/crew.cjs`、`js/services/crew-service.js`、`js/core/event-constants.js` 的实际实现编写，不包含未实现内容。

---

## 1. 连接信息

| 项 | 值 | 说明 |
|---|---|---|
| 端点 | `/websocket/` | 相对同源路径；开发环境经 Vite `/websocket` 代理转发到 backend |
| 协议 | `ws://` / `wss://` | 文本帧，JSON 编码 |
| 地址覆盖 | `VITE_WS_URL` / `CREW_WS_URL` | 支持绝对地址（`ws://host/...`）或相对路径（`/websocket/`） |
| 服务端 | `ws` 库 + `WebSocket.Server` | `perMessageDeflate: false`（兼容 Docker Desktop 端口转发）；仅接受 `/websocket/` 路径 |
| 广播模式 | 全局广播 | 所有已连接客户端共享同一消息流（无房间/频道隔离） |
| 心跳 | 服务端每 30s `ping()` | 客户端浏览器自动回 `pong`；连续两个周期未响应则 `terminate()` |
| 欢迎帧 | `{"type":"welcome","message":"连接到 REVACHOL 后端"}` | 连接建立后立即发送 |

## 2. 消息格式

所有消息均为 JSON 文本帧：

```json
{
  "type": "CREW_*",
  "payload": { }
}
```

- `type`：事件类型字符串（服务端广播 `CREW_*`；另有 `welcome` 欢迎帧）
- `payload`：事件数据对象

## 3. 事件类型（服务端 → 客户端）

### 3.1 `CREW_STARTED` — 任务开始

Python 输出 `crew:started` 后由 `crew.cjs` 翻译广播。

```json
{
  "type": "CREW_STARTED",
  "payload": {
    "runId": "1720000000000_abc123",
    "requirement": "为贴纸系统新增旋转功能",
    "process": "sequential",
    "memory": false,
    "planning": false,
    "startedAt": "2026-08-21T06:00:00.000Z"
  }
}
```

前端映射：`EVENTS.CREW_STARTED` → `crew-dashboard-component` 置 `running=true`、记录 runId/requirement。

### 3.2 `CREW_LOG` — 通用日志

来源：Python `crew:log`、stderr、非 JSON 的 raw stdout 行。

```json
{
  "type": "CREW_LOG",
  "payload": {
    "runId": "1720000000000_abc123",
    "timestamp": "2026-08-21T06:00:01.000Z",
    "level": "info",
    "message": "Coder: 正在编写代码..."
  }
}
```

`level` 取值：`info` / `warning` / `error` / `stderr` / `raw` / `success`。日志上限 500 条。

### 3.3 `CREW_AGENT_STATUS` — Agent 状态变更

来源：Python `crew:agent-status`。

```json
{
  "type": "CREW_AGENT_STATUS",
  "payload": {
    "runId": "1720000000000_abc123",
    "agent": "Planner",
    "status": "running",
    "task": "规划任务",
    "detail": "正在分析需求"
  }
}
```

`agent` 可为显示名（`Planner`）或 id（`planner`）；`status`：`idle` / `waiting` / `running` / `done` / `failed`（与 `crew-dashboard-component.js` 的 `STATUS_META` 一致）。

### 3.4 `CREW_TASK` — 任务级事件

来源：Python `crew:task`。

```json
{
  "type": "CREW_TASK",
  "payload": {
    "runId": "1720000000000_abc123",
    "task": "planning"
  }
}
```

当前前端收到后未做专门 UI 渲染（仅透传 EventBus），保留给后续任务面板扩展。

### 3.5 `CREW_OUTPUT` — Agent 输出内容

来源：Python `crew:output`。

```json
{
  "type": "CREW_OUTPUT",
  "payload": {
    "runId": "1720000000000_abc123",
    "timestamp": "2026-08-21T06:05:00.000Z",
    "task": "编码任务",
    "content": "实现的核心代码如下...",
    "isJson": false
  }
}
```

输出上限 100 条，单条 content 截断至 8000 字符。

### 3.6 `CREW_STATS` — Token 消耗统计

来源：Python `crew:stats`。

```json
{
  "type": "CREW_STATS",
  "payload": {
    "runId": "1720000000000_abc123",
    "agent": "Planner",
    "tokens": 1234,
    "cost": 0.012
  }
}
```

### 3.7 `CREW_FINISHED` — 任务完成

来源：Python `crew:finished`；若子进程未发送该事件，`crew.cjs` 在 `close` 事件中按退出码兜底广播。

```json
{
  "type": "CREW_FINISHED",
  "payload": {
    "runId": "1720000000000_abc123",
    "success": true,
    "error": null,
    "finishedAt": "2026-08-21T06:10:00.000Z"
  }
}
```

`success: false` 时 `error` 为失败原因（如 `Crew 子进程退出，code=1`）。

### 3.8 `CREW_STOPPED` — 手动停止

来源：`POST /api/crew/stop` 调用 `stopCrewRun()`。

```json
{
  "type": "CREW_STOPPED",
  "payload": {
    "runId": "1720000000000_abc123",
    "finishedAt": "2026-08-21T06:09:30.000Z"
  }
}
```

停止时后端会**连续广播** `CREW_STOPPED` 与 `CREW_FINISHED`（`success:false, error:"已被管理员手动停止"`）。

### 3.9 客户端内部事件（非 WS 帧）

| 事件 | 说明 | 来源 |
|---|---|---|
| `CREW_STATUS_LOADED` | REST `GET /api/crew/status` 成功后触发（页面刷新恢复现场） | `crew-service.js: fetchStatus()` |
| `CREW_ERROR` | 拉取状态失败时触发（WS 层异常不通过该事件上报，仅 `console.warn`） | `crew-service.js: init()` |

## 4. 事件流程（正常执行时序）

```
浏览器                    Vite 代理               backend/crew.cjs             Python 子进程
  │  POST /api/crew/run      │                          │                          │
  ├─────────────────────────►│  ────────────────────────►│  spawn(--once --json-logs)│
  │  202 {runId,status}      │                          ├─────────────────────────►│
  │◄─────────────────────────│◄──────────────────────────│                          │
  │                          │                          │◄──── crew:started ────────│
  │◄────── WS CREW_STARTED ──│◄── broadcast(CREW_STARTED)│                          │
  │                          │                          │◄──── crew:log ────────────│
  │◄────── WS CREW_LOG ──────│◄── broadcast(CREW_LOG)    │                          │
  │                          │                          │◄──── crew:agent-status ───│
  │◄── WS CREW_AGENT_STATUS ─│◄── broadcast(...)         │                          │
  │                          │                          │◄──── crew:task ───────────│
  │◄────── WS CREW_TASK ─────│◄── broadcast(CREW_TASK)   │                          │
  │                          │                          │◄──── crew:output ─────────│
  │◄───── WS CREW_OUTPUT ────│◄── broadcast(CREW_OUTPUT) │                          │
  │                          │                          │◄──── crew:stats ──────────│
  │◄────── WS CREW_STATS ────│◄── broadcast(CREW_STATS)  │                          │
  │                          │                          │◄──── crew:finished ───────│
  │◄──── WS CREW_FINISHED ───│◄── broadcast(CREW_FINISHED)│                          │
  │                          │                          │                          │
```

浏览器端收到 WS 帧 → `CrewService._handleMessage()` → `EventBus.emit(EVENTS.CREW_*)` → `crew-dashboard-component` 订阅并渲染。

## 5. 错误码（REST 层，非 WS 帧）

Crew Dashboard 的启动/停止均通过 REST 发起，错误以 HTTP 状态 + `code` 返回（`enhance.cjs: sendError`）。

| code | HTTP | 含义 | 位置 |
|---|---|---|---|
| `CREW_BUSY` | 409 | 已有 Crew 任务在运行，拒绝并发 | `crew.cjs: POST /api/crew/run` |
| `CREW_REQUIREMENT_REQUIRED` | 400 | `requirement` 为空 | 同上 |
| `CREW_REQUIREMENT_TOO_LONG` | 400 | `requirement` 超过 5000 字符 | 同上 |
| `CREW_SPAWN_FAILED` | 500 | Python 子进程启动失败 | 同上 |

> 说明：规划资料中的 `PROCESS_ERROR`、`TIMEOUT` 错误码当前**未实现**。WS 连接超时由前端本地处理（见下节），子进程异常统一通过 `CREW_FINISHED(success:false)` + `CREW_LOG` 表达。

## 6. 前端连接与降级策略

| 机制 | 参数 | 行为 |
|---|---|---|
| 握手超时 | `WS_CONNECT_TIMEOUT = 5000ms` | 超时后关闭并进入重连 |
| 重连退避 | 3s → 6s → 12s → 24s → 30s（封顶） | 指数退避，`MAX_RECONNECT_ATTEMPTS = 5` |
| 轮询降级 | `POLLING_INTERVAL = 3000ms` | 重连达上限后改为 HTTP 轮询 `GET /api/crew/status` |
| 恢复 | `onopen` 后 `reconnectAttempts = 0` 并停止轮询 | 回到实时模式 |

## 7. 相关文件

| 文件 | 职责 |
|---|---|
| `backend/websocket.cjs` | WS 服务端：路径限定、心跳、`broadcast()` |
| `backend/routes/crew.cjs` | NDJSON 解析、`CREW_*` 事件翻译、运行状态快照、REST 端点 |
| `my_first_crew/run_revachol_crew.py` | 无头模式 NDJSON 事件源（`crew:*`） |
| `js/services/crew-service.js` | 前端 WS 客户端：连接/重连/降级/消息分发 |
| `js/core/event-constants.js` | `EVENTS.CREW_*` 常量定义 |
| `js/components/crew-dashboard-component.js` | 事件消费与 UI 渲染 |
