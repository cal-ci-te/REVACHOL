// ！实时消息通道
// 维护与后端的 WebSocket 长连接，接收可见性变更与文章增删改通知并转交 ArticleService。
// 断线后定时重连；未配置 WS_URL 时整体跳过连接与重连，便于纯静态部署。

import { CONFIG } from '../config.js';
import { ArticleService } from './article-service.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { UIController } from '../ui/ui-controller.js';

export const WebSocketManager = {
  ws: null,
  reconnectTimer: null,
  reconnectInterval: 3000,
  isConnected: false,

  // 建立连接
  init() {
    const wsUrl = CONFIG.WS_URL;
    if (!wsUrl) {
      console.log('[WebSocket] WS_URL 未配置，跳过连接');
      return;
    }
    this.connect(wsUrl);
  },

  // 创建底层连接
  connect(url) {
    try {
      this.ws = new WebSocket(url);
      this.ws.onopen = this.onOpen.bind(this);
      this.ws.onmessage = this.onMessage.bind(this);
      this.ws.onclose = this.onClose.bind(this);
      this.ws.onerror = this.onError.bind(this);
    } catch (e) {
      console.error('[WebSocket] 连接失败:', e);
      this.scheduleReconnect();
    }
  },

  onOpen() {
    console.log('[WebSocket] 已连接');
    this.isConnected = true;
    this.send({ type: 'subscribe', channel: 'visibility' });
  },

  // 处理服务端推送
  onMessage(event) {
    try {
      const data = JSON.parse(event.data);
      console.log('[WebSocket] 收到消息:', data.type, data.payload);

      if (data.type === 'visibility_changed') {
        if (typeof ArticleService !== 'undefined' && ArticleService.onVisibilityChanged) {
          ArticleService.onVisibilityChanged(data);
        }
      } else if (data.type === 'article_updated') {
        console.log('[WebSocket] 文章更新:', data.payload);
        // 服务端已改数据：强制拉取并刷新界面，替代本地增量更新
        if (ArticleService && ArticleService.fetchArticles) {
          ArticleService.fetchArticles(true).then(() => {
            if (UIController && UIController.refreshDisplay) {
              UIController.refreshDisplay();
            }
            EventBus.emit(EVENTS.ARTICLE_DATA_LOADED);
          });
        }
      } else if (data.type === 'article_created' || data.type === 'article_deleted') {
        // 增删同走全量刷新：文章顺序与分页状态需要重算
        if (ArticleService && ArticleService.fetchArticles) {
          ArticleService.fetchArticles(true).then(() => {
            if (UIController && UIController.refreshDisplay) {
              UIController.refreshDisplay();
            }
            EventBus.emit(EVENTS.ARTICLE_DATA_LOADED);
          });
        }
      }
    } catch (e) {
      console.error('[WebSocket] 消息解析错误:', e);
    }
  },

  onClose() {
    console.log('[WebSocket] 连接断开');
    this.isConnected = false;
    this.scheduleReconnect();
  },

  onError(error) {
    console.error('[WebSocket] 错误:', error);
  },

  // 发送消息
  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    } else {
      console.warn('[WebSocket] 未连接，无法发送消息');
    }
  },

  // 安排重连
  // 固定间隔重试且不做退避：本应用为单机部署，断线多为后端重启，3s 内即可恢复
  scheduleReconnect() {
    if (!CONFIG.WS_URL) {
        console.log('[WebSocket] WS_URL 未配置，跳过重连');
        return;
    }

    // 先清旧定时器：多次 onclose/onerror 触发时只保留一次重连
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
        console.log('[WebSocket] 尝试重连...');
        this.connect(CONFIG.WS_URL);
    }, this.reconnectInterval);
},

  // 关闭连接
  close() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  },
};

