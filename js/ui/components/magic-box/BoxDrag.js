// ！魔法箱拖拽
// 处理箱子的鼠标/触摸拖拽，并用 5px 阈值区分「点击」与「拖拽」。
// 移动监听挂到 document 而非元素本身：指针移出箱子范围后仍要继续跟手。
const DRAG_THRESHOLD = 5;

export class BoxDrag {
  // element 为箱子根元素；callbacks 提供 onClick / onDragStart / onDragMove / onDragEnd / onContextMenu / isAdmin
  constructor(element, callbacks = {}) {
    this._el = element;
    this._onClick = callbacks.onClick || null;
    this._onDragStart = callbacks.onDragStart || null;
    this._onDragMove = callbacks.onDragMove || null;
    this._onDragEnd = callbacks.onDragEnd || null;
    this._onContextMenu = callbacks.onContextMenu || null;
    this._isAdmin = callbacks.isAdmin || (() => false);

    this._enabled = false;
    this._dragging = false;
    this._startX = 0;
    this._startY = 0;
    this._startLeft = 0;
    this._startTop = 0;

    // 保存绑定后的方法引用，removeEventListener 要求同一引用才生效
    this._onMouseDown = null;
    this._onTouchStart = null;
  }

  // 启用拖拽
  enable() {
    if (this._enabled) return;
    if (!this._el) return;

    const self = this;

    this._onMouseDown = function (e) {
      if (e.button !== 0) return;
      e.preventDefault();
      self._startDrag(e.clientX, e.clientY);
    };

    this._onTouchStart = function (e) {
      // 多指手势不参与拖拽，避免与页面缩放冲突
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      self._startDrag(touch.clientX, touch.clientY);
    };

    this._el.addEventListener('mousedown', this._onMouseDown);
    this._el.addEventListener('touchstart', this._onTouchStart, { passive: true });

    // 右键菜单
    this._onContextMenuHandler = function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (self._onContextMenu) self._onContextMenu(e.clientX, e.clientY);
    };
    this._el.addEventListener('contextmenu', this._onContextMenuHandler);

    this._enabled = true;
  }

  // 停用拖拽（飞回动画期间使用，避免用户中途再次拖起）
  disable() {
    if (!this._enabled) return;
    if (this._el) {
      if (this._onMouseDown) {
        this._el.removeEventListener('mousedown', this._onMouseDown);
      }
      if (this._onTouchStart) {
        this._el.removeEventListener('touchstart', this._onTouchStart);
      }
      if (this._onContextMenuHandler) {
        this._el.removeEventListener('contextmenu', this._onContextMenuHandler);
      }
    }
    this._enabled = false;
    this._dragging = false;
  }

  // 是否拖拽中
  get isDragging() { return this._dragging; }

  // 记录起点并开始跟踪
  _startDrag(clientX, clientY) {
    this._dragging = false;
    this._startX = clientX;
    this._startY = clientY;

    // 优先取内联 left/top；缺失时回退 rect，以兼容用 right/bottom 定位的样式
    const style = this._el ? this._el.style : {};
    let left = parseFloat(style.left);
    let top = parseFloat(style.top);
    if (isNaN(left) || isNaN(top)) {
      const rect = this._el ? this._el.getBoundingClientRect() : { left: 0, top: 0 };
      if (isNaN(left)) left = rect.left;
      if (isNaN(top)) top = rect.top;
    }
    this._startLeft = left;
    this._startTop = top;

    this._bindDocumentEvents();
  }

  // 绑定文档级移动/抬起监听
  _bindDocumentEvents() {
    const self = this;
    const getClient = (e) => {
      if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
      return { x: e.clientX, y: e.clientY };
    };

    const onMove = function (e) {
      const { x, y } = getClient(e);
      const dx = x - self._startX;
      const dy = y - self._startY;
      const dist = Math.hypot(dx, dy);

      // 首次超过阈值才进入拖拽态，此前只算候选
      if (!self._dragging && dist > DRAG_THRESHOLD) {
        self._dragging = true;
        // 拖拽期间禁用文本选择，否则会选中沿途文字
        document.body.style.userSelect = 'none';
        document.body.style.webkitUserSelect = 'none';
        if (self._onDragStart) self._onDragStart();
      }

      if (self._dragging) {
        e.preventDefault();
        const newLeft = self._startLeft + dx;
        const newTop = self._startTop + dy;
        if (self._onDragMove) self._onDragMove(dx, dy, newLeft, newTop);
      }
    };

    const onEnd = function (e) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      if (!self._dragging) {
        // 未越过阈值 → 判为点击
        if (self._onClick) self._onClick();
      } else {
        const { x, y } = getClient(e);
        const dx = x - self._startX;
        const dy = y - self._startY;
        const finalLeft = self._startLeft + dx;
        const finalTop = self._startTop + dy;
        const admin = self._isAdmin();
        if (self._onDragEnd) self._onDragEnd(finalLeft, finalTop, admin);
      }
      self._dragging = false;
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  }

  // 销毁并清空引用
  destroy() {
    this.disable();
    this._onClick = null;
    this._onDragStart = null;
    this._onDragMove = null;
    this._onDragEnd = null;
    this._onContextMenu = null;
    this._onContextMenuHandler = null;
    this._isAdmin = null;
    this._el = null;
  }
}
