import { DOMRefs } from '../core/dom-refs.js';
import { AppState } from '../core/app-state.js';
import { Utils } from '../utils.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { UIIcon } from '../services/ui-icon.js';

export const AdminPosition = {
  loadPosition: function () {
    try {
      const saved = Utils.storage.get('admin_panel_position');
      if (saved) {
        if (typeof saved.right === 'number' && typeof saved.bottom === 'number') {
          AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: saved.right, bottom: saved.bottom });
          const maxRight = window.innerWidth - 50;
          const maxBottom = window.innerHeight - 50;
          if (AppState.get('panelRight') > maxRight) AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: maxRight });
          if (AppState.get('panelBottom') > maxBottom) AppState.commit(MUTATIONS.SET_PANEL_POSITION, { bottom: maxBottom });
          return;
        }
      }
    } catch (_) {
      // 忽略解析错误
    }
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: 20, bottom: 20 });
  },

  savePosition: function () {
    try {
      Utils.storage.set('admin_panel_position', {
        right: AppState.get('panelRight'),
        bottom: AppState.get('panelBottom')
      });
    } catch (_) {
      // 忽略存储错误
    }
  },

  applyPosition: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    if (panel) {
      const right = AppState.get('panelRight');
      const bottom = AppState.get('panelBottom');
      panel.style.right = right + 'px';
      panel.style.bottom = bottom + 'px';
      panel.style.left = 'auto';
      panel.style.top = 'auto';
      panel.style.cursor = 'move';
    }
  },

  applyCollapsedState: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    if (!panel) return;
    const isCollapsed = AppState.get('panelCollapsed');
    console.log('[AdminPosition] 应用折叠状态:', isCollapsed);
    const toggle = DOMRefs.get(DOMRefs.admin.toggleIcon);
    if (isCollapsed) {
      panel.classList.add('collapsed');
      if (toggle) {
        toggle.classList.add('arrow-r0');
        toggle.classList.remove('arrow-r90');
      }
    } else {
      panel.classList.remove('collapsed');
      if (toggle) {
        toggle.classList.add('arrow-r90');
        toggle.classList.remove('arrow-r0');
      }
    }
    // 若设置了控制台折叠按钮自定义图标（含图标包 arrow 外部覆盖），覆盖默认箭头
    UIIcon.applyAdminPanelIcon();
  },

  saveCollapsedState: function () {
    try {
      Utils.storage.set('admin_panel_collapsed', AppState.get('panelCollapsed'));
    } catch (_) {
      // 忽略存储错误
    }
  },

  toggleCollapse: function () {
    const current = AppState.get('panelCollapsed');
    console.log('[AdminPosition] 切换折叠状态，当前:', current);
    const newState = !current;
    AppState.commit(MUTATIONS.SET_PANEL_COLLAPSED, newState);
    this.saveCollapsedState();
    this.applyCollapsedState();
    console.log('[AdminPosition] 切换后状态:', newState);
  },
};

