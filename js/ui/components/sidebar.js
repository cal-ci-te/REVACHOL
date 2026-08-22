import { Utils } from '../../utils.js';
import { DirectoryIcon } from '../../services/directory-icon.js';

export const Sidebar = {
  sidebar: null,
  overlay: null,
  directoryTreeContainer: null,

  isDraggingSidebar: false,
  isDragging: false,
  _dragOccurred: false,
  dragStartMouseX: 0,
  dragStartMouseY: 0,
  dragStartX: 0,
  dragStartY: 0,
  sidebarLeft: 20,
  sidebarTop: 80,
  sidebarCollapsed: true,

  currentThreshold: 5,

  init: function (sidebarEl, overlayEl, treeContainer) {
    console.log('[Sidebar] 初始化...');
    this.sidebar = sidebarEl;
    this.overlay = overlayEl;
    this.directoryTreeContainer = treeContainer;
    this.loadState();
    this.loadPosition();
    this.applyPosition();
    this.applyCollapsedState();
    if (this.sidebar) {
      this.sidebar.style.display = 'block';
    }
    this.bindEvents();
    console.log('[Sidebar] 初始化完成');
  },

  loadState: function () {
    const saved = Utils.storage.get('sidebar_state');
    const isMobile = window.innerWidth <= 768;
    if (saved) {
      this.sidebarCollapsed = saved.collapsed !== undefined ? saved.collapsed : true;
      this.sidebarLeft = saved.left || 20;
      this.sidebarTop = isMobile ? 68 : (saved.top || 80);
    } else {
      this.sidebarCollapsed = true;
      this.saveState();
    }
  },

  saveState: function () {
    Utils.storage.set('sidebar_state', {
      collapsed: this.sidebarCollapsed,
      left: this.sidebarLeft,
      top: this.sidebarTop,
    });
  },

  loadPosition: function () {
    const saved = Utils.storage.get('sidebar_position');
    if (saved) {
      this.sidebarLeft = saved.left || 20;
      this.sidebarTop = (window.innerWidth <= 768) ? 68 : (saved.top || 80);
    }
  },

  savePosition: function () {
    Utils.storage.set('sidebar_position', {
      left: this.sidebarLeft,
      top: this.sidebarTop,
    });
  },

  applyPosition: function () {
    if (!this.sidebar) return;
    this.sidebar.style.left = this.sidebarLeft + 'px';
    this.sidebar.style.top = this.sidebarTop + 'px';
    this.sidebar.style.right = 'auto';
    this.sidebar.style.bottom = 'auto';
    this.sidebar.style.transform = 'none';
    this.sidebar.style.position = 'fixed';
    this.sidebar.style.cursor = 'default';
  },

  applyCollapsedState: function () {
    if (!this.sidebar) return;
    const titleEl = this.sidebar.querySelector('.sidebar-header h3');
    const toggleBtn = document.getElementById('sidebarCollapseBtn');

    if (this.sidebarCollapsed) {
      this.sidebar.classList.add('collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<span class="icon-pack-arrow arrow-r180">◀</span>';
      }
      if (titleEl) {
        titleEl.textContent = '📜';
        titleEl.style.fontSize = '20px';
        titleEl.style.margin = '0';
        titleEl.style.padding = '0';
        titleEl.style.textAlign = 'center';
        titleEl.style.display = 'block';
        titleEl.style.width = '100%';
        titleEl.title = '目录及搜索 (点击展开)';
      }
      const searchContainer = this.sidebar.querySelector('.sidebar-search');
      if (searchContainer) {
        searchContainer.style.display = 'none';
      }
    } else {
      this.sidebar.classList.remove('collapsed');
      if (toggleBtn) {
        toggleBtn.innerHTML = '<span class="icon-pack-arrow arrow-r0">▶</span>';
      }
      if (titleEl) {
        titleEl.textContent = '📜 目录';
        titleEl.style.fontSize = '';
        titleEl.style.textAlign = '';
        titleEl.style.display = '';
        titleEl.style.width = '';
        titleEl.title = '';
      }
      const searchContainer2 = this.sidebar.querySelector('.sidebar-search');
      if (searchContainer2) {
        searchContainer2.style.display = 'block';
      }
      setTimeout(function () {
        const searchInput = document.getElementById('sidebarSearchInput');
        if (searchInput) searchInput.focus();
      }, 100);
    }
    const header = this.sidebar.querySelector('.sidebar-header');
    if (header) {
      header.style.cursor = 'grab';
    }

    // 应用自定义目录本身图标（默认 📜 / 📜 目录）
    DirectoryIcon.applyHeaderIcon();
  },

  toggleCollapse: function () {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.applyCollapsedState();
    this.saveState();
  },

  bindEvents: function () {
    if (!this.sidebar) return;

    // 鼠标事件
    this.sidebar.addEventListener('mousedown', this.startDrag.bind(this));
    // 触摸事件（移动端）
    this.sidebar.addEventListener('touchstart', this.startDragTouch.bind(this), { passive: false });

    // 防止拖拽时选中文本
    this.sidebar.addEventListener(
      'selectstart',
      function (e) {
        if (this.isDraggingSidebar) e.preventDefault();
      }.bind(this)
    );

    // 全局事件
    document.addEventListener('mousemove', this.onDrag.bind(this));
    document.addEventListener('mouseup', this.stopDrag.bind(this));
    document.addEventListener('touchmove', this.onDragTouch.bind(this), { passive: false });
    document.addEventListener('touchend', this.stopDrag.bind(this));

    console.log('[Sidebar] 拖拽事件已绑定');
  },

  startDrag: function (e) {
    if (e.button !== 0) return;

    const header = this.sidebar.querySelector('.sidebar-header');
    if (!header || !header.contains(e.target)) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    if (e.target.closest('.toggle-icon') || e.target.closest('.tree-node-content')) return;

    this.currentThreshold = 5;
    this._dragOccurred = false;
    this.isDraggingSidebar = true;
    this.isDragging = false;
    this.dragStartMouseX = e.clientX;
    this.dragStartMouseY = e.clientY;
    const rect = this.sidebar.getBoundingClientRect();
    this.dragStartX = e.clientX - rect.left;
    this.dragStartY = e.clientY - rect.top;
    this.sidebar.style.cursor = 'grabbing';
    this.sidebar.style.transition = 'none';

    // 阻止文本选择
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    e.preventDefault();
  },

  startDragTouch: function (e) {
    const touch = e.touches[0];
    if (!touch) return;

    const header = this.sidebar.querySelector('.sidebar-header');
    if (!header || !header.contains(e.target)) return;
    if (e.target.closest('button') || e.target.closest('input')) return;
    if (e.target.closest('.toggle-icon') || e.target.closest('.tree-node-content')) return;

    // 移动端阈值稍大，便于区分点击和拖拽
    this.currentThreshold = 10;
    this._dragOccurred = false;
    this.isDraggingSidebar = true;
    this.isDragging = false;
    this.dragStartMouseX = touch.clientX;
    this.dragStartMouseY = touch.clientY;
    const rect = this.sidebar.getBoundingClientRect();
    this.dragStartX = touch.clientX - rect.left;
    this.dragStartY = touch.clientY - rect.top;
    this.sidebar.style.cursor = 'grabbing';
    this.sidebar.style.transition = 'none';

    // 阻止文本选择
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    // 阻止页面滚动
    e.preventDefault();
  },

  onDrag: function (e) {
    if (!this.isDraggingSidebar) return;

    const dx = e.clientX - this.dragStartMouseX;
    const dy = e.clientY - this.dragStartMouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!this.isDragging && distance > this.currentThreshold) {
      this.isDragging = true;
      this._dragOccurred = true;
    }

    let newLeft = e.clientX - this.dragStartX;
    let newTop = e.clientY - this.dragStartY;
    const sidebarWidth = this.sidebar.offsetWidth || 280;
    const sidebarHeight = this.sidebar.offsetHeight || 400;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - sidebarWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - sidebarHeight));

    this.sidebarLeft = newLeft;
    this.sidebarTop = newTop;
    this.sidebar.style.left = newLeft + 'px';
    this.sidebar.style.top = newTop + 'px';
    this.sidebar.style.right = 'auto';
    this.sidebar.style.bottom = 'auto';
    this.sidebar.style.transform = 'none';
  },

  onDragTouch: function (e) {
    if (!this.isDraggingSidebar) return;
    const touch = e.touches[0];
    if (!touch) return;

    const dx = touch.clientX - this.dragStartMouseX;
    const dy = touch.clientY - this.dragStartMouseY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (!this.isDragging && distance > this.currentThreshold) {
      this.isDragging = true;
      this._dragOccurred = true;
    }

    let newLeft = touch.clientX - this.dragStartX;
    let newTop = touch.clientY - this.dragStartY;
    const sidebarWidth = this.sidebar.offsetWidth || 280;
    const sidebarHeight = this.sidebar.offsetHeight || 400;
    newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - sidebarWidth));
    newTop = Math.max(0, Math.min(newTop, window.innerHeight - sidebarHeight));

    this.sidebarLeft = newLeft;
    this.sidebarTop = newTop;
    this.sidebar.style.left = newLeft + 'px';
    this.sidebar.style.top = newTop + 'px';
    this.sidebar.style.right = 'auto';
    this.sidebar.style.bottom = 'auto';
    this.sidebar.style.transform = 'none';

    e.preventDefault();
  },

  stopDrag: function () {
    if (this.isDraggingSidebar) {
      this.isDraggingSidebar = false;
      this.sidebar.style.cursor = '';
      this.sidebar.style.transition = '';
      this.savePosition();
      this.saveState();

      // 恢复文本选择
      document.body.style.userSelect = '';
      document.body.style.webkitUserSelect = '';

      const self = this;
      setTimeout(function () {
        self.isDragging = false;
        setTimeout(function () {
          self._dragOccurred = false;
        }, 100);
      }, 50);
    }
  },

  wasDragAction: function () {
    return this.isDragging || this._dragOccurred;
  },

  isDragAction: function () {
    return this.isDragging;
  },

  resetDragState: function () {
    this.isDragging = false;
    this._dragOccurred = false;
  },
};

