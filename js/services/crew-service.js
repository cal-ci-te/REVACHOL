// CrewAI Web Dashboard 服务层。
// 职责：
//   1. 封装 /api/crew/* REST 接口（status / run / stop）；
//   2. 建立独立 WebSocket 连接（同源 /websocket/，开发环境经 Vite 代理转发到后端）；
//   3. 将后端广播的 CREW_* 消息翻译为 EventBus 事件，组件只需订阅事件即可渲染。
import { AppState } from '../core/app-state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { ApiClient } from './api-client.js';

function buildWebSocketUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/websocket/`;
}

export const CrewService = {
  ws: null,
  reconnectTimer: null,
  reconnectInterval: 3000,
  isConnected: false,

  /** 页面初始化：先拉取一次状态快照，再建立 WebSocket 实时流 */
  init() {
    this.fetchStatus().catch((err) => {
      console.error('[CrewService] 拉取状态失败:', err);
      EventBus.emit(EVENTS.CREW_ERROR, { message: `拉取状态失败: ${err.message || err}` });
    });
    this.connectWebSocket();
  },

  destroy() {
    this.disconnectWebSocket();
  },

  // =========================================================================
  // REST API
  // =========================================================================

  async fetchStatus() {
    const data = await ApiClient.get('/api/crew/status');
    AppState.commit(MUTATIONS.SET_CREW_STATE, data);
    EventBus.emit(EVENTS.CREW_STATUS_LOADED, data);
    return data;
  },

  async startRun(payload) {
    const data = await ApiClient.post('/api/crew/run', payload);
    EventBus.emit(EVENTS.CREW_STARTED, data);
    return data;
  },

  async stopRun() {
    const data = await ApiClient.post('/api/crew/stop', {});
    return data;
  },

  // =========================================================================
  // WebSocket
  // =========================================================================

  connectWebSocket() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    try {
      this.ws = new WebSocket(buildWebSocketUrl());
      this.ws.onopen = () => {
        console.log('[CrewService] WebSocket 已连接');
        this.isConnected = true;
      };
      this.ws.onmessage = (event) => this._handleMessage(event);
      this.ws.onclose = () => {
        console.log('[CrewService] WebSocket 断开，准备重连');
        this.isConnected = false;
        this.scheduleReconnect();
      };
      this.ws.onerror = (error) => {
        console.error('[CrewService] WebSocket 错误:', error);
      };
    } catch (e) {
      console.error('[CrewService] WebSocket 连接失败:', e);
      this.scheduleReconnect();
    }
  },

  disconnectWebSocket() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.onmessage = null;
      this.ws.onerror = null;
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.isConnected = false;
  },

  scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this.connectWebSocket(), this.reconnectInterval);
  },

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
      default:
        // 其它广播（welcome / article_* 等）与本页面无关，忽略
        break;
    }
  },
};

export default CrewService;
