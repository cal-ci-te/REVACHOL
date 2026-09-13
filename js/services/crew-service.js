// ！CrewAI 控制台服务
// 封装 /api/crew/* REST 接口，并将后端广播的 CREW_* 消息翻译为 EventBus 事件。
// WebSocket 默认同源 /websocket/（经 Vite 代理转发后端），可用 VITE_WS_URL 覆盖。
// 选择「WS 失败后降级为 HTTP 轮询」而非无限重连：保证页面不因握手失败而永久空白。

import { AppState } from '../core/app-state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { ApiClient } from './api-client.js';

const DEFAULT_WS_PATH = '/websocket/';
// 单次握手超时
const WS_CONNECT_TIMEOUT = 5000;
// 基础重连间隔（指数退避基数）
const RECONNECT_INTERVAL = 3000;
// 超过后切换轮询降级
const MAX_RECONNECT_ATTEMPTS = 5;
// 指数退避上限
const MAX_RECONNECT_DELAY = 30000;
// 轮询降级间隔
const POLLING_INTERVAL = 3000;

// 构造 WebSocket 地址
// 兼容 VITE_WS_URL 与 CREW_WS_URL 两种命名（后者需 vite envPrefix 含 CREW_）
function buildWebSocketUrl() {
  const explicit = import.meta.env.VITE_WS_URL || import.meta.env.CREW_WS_URL;
  if (explicit) {
    if (/^wss?:\/\//i.test(explicit)) return explicit;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}${explicit.startsWith('/') ? explicit : '/' + explicit}`;
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}${DEFAULT_WS_PATH}`;
}

export const CrewService = {
  ws: null,
  reconnectTimer: null,
  reconnectInterval: RECONNECT_INTERVAL,
  maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
  reconnectAttempts: 0,
  connectionTimer: null,
  pollingTimer: null,
  isConnected: false,
  isPollingFallback: false,

  // 初始化
  // 先拉一次状态快照再建实时流：不等待首条 WS 消息即可渲染，避免连接慢时页面空白
  init() {
    this.fetchStatus().catch((err) => {
      console.error('[CrewService] 拉取状态失败:', err);
      EventBus.emit(EVENTS.CREW_ERROR, { message: `拉取状态失败: ${err.message || err}` });
    });
    this.connectWebSocket();
  },

  // 销毁
  destroy() {
    this.disconnectWebSocket();
  },

  // 拉取运行状态
  async fetchStatus() {
    const data = await ApiClient.get('/api/crew/status');
    AppState.commit(MUTATIONS.SET_CREW_STATE, data);
    EventBus.emit(EVENTS.CREW_STATUS_LOADED, data);
    return data;
  },

  // 启动一次运行
  async startRun(payload) {
    const data = await ApiClient.post('/api/crew/run', payload);
    EventBus.emit(EVENTS.CREW_STARTED, data);
    return data;
  },

  // 停止运行
  async stopRun() {
    const data = await ApiClient.post('/api/crew/stop', {});
    return data;
  },

  // 建立 WebSocket 连接
  connectWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    // 已进入轮询降级时不再重连：避免 WS 失败后仍在后台空转
    if (this.isPollingFallback) return;

    try {
      this.ws = new WebSocket(buildWebSocketUrl());
      this.isConnected = false;

      // 握手超时保护：防止 ws 长期停留在 CONNECTING 而既不触发 onopen 也不触发 onclose
      this.connectionTimer = setTimeout(() => {
        this._handleConnectionTimeout();
      }, WS_CONNECT_TIMEOUT);

      this.ws.onopen = () => {
        this._clearConnectionTimer();
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this._stopPolling();
        console.log('[CrewService] WebSocket 已连接');
      };

      this.ws.onmessage = (event) => this._handleMessage(event);

      this.ws.onclose = () => {
        this._clearConnectionTimer();
        this.isConnected = false;
        console.log('[CrewService] WebSocket 断开，准备重连');
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.warn('[CrewService] WebSocket 错误:', error && error.message ? error.message : error);
      };
    } catch (e) {
      this._clearConnectionTimer();
      console.error('[CrewService] WebSocket 连接失败:', e);
      this.scheduleReconnect();
    }
  },

  // 断开并清理连接
  disconnectWebSocket() {
    this._clearConnectionTimer();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this._stopPolling();
    if (this.ws) {
      // 先解除回调再 close：否则 close() 触发的 onclose 会再次安排重连
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch {
        // 忽略：连接可能已进入 CLOSING/CLOSED，close() 抛错无害
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.reconnectAttempts = 0;
  },

  // 安排重连
  scheduleReconnect() {
    if (this.isPollingFallback) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[CrewService] WebSocket 重连次数已达上限，降级为 HTTP 轮询');
      this._fallbackToPolling();
      return;
    }

    // 指数退避：3s → 6s → 12s → 24s → 30s（封顶）
    const delay = Math.min(
      this.reconnectInterval * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );
    this.reconnectAttempts += 1;
    console.warn(`[CrewService] ${delay}ms 后尝试第 ${this.reconnectAttempts} 次重连`);
    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), delay);
  },

  // 处理握手超时
  _handleConnectionTimeout() {
    console.warn('[CrewService] WebSocket 握手超时');
    if (this.ws) {
      try { this.ws.close(); } catch {
        // 忽略：连接可能已进入 CLOSING/CLOSED，close() 抛错无害
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.scheduleReconnect();
  },

  // 降级为轮询
  _fallbackToPolling() {
    if (this.isPollingFallback) return;
    this.isPollingFallback = true;
    this.isConnected = false;
    console.warn('[CrewService] 已切换为 HTTP 轮询降级模式');

    // 立即轮询一次：降级瞬间界面可能已过期，不等一个轮询周期
    this.fetchStatus().catch(() => {});
    this.pollingTimer = setInterval(() => {
      this.fetchStatus().catch((err) => {
        console.warn('[CrewService] 轮询刷新失败:', err);
      });
    }, POLLING_INTERVAL);
  },

  // 停止轮询
  _stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPollingFallback = false;
  },

  // 清除握手定时器
  _clearConnectionTimer() {
    if (this.connectionTimer) {
      clearTimeout(this.connectionTimer);
      this.connectionTimer = null;
    }
  },

  // 翻译后端广播
  _handleMessage(event) {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch (e) {
      console.error('[CrewService] 消息解析失败:', e);
      return;
    }

    const { type, payload } = data || {};
    switch (type) {
      case 'CREW_STARTED':
        EventBus.emit(EVENTS.CREW_STARTED, payload);
        break;
      case 'CREW_AGENT_STATUS':
        EventBus.emit(EVENTS.CREW_AGENT_STATUS, payload);
        break;
      case 'CREW_TASK':
        EventBus.emit(EVENTS.CREW_TASK, payload);
        break;
      case 'CREW_LOG':
        EventBus.emit(EVENTS.CREW_LOG, payload);
        break;
      case 'CREW_OUTPUT':
        EventBus.emit(EVENTS.CREW_OUTPUT, payload);
        break;
      case 'CREW_STATS':
        EventBus.emit(EVENTS.CREW_STATS, payload);
        break;
      case 'CREW_FINISHED':
        EventBus.emit(EVENTS.CREW_FINISHED, payload);
        break;
      case 'CREW_STOPPED':
        EventBus.emit(EVENTS.CREW_STOPPED, payload);
        break;
      case 'FLOW_STAGED':
        // RFC-001 D4：Flow 任务进入暂存区，需自动通知人工
        EventBus.emit(EVENTS.CREW_FLOW_STAGED, payload);
        break;
      default:
        // 其它广播（welcome / article_* 等）与本页面无关，忽略
        break;
    }
  },
};

export default CrewService;
