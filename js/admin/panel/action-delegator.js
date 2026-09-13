// ！面板动作委托
// 以 data-action 属性为核心的事件委托器：面板内所有交互统一在此派发到注册的处理器。
// 用委托而非逐元素绑定，是因为面板内容会被整体重渲染，逐个绑定既繁琐又容易遗漏解绑。

export const ActionDelegator = {
  _container: null,
  _handlers: {},
  _boundEvents: false,

  // 注册单个动作处理器
  // 覆盖已存在的同名动作时告警而非拒绝：便于后续模块按需替换前一个实现，同时留下痕迹
  register(action, handler) {
    if (typeof handler !== 'function') {
      console.warn(`[ActionDelegator] "${action}" 的处理器不是函数`);
      return;
    }
    if (this._handlers[action]) {
      console.warn(`[ActionDelegator] "${action}" 已被注册，将被覆盖`);
    }
    this._handlers[action] = handler;
    console.log(`[ActionDelegator] 注册 action: ${action}`);
  },

  // 批量注册，键为动作名、值为处理器
  registerAll(handlerMap) {
    for (const [action, handler] of Object.entries(handlerMap)) {
      this.register(action, handler);
    }
  },

  // 在容器上建立委托
  // 三类事件分别覆盖按钮点击、下拉切换与文本输入
  // 重复初始化时先 destroy：否则会把同一处理器重复挂到容器上，导致事件被处理多次
  init(container) {
    if (!container) {
      console.error('[ActionDelegator] 容器不存在，初始化失败');
      return;
    }
    if (this._boundEvents) {
      this.destroy();
    }
    this._container = container;
    const eventTypes = ['click', 'change', 'input'];
    eventTypes.forEach((type) => {
      container.addEventListener(type, this._handleEvent);
    });
    this._boundEvents = true;
    console.log('[ActionDelegator] 已初始化，容器:', container.id || container.tagName);
  },

  // 拆除委托并清空处理器
  // 一并清空处理器表：保留旧处理器会让下次注册触发「已被注册」的误导性告警
  destroy() {
    if (!this._boundEvents || !this._container) return;
    const eventTypes = ['click', 'change', 'input'];
    eventTypes.forEach((type) => {
      this._container.removeEventListener(type, this._handleEvent);
    });
    this._boundEvents = false;
    this._container = null;
    this._handlers = {};
    console.log('[ActionDelegator] 已销毁');
  },

  // 事件入口：定位 data-action 元素并派发
  _handleEvent(event) {
    const target = event.target;
    if (!target) return;

    // 向上查找最近的 data-action 元素：点击常落在按钮内的图标或文本节点上
    const actionElement = target.closest('[data-action]');
    if (!actionElement) return;

    const action = actionElement.dataset.action;
    if (!action) return;

    // change 只对表单控件有意义：可避免 select 内部的无关冒泡被当作动作
    if (event.type === 'change') {
      const tag = target.tagName.toLowerCase();
      if (!['select', 'input'].includes(tag)) return;
    }

    const handler = ActionDelegator._handlers[action];
    if (!handler) {
      console.warn(`[ActionDelegator] 未找到 action 的处理器: ${action}`);
      return;
    }

    // 按钮与链接按下时阻止默认行为：面板内动作均由 JS 处理，不需要浏览器默认跳转或提交
    if (actionElement.tagName === 'BUTTON' || actionElement.tagName === 'A') {
      event.preventDefault();
    }

    // 逐个 try-catch：单个处理器报错不应中断事件流，也不应影响其他动作的可用性
    try {
      handler(event);
    } catch (error) {
      console.error(`[ActionDelegator] 执行处理器 "${action}" 时出错:`, error);
    }
  },
};
