// 魔法箱子组件适配器
// 将 BoxManager 包装为 ComponentManager 标准组件。
// init: 加载计数状态。mount: 渲染箱子 DOM + 绑定交互。unmount: 清理事件和 DOM。
import { BoxManager } from '../ui/components/magic-box/index.js';

let _boxInstance = null;

export var magicBoxComponent = {
  name: 'magic-box',

  config: {
    dependencies: [],
    desktopOnly: true,
    requiresAuth: false,
  },

  init: async function () {
    _boxInstance = new BoxManager();
    console.log('[magic-box-component] init: BoxManager 已创建');
    return _boxInstance;
  },

  mount: async function (instance) {
    if (!instance || typeof instance.init !== 'function') {
      console.warn('[magic-box-component] mount: 无效的实例');
      return instance;
    }

    instance.init();
    console.log('[magic-box-component] mount: 箱子已渲染并绑定交互');
    return instance;
  },

  unmount: async function (instance) {
    if (instance) {
      if (instance._drag && typeof instance._drag.disable === 'function') {
        instance._drag.disable();
      }

      const el = instance._renderer ? instance._renderer.getElement() : null;
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }

      if (instance._ctxMenuEl && instance._ctxMenuEl.parentNode) {
        instance._ctxMenuEl.parentNode.removeChild(instance._ctxMenuEl);
      }

      instance._mounted = false;
      console.log('[magic-box-component] unmount: 箱子已清理');
    }

    _boxInstance = null;
    return instance;
  },
};

export default magicBoxComponent;
