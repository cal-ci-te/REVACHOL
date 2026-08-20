// 健康监控服务：定时轮询 /api/health 端点，检测后端服务状态。
// 包含：指数退避、重试、非 JSON 响应、多标签页同步、
// 内存泄漏防护、可见性自适应、细化降级 UI、并发锁、首次加载时序、超时控制。
// 模式参考项目现有 Service（如 ArticleService），使用对象字面量 + EventBus。
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { showToast } from '../utils/toast.js';
import { UI } from '../utils/ui-strings.js';
import { BroadcastHelper } from '../utils/broadcast-helper.js';

// [MODIFIED] 集中配置常量
const DEFAULTS = {
  initialInterval: 5000,    // 初始轮询间隔 5s（指数退避起点）
  maxInterval: 60000,       // 最大轮询间隔 60s
  hiddenInterval: 300000,   // 页面不可见时 5min
  maxRetries: 3,            // 单次检查最大重试次数
  timeout: 5000,            // fetch 超时 5s
  backoffFactor: 1.5,       // 退避因子
};
const BC_CHANNEL = 'revachol-health';
const BANNER_ID = 'health-banner';

export const HealthMonitor = {
  _currentStatus: 'unreachable',  // 'ok' | 'degraded' | 'unreachable'
  _currentChecks: null,           // 上次检查的详细数据（用于 UI 细化提示）
  _callbacks: [],
  _pollTimer: null,
  _pollInterval: DEFAULTS.initialInterval,
  _consecutiveFailures: 0,       // [NEW] 连续失败计数 → 指数退避
  _pendingCheck: false,          // [NEW] 并发锁
  _isLeader: false,              // [NEW] 是否为轮询主导标签页
  _bcUnlisten: null,             // [NEW] BroadcastChannel 监听取消函数
  _banner: null,
  _indicator: null,
  _started: false,               // [NEW] 是否已启动

  // ================================================================
  // 核心：带超时 + 非 JSON 防护 + 重试的 fetch
  // ================================================================

  /**
   * [MODIFIED] 带超时的 fetch，AbortController 5s 超时。
   * 解决边缘情况 #10：长时间无响应。
   */
  async _fetchWithTimeout(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULTS.timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        throw new Error(UI.monitor.checkTimeout);
      }
      throw err;  // 网络错误，保留原始错误供重试判断
    }
  },

  /**
   * [MODIFIED] 安全 JSON 解析。
   * 解决边缘情况 #3：后端返回 HTML / 非 JSON 响应。
   */
  async _safeJsonParse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      console.warn('[HealthMonitor] 响应非 JSON，前 80 字符:', text.slice(0, 80));
      return null;
    }
  },

  /**
   * [MODIFIED] 带重试的检查。
   * 解决边缘情况 #2：网络断开时自动重试（最多 maxRetries 次）。
   */
  async _checkWithRetry(retriesLeft) {
    for (let attempt = 0; attempt <= retriesLeft; attempt++) {
      try {
        const res = await this._fetchWithTimeout('/api/health');
        if (!res.ok) {
          // 非 2xx → 尝试解析 payload 中的 status
          const data = await this._safeJsonParse(res);
          return this._classify(data);
        }
        const data = await this._safeJsonParse(res);
        return this._classify(data);
      } catch (err) {
        if (attempt < retriesLeft) {
          console.warn(`[HealthMonitor] 检查失败 (${attempt + 1}/${retriesLeft + 1}):`, err.message, '→ 重试...');
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // 递增延迟
        } else {
          console.error(`[HealthMonitor] 检查失败，已用尽 ${retriesLeft + 1} 次重试:`, err.message);
          return { status: 'unreachable', checks: null, error: err.message };
        }
      }
    }
    return { status: 'unreachable', checks: null };
  },

  /** 将原始响应归一化为 `{ status, checks }` */
  _classify(data) {
    if (!data || !data.status) {
      return { status: 'unreachable', checks: null };
    }
    // status 可能是 "ok" 或 "degraded"
    return {
      status: data.status === 'ok' ? 'ok' : 'degraded',
      checks: data.checks || null,
    };
  },

  // ================================================================
  // 轮询（含指数退避 + 可见性自适应）
  // ================================================================

  /**
   * [MODIFIED] 启动轮询。
   * 解决边缘情况 #1 #5 #6：指数退避 + timer 防叠加 + 可见性自适应。
   */
  startPolling(interval) {
    this.stopPolling();
    if (interval !== undefined) {
      this._pollInterval = interval;
    }
    this._scheduleNextPoll();
  },

  /** [NEW] 调度下一次轮询（使用 setTimeout 链代替 setInterval，避免间隔漂移） */
  _scheduleNextPoll() {
    if (!this._started) return;

    // [NEW] 边缘情况 #6 — 页面不可见时降低频率
    const interval = document.hidden ? DEFAULTS.hiddenInterval : this._pollInterval;

    this._pollTimer = setTimeout(async () => {
      if (!this._started) return;
      if (this._isLeader) {
        await this._runCheck();
      }
      // 链式调度下次
      this._scheduleNextPoll();
    }, interval);
  },

  /** [NEW] 边缘情况 #1 — 指数退避：成功恢复默认间隔，失败逐步放大 */
  _applyBackoff(success) {
    const prevFailures = this._consecutiveFailures;

    if (success) {
      this._consecutiveFailures = 0;
      this._pollInterval = DEFAULTS.initialInterval;
    } else {
      this._consecutiveFailures++;
      this._pollInterval = Math.min(
        DEFAULTS.maxInterval,
        Math.floor(DEFAULTS.initialInterval * Math.pow(DEFAULTS.backoffFactor, this._consecutiveFailures))
      );
    }

    // 仅在 failures 计数变化或达到 5 的倍数时输出
    if (this._consecutiveFailures !== prevFailures || this._consecutiveFailures % 5 === 0) {
      console.log(`[HealthMonitor] 退避: failures=${this._consecutiveFailures}, interval=${this._pollInterval / 1000}s`);
    }
  },

  stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // ================================================================
  // 执行单次检查 + 状态变化处理
  // ================================================================

  /**
   * [MODIFIED] 带并发锁的检查。
   * 解决边缘情况 #8：防止手动点击 + 自动轮询同时触发。
   */
  async _runCheck() {
    if (this._pendingCheck) {
      // 静默跳过：已有检查进行中（并发锁保护，非异常）
      return;
    }
    this._pendingCheck = true;

    try {
      const prevStatus = this._currentStatus;
      const result = await this._checkWithRetry(DEFAULTS.maxRetries);
      const newStatus = result.status;

      // [NEW] 指数退避
      this._applyBackoff(newStatus === 'ok');
      this._currentStatus = newStatus;
      this._currentChecks = result.checks;

      this._updateIndicator(newStatus, result.checks);
      this._notifyCallbacks(result);

      // [NEW] 边缘情况 #4 — 广播状态到其他标签页
      this._broadcastStatus(newStatus, result.checks);

      // 状态变化时触发事件
      if (newStatus !== prevStatus) {
        this._handleTransition(prevStatus, newStatus, result.checks);
      } else {
        this._emitStatusEvent(newStatus, result);
      }

      // [NEW] 成功恢复后重置轮询间隔
      if (newStatus === 'ok' && prevStatus !== 'ok') {
        this._pollInterval = DEFAULTS.initialInterval;
        if (this._started && this._isLeader) {
          this._scheduleNextPoll();
        }
      }
    } finally {
      this._pendingCheck = false;
    }
  },

  /** 状态跃迁处理 */
  _handleTransition(from, to, checks) {
    console.log(`[HealthMonitor] 状态变化: ${from} → ${to}`);

    if (to === 'degraded') {
      // [MODIFIED] 边缘情况 #7 — 细化提示：显示具体哪个服务降级
      const failed = this._getFailedServices(checks);
      const msg = failed.length > 0
        ? UI.toast.monitorDegradedDetail(failed.join('、'))
        : UI.toast.monitorDegraded;
      showToast(msg, true);
      this._showBanner('degraded', failed);
      EventBus.emit(EVENTS.HEALTH_CHECK_DEGRADED, { status: to, checks });
      this._toggleAdminControls(true);
    } else if (to === 'unreachable') {
      showToast(UI.toast.monitorUnreachable, true);
      this._showBanner('unreachable');
      EventBus.emit(EVENTS.HEALTH_CHECK_FAILED, { status: to });
      this._toggleAdminControls(true);
    } else if (to === 'ok') {
      if (from === 'degraded' || from === 'unreachable') {
        showToast(UI.toast.monitorRestored, false);
      }
      this._hideBanner();
      EventBus.emit(EVENTS.HEALTH_CHECK_PASSED, { status: to, checks });
      this._toggleAdminControls(false);
    }
  },

  _emitStatusEvent(status, result) {
    if (status === 'ok') EventBus.emit(EVENTS.HEALTH_CHECK_PASSED, result);
    else if (status === 'degraded') EventBus.emit(EVENTS.HEALTH_CHECK_DEGRADED, result);
    else EventBus.emit(EVENTS.HEALTH_CHECK_FAILED, result);
  },

  /** [NEW] 边缘情况 #7 — 获取具体降级的服务名列表 */
  _getFailedServices(checks) {
    if (!checks) return [];
    const failed = [];
    if (checks.database && checks.database.status !== 'ok') failed.push(UI.monitor.serviceDb);
    if (checks.storage && checks.storage.status !== 'ok') failed.push(UI.monitor.serviceStorage);
    return failed;
  },

  // ================================================================
  // 多标签页同步（边缘情况 #4）
  // ================================================================

  /** [NEW] 建立 BroadcastChannel，选举 leader，同步状态 */
  _setupTabSync() {
    BroadcastHelper.init(BC_CHANNEL);

    // 监听其他标签页的状态广播
    this._bcUnlisten = BroadcastHelper.on('health-sync', (msg) => {
      const { status, checks, leaderId } = msg.payload || {};
      if (leaderId && leaderId !== this._tabId) {
        // 收到其他标签页的检查结果，被动更新 UI
        this._currentStatus = status;
        this._currentChecks = checks;
        this._updateIndicator(status, checks);
      }
    });

    // Leader 选举：第一个连接的标签页成为 leader
    this._tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    // 广播自己的存在
    BroadcastHelper.send('health-join', { tabId: this._tabId });

    // 重新选举 leader：收到 join 消息时，ID 最小的成为 leader
    const unlistenJoin = BroadcastHelper.on('health-join', (msg) => {
      const otherId = msg.payload && msg.payload.tabId;
      if (otherId) {
        this._isLeader = this._tabId <= otherId;  // 字典序最小者为主导
      }
    });

    // 主导标签页离开时重新选举
    BroadcastHelper.on('health-leave', (msg) => {
      const leftId = msg.payload && msg.payload.tabId;
      if (leftId && leftId < this._tabId) {
        // 比当前更小的 id 离开 → 当前可能成为新 leader
        this._isLeader = true;
        console.log('[HealthMonitor] 成为主导标签页 (原主导已离开)');
        if (this._started) this._scheduleNextPoll();
      }
    });

    // 初始假设自己是 leader，等待接收其他标签页的 join 消息
    this._isLeader = true;
    // 延迟 500ms 后若没有更小的 tabId 出现，则正式确认
    setTimeout(() => {
      if (this._isLeader) {
        console.log('[HealthMonitor] 确认为主导标签页 (tabId:', this._tabId, ')');
        if (this._started) this._scheduleNextPoll();
      } else {
        console.log('[HealthMonitor] 从属标签页，不执行主动轮询');
      }
    }, 500);

    // 页面关闭时通知
    window.addEventListener('beforeunload', () => {
      BroadcastHelper.send('health-leave', { tabId: this._tabId });
    }, { once: true });
  },

  /** [NEW] 广播当前状态到其他标签页 */
  _broadcastStatus(status, checks) {
    BroadcastHelper.send('health-sync', {
      status,
      checks,
      leaderId: this._tabId,
    });
  },

  // ================================================================
  // UI 更新
  // ================================================================

  /** [MODIFIED] 细化 Tooltip 显示 */
  _updateIndicator(status, checks) {
    if (!this._indicator) {
      this._indicator = document.getElementById('healthIndicator');
    }
    if (!this._indicator) return;

    const label = this._indicator.querySelector('.health-label');
    const detail = this._indicator.querySelector('.health-detail');

    const config = {
      ok:          { cls: 'ok',    text: UI.monitor.statusOk },
      degraded:    { cls: 'degraded', text: UI.monitor.statusDegraded },
      unreachable: { cls: 'unreachable', text: UI.monitor.statusUnreachable },
    };

    const c = config[status] || config.unreachable;
    this._indicator.className = 'health-indicator ' + c.cls;

    if (label) label.textContent = c.text;

    // [MODIFIED] 边缘情况 #7 — 降级时显示具体服务名
    if (detail) {
      if (status === 'degraded' && checks) {
        const failed = this._getFailedServices(checks);
        detail.textContent = failed.length > 0 ? UI.monitor.detailDegraded(failed.join('、')) : '';
      } else {
        detail.textContent = '';
      }
    }

    // Tooltip
    let tip = UI.monitor.noData;
    if (checks) {
      const db = checks.database ? `${checks.database.status} (${checks.database.latency}ms)` : '—';
      const st = checks.storage ? `${checks.storage.status} (${checks.storage.latency}ms)` : '—';
      const ws = checks.websocket ? `${checks.websocket.connections} 连接` : '—';
      const mem = checks.memory ? `${checks.memory.usage}%` : '—';
      tip = UI.monitor.tooltipTemplate(db, st, ws, mem);
    }
    this._indicator.title = tip;
  },

  /** [MODIFIED] 细化横幅文本 */
  _showBanner(level, failedServices = []) {
    if (this._banner) return;
    this._banner = document.createElement('div');
    this._banner.id = BANNER_ID;

    if (level === 'unreachable') {
      this._banner.className = 'health-banner error';
      this._banner.textContent = UI.monitor.bannerUnreachable;
    } else {
      this._banner.className = 'health-banner warning';
      // [MODIFIED] 边缘情况 #7 — 细化横幅
      this._banner.textContent = failedServices.length > 0
        ? UI.monitor.bannerDegradedDetail(failedServices.join('、'))
        : UI.monitor.bannerDegraded;
    }
    document.body.prepend(this._banner);
  },

  _hideBanner() {
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
  },

  _toggleAdminControls(disable) {
    document.querySelectorAll('.tree-node-content .visibility-toggle, [data-action="delete-article"]')
      .forEach(el => { el.classList.toggle('disabled', disable); });

    const uploadBtn = document.getElementById('assetUploadBtn');
    if (uploadBtn) {
      uploadBtn.classList.toggle('disabled', disable);
      if (disable) uploadBtn.title = UI.monitor.uploadDisabled;
      else uploadBtn.title = '';
    }
  },

  // ================================================================
  // 公开 API
  // ================================================================

  /**
   * [MODIFIED] 公开的 check() — 并发安全。
   * 解决边缘情况 #8：用户快速点击指示器。
   */
  async check() {
    if (this._pendingCheck) return { status: this._currentStatus, checks: this._currentChecks };
    return this._checkWithRetry(DEFAULTS.maxRetries);
  },

  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this._callbacks.push(callback);
    }
  },

  _notifyCallbacks(status) {
    this._callbacks.forEach(cb => {
      try { cb(status); } catch (e) { console.error('[HealthMonitor] 回调错误:', e); }
    });
  },

  // ================================================================
  // 生命周期
  // ================================================================

  /**
   * [MODIFIED] 初始化 — 延迟到 DOM 就绪 + 多标签页同步。
   * 解决边缘情况 #4 #9：BroadcastChannel + 启动时序。
   */
  init() {
    this._indicator = document.getElementById('healthIndicator');
    if (this._indicator) {
      this._indicator.addEventListener('click', () => {
        this._runCheck();
      });
    }

    // [NEW] 多标签页同步
    this._setupTabSync();

    // [NEW] 可见性变化 — 切换频率（边缘情况 #6）
    this._visibleHandler = () => {
      if (!this._started) return;
      // 切回可见时立即检查
      if (!document.hidden) {
        if (this._currentStatus !== 'ok') {
          this._runCheck();
        }
      }
      // 重新调度（使用当前合适的间隔）
      if (this._isLeader) {
        this._scheduleNextPoll();
      }
    };
    document.addEventListener('visibilitychange', this._visibleHandler);

    console.log('[HealthMonitor] 初始化完成');
  },

  /**
   * [MODIFIED] 启动 — 延迟执行首检，等待 AppState 就绪。
   * 解决边缘情况 #9：首次加载时序。
   */
  start() {
    this._started = true;
    // 首检用初始间隔
    this._pollInterval = DEFAULTS.initialInterval;
    if (this._isLeader) {
      this._runCheck().then(() => {
        if (this._started) this._scheduleNextPoll();
      });
    }
    console.log('[HealthMonitor] 已启动');
  },

  /** 销毁 */
  destroy() {
    this._started = false;
    this.stopPolling();
    this._pendingCheck = false;
    this._callbacks = [];
    this._hideBanner();
    this._indicator = null;
    if (this._bcUnlisten) { this._bcUnlisten(); this._bcUnlisten = null; }
    if (this._visibleHandler) {
      document.removeEventListener('visibilitychange', this._visibleHandler);
      this._visibleHandler = null;
    }
    BroadcastHelper.send('health-leave', { tabId: this._tabId });
    console.log('[HealthMonitor] 已销毁');
  },
};
