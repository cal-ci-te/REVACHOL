// ！后台面板拖拽
// 支持鼠标与触摸两种方式拖动管理面板，位置以 right/bottom 提交到 AppState。
// 拖拽中间态（起点偏移）留在 AdminState，避免每帧位移都触发全局订阅。
import { DOMRefs } from '../core/dom-refs.js';
import { AppState } from '../core/app-state.js';
import { AdminState } from './state.js';
import { AdminPosition } from './position.js';
import { MUTATIONS } from '../core/state-mutations.js';

export const AdminDrag = {
  // 初始化拖拽并注册监听
  // 先 removeEventListener 再 add：面板可被反复打开，不先摘除会累积多份监听
  // 处理函数用 bind 生成新引用并另存字段，正是为了让 removeEventListener 能精确匹配
  initDrag: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    const header = DOMRefs.get(DOMRefs.admin.header);
    if (!panel || !header) {
      console.warn('[Admin] 面板或标题不存在，无法初始化拖拽');
      return;
    }

    header.style.cursor = 'grab';
    header.style.userSelect = 'none';

    header.removeEventListener('mousedown', this._startDrag);
    header.removeEventListener('touchstart', this._startDragTouch);

    this._startDrag = this.startDrag.bind(this);
    this._startDragTouch = this.startDragTouch.bind(this);

    header.addEventListener('mousedown', this._startDrag);
    header.addEventListener('touchstart', this._startDragTouch, { passive: false });

    document.removeEventListener('mousemove', this._onDrag);
    document.removeEventListener('touchmove', this._onDragTouch);
    document.removeEventListener('mouseup', this._stopDrag);
    document.removeEventListener('touchend', this._stopDrag);

    this._onDrag = this.onDrag.bind(this);
    this._onDragTouch = this.onDragTouch.bind(this);
    this._stopDrag = this.stopDrag.bind(this);

    document.addEventListener('mousemove', this._onDrag);
    document.addEventListener('touchmove', this._onDragTouch, { passive: false });
    document.addEventListener('mouseup', this._stopDrag);
    document.addEventListener('touchend', this._stopDrag);

    console.log('[Admin] 拖拽已初始化');
  },

  // 鼠标按下：记录光标与面板左上的偏移量
  // 记偏移而非绝对坐标，可让面板跟随光标时保持抓取点不动
  startDrag: function (e) {
    // 折叠图标有自己的点击语义，不应被当作拖拽起点
    if (e.target.closest('.toggle-icon')) return;
    AdminState.isDraggingPanel = true;
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    const rect = panel.getBoundingClientRect();
    AdminState.dragStartX = e.clientX - rect.left;
    AdminState.dragStartY = e.clientY - rect.top;
    // 拖拽期间关闭过渡，否则面板会滞后于光标
    panel.style.transition = 'none';
    e.preventDefault();
  },

  // 触摸按下：与鼠标同逻辑，坐标取首个触点
  startDragTouch: function (e) {
    if (e.target.closest('.toggle-icon')) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    AdminState.isDraggingPanel = true;
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    const rect = panel.getBoundingClientRect();
    AdminState.dragStartX = touch.clientX - rect.left;
    AdminState.dragStartY = touch.clientY - rect.top;
    panel.style.transition = 'none';
  },

  // 鼠标拖拽中：把光标位置换算为 right/bottom 并夹入视口
  // 位置由「视口尺寸 − 光标位置 − 面板尺寸」得出，与 right/bottom 语义一致
  // 上限减去 50px 保证标题栏始终留有可再次抓取的区域
  onDrag: function (e) {
    if (!AdminState.isDraggingPanel) return;
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    const panelWidth = panel.offsetWidth || 48;
    const panelHeight = panel.offsetHeight || 50;
    let newRight = window.innerWidth - (e.clientX - AdminState.dragStartX + panelWidth);
    let newBottom = window.innerHeight - (e.clientY - AdminState.dragStartY + panelHeight);
    newRight = Math.max(0, Math.min(newRight, window.innerWidth - 50));
    newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - 50));
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: newRight, bottom: newBottom });
    panel.style.right = newRight + 'px';
    panel.style.bottom = newBottom + 'px';
    panel.style.left = 'auto';
    panel.style.top = 'auto';
  },

  // 触摸拖拽中：与 onDrag 同逻辑，坐标取首个触点
  onDragTouch: function (e) {
    if (!AdminState.isDraggingPanel) return;
    const touch = e.touches[0];
    if (!touch) return;
    e.preventDefault();
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    const panelWidth = panel.offsetWidth || 48;
    const panelHeight = panel.offsetHeight || 50;
    let newRight = window.innerWidth - (touch.clientX - AdminState.dragStartX + panelWidth);
    let newBottom = window.innerHeight - (touch.clientY - AdminState.dragStartY + panelHeight);
    newRight = Math.max(0, Math.min(newRight, window.innerWidth - 50));
    newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - 50));
    AppState.commit(MUTATIONS.SET_PANEL_POSITION, { right: newRight, bottom: newBottom });
    panel.style.right = newRight + 'px';
    panel.style.bottom = newBottom + 'px';
    panel.style.left = 'auto';
    panel.style.top = 'auto';
  },

  // 结束拖拽：恢复过渡并持久化最终位置
  // 只在确实处于拖拽中才落盘，避免单击标题栏产生无意义的写存储
  stopDrag: function () {
    if (AdminState.isDraggingPanel) {
      AdminState.isDraggingPanel = false;
      const panel = DOMRefs.get(DOMRefs.admin.panel);
      if (panel) panel.style.transition = '';
      AdminPosition.savePosition();
    }
  },
};
