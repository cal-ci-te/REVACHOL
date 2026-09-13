// ！后台面板定位与折叠
// 面板位置与折叠态的读写：持久化到本地存储，并折算为 DOM 样式。
// 位置一律用 right/bottom 表达，使面板在宽度变化时保持右下角不动。
import { DOMRefs } from '../core/dom-refs.js';
import { AppState } from '../core/app-state.js';
import { Utils } from '../utils.js';
import { MUTATIONS } from '../core/state-mutations.js';
import { UIIcon } from '../services/ui-icon.js';

export const AdminPosition = {
  // 读取面板位置并夹入视口
  // 存档坐标可能来自更宽的屏幕，直接套用会让面板落到视口外，故按当前视口上限收紧
  // 无存档或解析失败时回落默认右下角
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
      // 存档解析失败，改用默认位置
    }
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: 20, bottom: 20 });
  },

  // 持久化面板位置
  savePosition: function () {
    try {
      Utils.storage.set('admin_panel_position', {
        right: AppState.get('panelRight'),
        bottom: AppState.get('panelBottom')
      });
    } catch (_) {
      // 存储不可用时静默忽略，不阻断交互
    }
  },

  // 把状态中的位置写入面板内联样式
  // 同时清掉 left/top：与 right/bottom 并存时定位结果不可预期
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

  // 应用折叠态到面板类名与箭头方向
  // 折叠与展开是互斥的类名与箭头类，须成对增删而非只加不减
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
    // 自定义图标（含图标包 arrow 外部覆盖）优先于默认箭头，故在其后应用
    UIIcon.applyAdminPanelIcon();
  },

  // 持久化折叠态
  saveCollapsedState: function () {
    try {
      Utils.storage.set('admin_panel_collapsed', AppState.get('panelCollapsed'));
    } catch (_) {
      // 存储不可用时静默忽略
    }
  },

  // 切换折叠态并立即落盘与生效
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
