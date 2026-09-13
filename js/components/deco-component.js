// ！贴纸组件适配
// 把 DecoShelf 包装成 ComponentManager 标准组件：组件只负责生命周期挂钩，贴纸逻辑仍在 service 层。
// 依赖 storage：贴纸位置与库数据都要等存储适配器就绪后才能读取。
import { DecoShelf } from '../services/deco.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';

export var decoComponent = {
  name: 'deco',

  config: {
    dependencies: ['storage'],
    desktopOnly: false,
    requiresAuth: false,
  },

  // 加载贴纸库
  init: async function () {
    const items = await DecoShelf.loadLibrary();
    console.log('[deco-component] init: 已加载 ' + (items ? items.length : 0) + ' 张贴纸');
    return DecoShelf;
  },

  // 渲染到页面并广播库变更
  mount: async function (instance) {
    instance._renderAllDecos();
    EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
    console.log('[deco-component] mount: 贴纸已渲染到页面');
    return instance;
  },

  // 清理贴纸 DOM 与长按监听
  unmount: async function (instance) {
    document.querySelectorAll('[id^="deco-"]').forEach(function (el) {
      // 长按监听挂在 document 上，元素移除前必须显式解绑，否则监听器泄漏
      if (el._longPressCleanup) {
        el._longPressCleanup();
        delete el._longPressCleanup;
      }
      el.remove();
    });

    if (instance._resizeHandler) {
      window.removeEventListener('resize', instance._resizeHandler);
      instance._resizeHandler = null;
    }

    console.log('[deco-component] unmount: 贴纸 DOM 已清理');
    return instance;
  },
};

export default decoComponent;
