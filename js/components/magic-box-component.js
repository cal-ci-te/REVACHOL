// ！魔法箱组件适配
// 把 BoxManager 包装成 ComponentManager 标准组件：组件只管生命周期，箱子逻辑在 BoxManager 内。
// 用模块级 _boxInstance 持有实例：BoxManager 自身单例，多次 init 不应产生多份 DOM。
import { BoxManager } from '../ui/components/magic-box/index.js';

let _boxInstance = null;

export var magicBoxComponent = {
  name: 'magic-box',

  config: {
    dependencies: [],
    desktopOnly: true,
    requiresAuth: false,
  },

  // 创建箱子实例
  init: async function () {
    _boxInstance = new BoxManager();
    console.log('[magic-box-component] init: BoxManager 已创建');
    return _boxInstance;
  },

  // 渲染并绑定交互
  mount: async function (instance) {
    if (!instance || typeof instance.init !== 'function') {
      console.warn('[magic-box-component] mount: 无效的实例');
      return instance;
    }

    instance.init();
    console.log('[magic-box-component] mount: 箱子已渲染并绑定交互');
    return instance;
  },

  // 禁用拖拽并移除 DOM
  unmount: async function (instance) {
    if (instance) {
      // 先停拖拽再移除节点：拖拽监听挂在 document 上，先删 DOM 会让监听失去目标
      if (instance._drag && typeof instance._drag.disable === 'function') {
        instance._drag.disable();
      }

      const el = instance._renderer ? instance._renderer.getElement() : null;
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }

      // 右键菜单挂在 body 下，需单独回收，否则残留成孤儿节点
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
