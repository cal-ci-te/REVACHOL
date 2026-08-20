// 贴纸系统组件适配器
// 将 DecoShelf 包装为 ComponentManager 标准组件。
// init: 加载贴纸数据。mount: 渲染贴纸到 DOM。unmount: 清理 DOM 和事件。
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

  init: async function () {
    const items = await DecoShelf.loadLibrary();
    console.log('[deco-component] init: 已加载 ' + (items ? items.length : 0) + ' 张贴纸');
    return DecoShelf;
  },

  mount: async function (instance) {
    instance._renderAllDecos();
    EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
    console.log('[deco-component] mount: 贴纸已渲染到页面');
    return instance;
  },

  unmount: async function (instance) {
    document.querySelectorAll('[id^="deco-"]').forEach(function (el) {
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
