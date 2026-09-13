// ！后台状态视图
// 把后台关心的全局状态包装为 getter/setter，读写统一经 AppState 与 MUTATIONS。
// 不直接改 AppState 内部对象：绕过 commit 会让订阅方收不到变更通知。
import { AppState } from '../core/app-state.js';
import { MUTATIONS } from '../core/state-mutations.js';

export const AdminState = {
  get isLoggedIn() {
    return AppState.get('isLoggedIn');
  },
  set isLoggedIn(value) {
    AppState.commit(MUTATIONS.SET_LOGGED_IN, value);
  },

  get panelCollapsed() {
    return AppState.get('panelCollapsed');
  },
  set panelCollapsed(value) {
    AppState.commit(MUTATIONS.SET_PANEL_COLLAPSED, value);
  },

  // 右位置单独设置，但仍走 SET_PANEL_POSITION 并只带 right 字段：
  // 复用同一 mutation 可保持位置变更的通知口径一致，无需为单轴新增 mutation
  get panelRight() {
    return AppState.get('panelRight');
  },
  set panelRight(value) {
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: value });
  },

  get panelBottom() {
    return AppState.get('panelBottom');
  },
  set panelBottom(value) {
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { bottom: value });
  },

  get decoEditing() {
    return AppState.get('decoEditing');
  },
  set decoEditing(value) {
    AppState.commit(MUTATIONS.SET_DECO_EDITING, value);
  },

  // 拖拽中间态留在本地而非 AppState：拖拽位移每帧变化，提交到全局会引发无谓的订阅风暴
  isDraggingPanel: false,
  dragStartX: 0,
  dragStartY: 0,
};
