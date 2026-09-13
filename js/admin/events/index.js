// ！后台事件聚合
// 面板事件的统一绑定与解绑入口：右键菜单、面板事件委托、折叠按钮。
// 供 AdminUI 在面板显隐时调用，避免各处零散地绑事件。
import { ContextMenu } from './context-menu.js';
import { AdminPanel } from '../panel/index.js';

export const AdminEvents = {
  bindEvents: function () {
    console.log('[AdminEvents] 绑定所有事件...');

    // 右键菜单与面板相互独立，先初始化不受面板状态影响
    if (ContextMenu && typeof ContextMenu.init === 'function') {
      ContextMenu.init();
    }

    // 面板事件委托器须重建：面板 DOM 每次渲染都会被替换，旧委托指向已废弃的节点
    if (AdminPanel && typeof AdminPanel.bindEvents === 'function') {
      AdminPanel.bindEvents();
    }

    // 折叠按钮单独直绑：它由 render.js 注入，可能晚于事件委托建立，故在此补一次
    if (AdminPanel && typeof AdminPanel._bindToggleIconDirect === 'function') {
      AdminPanel._bindToggleIconDirect();
    }

    console.log('[AdminEvents] 所有事件绑定完成');
  },

  unbindEvents: function () {
    console.log('[AdminEvents] 解绑所有事件...');

    if (ContextMenu && typeof ContextMenu.hide === 'function') {
      ContextMenu.hide();
    }

    // 面板侧事件统一由 panel/events 清理
    if (AdminPanel && typeof AdminPanel.unbindEvents === 'function') {
      AdminPanel.unbindEvents();
    }

    console.log('[AdminEvents] 所有事件已解绑');
  },

  // 重绑：先解后绑，保证任何时刻只有一份生效的事件委托
  rebind: function () {
    this.unbindEvents();
    this.bindEvents();
  },
};
