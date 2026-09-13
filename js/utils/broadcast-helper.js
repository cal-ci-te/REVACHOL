// ！跨标签页广播
// 封装 BroadcastChannel，提供类型化消息收发与监听器管理，用于多标签页间同步状态。
// 选择 BroadcastChannel 而非轮询 localStorage：原生事件驱动、无轮询开销，且不会读到自身写入的重复消息。
// 选择对象字面量而非 class：与项目其他 Service 单例保持一致的调用形态。
export const BroadcastHelper = {
  _channel: null,
  _listeners: [],

  // 初始化频道
  // 幂等：频道名不变时仅重挂监听器，避免重复创建
  init(channelName) {
    if (this._channel && this._channel.name === channelName) {
      // 频道名不变，仅重新挂载监听器
      this._channel.onmessage = (event) => this._dispatch(event.data);
      return;
    }
    this.close();
    try {
      this._channel = new BroadcastChannel(channelName);
      this._channel.onmessage = (event) => this._dispatch(event.data);
    } catch (_) {
      console.warn('[BroadcastHelper] BroadcastChannel API 不可用');
      this._channel = null;
    }
  },

  // 注册消息处理器
  // 返回取消函数，便于组件卸载时解绑
  on(filter, callback) {
    const entry = { filter, callback };
    this._listeners.push(entry);
    return () => {
      const idx = this._listeners.indexOf(entry);
      if (idx !== -1) this._listeners.splice(idx, 1);
    };
  },

  // 发送类型化消息
  send(type, payload = {}) {
    if (!this._channel) return;
    try {
      this._channel.postMessage({ type, payload, ts: Date.now() });
    } catch (_) {
      // 忽略：频道可能已关闭，发送失败不影响调用方
    }
  },

  // 分发消息到匹配监听器
  _dispatch(data) {
    if (!data || !data.type) return;
    this._listeners.forEach(({ filter, callback }) => {
      try {
        if (typeof filter === 'string' && filter === data.type) callback(data);
        else if (typeof filter === 'function' && filter(data)) callback(data);
      } catch (e) {
        console.error('[BroadcastHelper] 监听器错误:', e);
      }
    });
  },

  // 关闭频道并清理监听器
  close() {
    this._listeners = [];
    if (this._channel) {
      try {
        this._channel.close();
      } catch (_) {
        // 忽略：重复关闭不视为错误
      }
      this._channel = null;
    }
  },
};
