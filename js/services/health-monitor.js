// ！后端健康监控
// 定时探测 /api/health，把后端状态映射为顶部指示器与横幅，并广播给其他标签页。
// 多标签页只由 leader 轮询，其余标签页被动接收：避免同一浏览器开 N 个页面就打 N 倍请求。
// 状态机：ok → degraded → unreachable，任一状态均按指数退避调整下一次探测间隔。

import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { showToast } from '../utils/toast.js';
import { UI } from '../utils/ui-strings.js';
import { BroadcastHelper } from '../utils/broadcast-helper.js';

const DEFAULTS = {
  // 初始轮询间隔（指数退避起点）
  initialInterval: 5000,
  // 最大轮询间隔
  maxInterval: 60000,
  // 页面不可见时的间隔
  hiddenInterval: 300000,
  // 单次检查最大重试次数
  maxRetries: 3,
  // fetch 超时
  timeout: 5000,
  // 退避因子
  backoffFactor: 1.5,
};
const BC_CHANNEL = 'revachol-health';
const BANNER_ID = 'health-banner';

export const HealthMonitor = {
  _currentStatus: 'unreachable',
  // 上次检查的详细数据，用于 UI 细化提示
  _currentChecks: null,
  _callbacks: [],
  _pollTimer: null,
  _pollInterval: DEFAULTS.initialInterval,
  // 连续失败计数，驱动指数退避
  _consecutiveFailures: 0,
  // 并发锁：手动点击与自动轮询互斥
  _pendingCheck: false,
  // 是否为轮询主导标签页
  _isLeader: false,
  // BroadcastChannel 监听取消函数
  _bcUnlisten: null,
  _banner: null,
  _indicator: null,
  // 是否已启动
  _started: false,

  // 带超时的 fetch
  // 用 AbortController 而非依赖外部超时：长时间无响应时能主动中断并走重试，而不是永久挂起
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
      // 网络错误保留原始错误：重试判断依赖 err.name，换成超时文案会误判为不可重试
      throw err;
    }
  },

  // 安全解析 JSON
  // 后端异常时可能返回 HTML 错误页，直接 response.json() 会抛出难以归因的解析错误
  async _safeJsonParse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch (_) {
      console.warn('[HealthMonitor] 响应非 JSON，前 80 字符:', text.slice(0, 80));
      return null;
    }
  },

  // 带重试的检查
  async _checkWithRetry(retriesLeft) {
    for (let attempt = 0; attempt <= retriesLeft; attempt++) {
      try {
        const res = await this._fetchWithTimeout('/api/health');
        if (!res.ok) {
          // 非 2xx 仍尝试解析 payload 中的 status：后端降级时可能返回 503 + 结构化状态
          const data = await this._safeJsonParse(res);
          return this._classify(data);
        }
        const data = await this._safeJsonParse(res);
        return this._classify(data);
      } catch (err) {
        if (attempt < retriesLeft) {
          console.warn(`[HealthMonitor] 检查失败 (${attempt + 1}/${retriesLeft + 1}):`, err.message, '→ 重试...');
          // 递增延迟：连续失败时快速重试只会加重后端负担
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        } else {
          console.error(`[HealthMonitor] 检查失败，已用尽 ${retriesLeft + 1} 次重试:`, err.message);
          return { status: 'unreachable', checks: null, error: err.message };
        }
      }
    }
    return { status: 'unreachable', checks: null };
  },

  // 归一化响应
  // 统一收敛为 `{ status, checks }`，status 只保留 ok / degraded / unreachable 三态
  _classify(data) {
    if (!data || !data.status) {
      return { status: 'unreachable', checks: null };
    }
    return {
      status: data.status === 'ok' ? 'ok' : 'degraded',
      checks: data.checks || null,
    };
  },

  // 启动轮询
  startPolling(interval) {
    this.stopPolling();
    if (interval !== undefined) {
      this._pollInterval = interval;
    }
    this._scheduleNextPoll();
  },

  // 调度下一次轮询
  // 用 setTimeout 链代替 setInterval：请求耗时会计入间隔，setInterval 会在慢响应下堆积多个并发探测
  _scheduleNextPoll() {
    if (!this._started) return;

    const interval = document.hidden ? DEFAULTS.hiddenInterval : this._pollInterval;

    this._pollTimer = setTimeout(async () => {
      if (!this._started) return;
      if (this._isLeader) {
        await this._runCheck();
      }
      this._scheduleNextPoll();
    }, interval);
  },

  // 应用指数退避
  // 成功即复位到初始间隔，失败按因子放大并封顶
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

    // 仅在计数变化或达到 5 的倍数时输出：否则长期离线会刷屏控制台
    if (this._consecutiveFailures !== prevFailures || this._consecutiveFailures % 5 === 0) {
      console.log(`[HealthMonitor] 退避: failures=${this._consecutiveFailures}, interval=${this._pollInterval / 1000}s`);
    }
  },

  // 停止轮询
  stopPolling() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
  },

  // 执行单次检查
  // 并发锁保护：手动点击与自动轮询可能同时触发，重复探测会放大后端压力
  async _runCheck() {
    if (this._pendingCheck) {
      return;
    }
    this._pendingCheck = true;

    try {
      const prevStatus = this._currentStatus;
      const result = await this._checkWithRetry(DEFAULTS.maxRetries);
      const newStatus = result.status;

      this._applyBackoff(newStatus === 'ok');
      this._currentStatus = newStatus;
      this._currentChecks = result.checks;

      this._updateIndicator(newStatus, result.checks);
      this._notifyCallbacks(result);

      this._broadcastStatus(newStatus, result.checks);

      // 状态变化走跃迁处理（弹提示/横幅），未变化只静默发事件，避免每次轮询都打扰用户
      if (newStatus !== prevStatus) {
        this._handleTransition(prevStatus, newStatus, result.checks);
      } else {
        this._emitStatusEvent(newStatus, result);
      }

      // 恢复成功后立即重置轮询节奏，让状态指示尽快回到高频探测
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

  // 处理状态跃迁
  _handleTransition(from, to, checks) {
    console.log(`[HealthMonitor] 状态变化: ${from} → ${to}`);

    if (to === 'degraded') {
      // 降级时列出具体服务名：只提示「部分服务异常」会让用户无从判断可否继续操作
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
      // 仅在从异常恢复时提示：首次加载即为 ok 不需要弹「已恢复」
      if (from === 'degraded' || from === 'unreachable') {
        showToast(UI.toast.monitorRestored, false);
      }
      this._hideBanner();
      EventBus.emit(EVENTS.HEALTH_CHECK_PASSED, { status: to, checks });
      this._toggleAdminControls(false);
    }
  },

  // 广播状态事件
  _emitStatusEvent(status, result) {
    if (status === 'ok') EventBus.emit(EVENTS.HEALTH_CHECK_PASSED, result);
    else if (status === 'degraded') EventBus.emit(EVENTS.HEALTH_CHECK_DEGRADED, result);
    else EventBus.emit(EVENTS.HEALTH_CHECK_FAILED, result);
  },

  // 获取降级的服务名列表
  _getFailedServices(checks) {
    if (!checks) return [];
    const failed = [];
    if (checks.database && checks.database.status !== 'ok') failed.push(UI.monitor.serviceDb);
    if (checks.storage && checks.storage.status !== 'ok') failed.push(UI.monitor.serviceStorage);
    return failed;
  },

  // 建立多标签页同步
  // 用 tabId 字典序选举 leader，ID 最小者主导轮询；比时间戳选举更稳定，不受时钟漂移影响
  _setupTabSync() {
    BroadcastHelper.init(BC_CHANNEL);

    this._bcUnlisten = BroadcastHelper.on('health-sync', (msg) => {
      const { status, checks, leaderId } = msg.payload || {};
      if (leaderId && leaderId !== this._tabId) {
        // 收到主导标签页的结果即被动更新 UI，本页不发起探测
        this._currentStatus = status;
        this._currentChecks = checks;
        this._updateIndicator(status, checks);
      }
    });

    this._tabId = 'tab-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);

    BroadcastHelper.send('health-join', { tabId: this._tabId });

    // 收到 join 消息即重新选举：新标签页加入后可能取代当前 leader
    const unlistenJoin = BroadcastHelper.on('health-join', (msg) => {
      const otherId = msg.payload && msg.payload.tabId;
      if (otherId) {
        // 字典序最小者为主导
        this._isLeader = this._tabId <= otherId;
      }
    });

    BroadcastHelper.on('health-leave', (msg) => {
      const leftId = msg.payload && msg.payload.tabId;
      if (leftId && leftId < this._tabId) {
        // 比当前更小的 id 离开 → 当前可能成为新 leader
        this._isLeader = true;
        console.log('[HealthMonitor] 成为主导标签页 (原主导已离开)');
        if (this._started) this._scheduleNextPoll();
      }
    });

    // 初始假设自己是 leader，再等 500ms 看是否有更小的 tabId 出现
    // 延迟窗口内若被替换则放弃轮询权，避免单开页面时无谓等待
    this._isLeader = true;
    setTimeout(() => {
      if (this._isLeader) {
        console.log('[HealthMonitor] 确认为主导标签页 (tabId:', this._tabId, ')');
        if (this._started) this._scheduleNextPoll();
      } else {
        console.log('[HealthMonitor] 从属标签页，不执行主动轮询');
      }
    }, 500);

    window.addEventListener('beforeunload', () => {
      BroadcastHelper.send('health-leave', { tabId: this._tabId });
    }, { once: true });
  },

  // 广播当前状态
  _broadcastStatus(status, checks) {
    BroadcastHelper.send('health-sync', {
      status,
      checks,
      leaderId: this._tabId,
    });
  },

  // 更新状态指示器
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

    // 降级时在指示器内展开具体服务名，无需悬停即可看到故障范围
    if (detail) {
      if (status === 'degraded' && checks) {
        const failed = this._getFailedServices(checks);
        detail.textContent = failed.length > 0 ? UI.monitor.detailDegraded(failed.join('、')) : '';
      } else {
        detail.textContent = '';
      }
    }

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

  // 显示状态横幅
  // 单例保护：_banner 已存在时直接返回，防止多次跃迁叠加出多条横幅
  _showBanner(level, failedServices = []) {
    if (this._banner) return;
    this._banner = document.createElement('div');
    this._banner.id = BANNER_ID;

    if (level === 'unreachable') {
      this._banner.className = 'health-banner error';
      this._banner.textContent = UI.monitor.bannerUnreachable;
    } else {
      this._banner.className = 'health-banner warning';
      this._banner.textContent = failedServices.length > 0
        ? UI.monitor.bannerDegradedDetail(failedServices.join('、'))
        : UI.monitor.bannerDegraded;
    }
    document.body.prepend(this._banner);
  },

  // 隐藏横幅
  _hideBanner() {
    if (this._banner) {
      this._banner.remove();
      this._banner = null;
    }
  },

  // 禁用/恢复管理操作
  // 后端不可达时禁用写入类控件，避免用户操作后才发现保存失败
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

  // 手动检查（并发安全）
  // 已有检查进行中则返回上次结果：用户快速连点指示器时不重复探测
  async check() {
    if (this._pendingCheck) return { status: this._currentStatus, checks: this._currentChecks };
    return this._checkWithRetry(DEFAULTS.maxRetries);
  },

  // 订阅状态变化
  onStatusChange(callback) {
    if (typeof callback === 'function') {
      this._callbacks.push(callback);
    }
  },

  // 通知订阅者
  _notifyCallbacks(status) {
    this._callbacks.forEach(cb => {
      try { cb(status); } catch (e) { console.error('[HealthMonitor] 回调错误:', e); }
    });
  },

  // 初始化
  init() {
    this._indicator = document.getElementById('healthIndicator');
    if (this._indicator) {
      this._indicator.addEventListener('click', () => {
        this._runCheck();
      });
    }

    this._setupTabSync();

    // 页面可见性切换时立即校准：后台期间定时器被节流，切回前台若仍是异常状态需马上复查
    this._visibleHandler = () => {
      if (!this._started) return;
      if (!document.hidden) {
        if (this._currentStatus !== 'ok') {
          this._runCheck();
        }
      }
      if (this._isLeader) {
        this._scheduleNextPoll();
      }
    };
    document.addEventListener('visibilitychange', this._visibleHandler);

    console.log('[HealthMonitor] 初始化完成');
  },

  // 启动
  // 首检不等待 start 返回：由 _scheduleNextPoll 串起后续节奏
  start() {
    this._started = true;
    this._pollInterval = DEFAULTS.initialInterval;
    if (this._isLeader) {
      this._runCheck().then(() => {
        if (this._started) this._scheduleNextPoll();
      });
    }
    console.log('[HealthMonitor] 已启动');
  },

  // 销毁
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
