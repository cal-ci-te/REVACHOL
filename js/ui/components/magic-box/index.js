// 超现实箱子主控模块 — 组装 State/Renderer/Drag，拖拽范围限制，右键菜单切换 fixed/absolute。
import { BoxState } from './BoxState.js';
import { BoxRenderer } from './BoxRenderer.js';
import { BoxDrag } from './BoxDrag.js';
import { pickItem } from './BoxItemPool.js';
import { UI } from '../../../utils/ui-strings.js';
import { AppState } from '../../../core/app-state.js';
import { EventBus } from '../../../core/event-bus.js';
import { EVENTS } from '../../../core/event-constants.js';

// 拖拽边界：计数器底部伸出约 22px，左右各留 10px 边距
const DRAG_MARGIN = 10;
const BOTTOM_EXTRA = 28; // 计数器区域

export class BoxManager {
  constructor() {
    this._state = new BoxState();
    this._renderer = new BoxRenderer(this._state, { defaultRight: 30, defaultBottom: 30 });
    this._drag = null;
    this._ctxMenuEl = null;
    this._mounted = false;
    this._interactive = true;
  }

  // ======================
  //  初始化
  // ======================

  init() {
    if (this._mounted) return this;

    this._state.load();
    this._renderer.mount();
    this._mounted = true;

    // 应用持久化的位置样式
    this._applyPositionStyle(this._state.getPositionStyle());
    this._renderer.refreshCount();

    const el = this._renderer.getElement();
    const self = this;

    this._drag = new BoxDrag(el, {
      onClick: function () { self._handleClick(); },
      onDragStart: function () { self._handleDragStart(); },
      onDragMove: function (dx, dy, newLeft, newTop) {
        const clamped = self._clampPosition(newLeft, newTop);
        self._renderer.moveTo(clamped.left, clamped.top);
      },
      onDragEnd: function (finalLeft, finalTop, isAdmin) {
        self._handleDragEnd(finalLeft, finalTop, isAdmin);
      },
      onContextMenu: function (x, y) { self._showContextMenu(x, y); },
      isAdmin: function () { return self._isAdmin(); },
    });

    this._drag.enable();

    EventBus.on(EVENTS.AUTH_LOGGED_IN, () => {
      console.log('[MagicBox] 管理员已登录');
    });
    EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => {
      console.log('[MagicBox] 管理员已登出');
    });

    // 全局点击关闭右键菜单
    document.addEventListener('click', function (e) {
      if (self._ctxMenuEl && !e.target.closest('#magic-box-context-menu')) {
        self._hideContextMenu();
      }
    });

    console.log('[MagicBox] 初始化完成 — 样式:', this._state.getPositionStyle(),
      '| 位置:', this._state.hasCustomPosition()
        ? `自定义 (${this._state.getDefaultX()}, ${this._state.getDefaultY()})`
        : 'CSS 右下角默认',
      '| 已打开:', this._state.getCount(), '次');

    return this;
  }

  // ======================
  //  权限
  // ======================

  _isAdmin() {
    try { return !!AppState.get('isLoggedIn'); } catch (e) { return false; }
  }

  // ======================
  //  拖拽范围限制
  // ======================

  /** 钳制箱子位置：fixed 模式限视口，absolute 模式限文档 */
  _clampPosition(left, top) {
    const el = this._renderer.getElement();
    if (!el) return { left, top };
    const w = el.offsetWidth || 120;
    const h = (el.offsetHeight || 100) + BOTTOM_EXTRA;

    const isAbsolute = this._state.getPositionStyle() === 'absolute';
    const maxLeft = isAbsolute
      ? (document.documentElement.scrollWidth  || document.body.scrollWidth  || window.innerWidth)  - w - DRAG_MARGIN
      : window.innerWidth  - w - DRAG_MARGIN;
    const maxTop = isAbsolute
      ? (document.documentElement.scrollHeight || document.body.scrollHeight || window.innerHeight) - h - DRAG_MARGIN
      : window.innerHeight - h - DRAG_MARGIN;

    return {
      left: Math.max(DRAG_MARGIN, Math.min(left, maxLeft)),
      top:  Math.max(DRAG_MARGIN, Math.min(top,  maxTop)),
    };
  }

  // ======================
  //  交互处理
  // ======================

  _handleClick() {
    if (!this._interactive || this._renderer.isAnimating) return;
    this._openBox();
  }

  _handleDragStart() {
    this._renderer.setGrabbing(true);
    if (this._isAdmin()) this._renderer.setAdminHint(true);
  }

  _handleDragEnd(finalLeft, finalTop, isAdmin) {
    this._renderer.setGrabbing(false);
    this._renderer.setAdminHint(false);

    const clamped = this._clampPosition(finalLeft, finalTop);

    if (isAdmin) {
      this._state.setDefaultPosition(clamped.left, clamped.top);
      console.log('[MagicBox] 管理员设定新默认位置:', clamped.left, clamped.top);
      try {
        const c = new BroadcastChannel('revachol');
        c.postMessage({ type: 'magic_box_position_changed', payload: { defaultX: clamped.left, defaultY: clamped.top } });
        c.close();
      } catch (e) { /* ignore */ }
    } else {
      this._interactive = false;
      const self = this;
      this._renderer.flyToDefault(500);
      setTimeout(function () { self._interactive = true; }, 520);
    }
  }

  // ======================
  //  右键菜单
  // ======================

  _showContextMenu(x, y) {
    this._hideContextMenu();

    const self = this;
    const currentStyle = this._state.getPositionStyle();
    const nextStyle = currentStyle === 'fixed' ? 'absolute' : 'fixed';
    const label = currentStyle === 'fixed'
      ? UI.magicBox.contextMenu.switchToAbsolute
      : UI.magicBox.contextMenu.switchToFixed;

    const menu = document.createElement('div');
    menu.id = 'magic-box-context-menu';
    menu.style.cssText =
      'position:fixed;display:block;background:var(--color-bg-tertiary);border:1px solid var(--color-border);' +
      'border-radius:4px;padding:4px 0;z-index:99999;min-width:150px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';

    const item = document.createElement('div');
    item.className = 'ctx-item';
    item.textContent = label;
    item.style.cssText =
      'padding:8px 16px;cursor:pointer;font-size:13px;color:var(--color-text-primary);' +
      'font-family:var(--font-family-base);white-space:nowrap;transition:background 0.15s;';
    item.addEventListener('mouseenter', function () { this.style.background = 'var(--color-hover)'; });
    item.addEventListener('mouseleave', function () { this.style.background = ''; });
    item.addEventListener('click', function () {
      self._togglePositionStyle();
      self._hideContextMenu();
    });
    menu.appendChild(item);
    document.body.appendChild(menu);

    // 定位：不超出视口
    const winW = window.innerWidth, winH = window.innerHeight;
    menu.style.left = Math.min(x, winW - 160) + 'px';
    menu.style.top = Math.min(y, winH - 40) + 'px';

    this._ctxMenuEl = menu;
  }

  _hideContextMenu() {
    if (this._ctxMenuEl) {
      this._ctxMenuEl.remove();
      this._ctxMenuEl = null;
    }
  }

  /** 切换 fixed ↔ absolute，带坐标转换 */
  _togglePositionStyle() {
    const oldStyle = this._state.getPositionStyle();
    const newStyle = oldStyle === 'fixed' ? 'absolute' : 'fixed';
    const el = this._renderer.getElement();
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    let newLeft, newTop;
    if (oldStyle === 'fixed' && newStyle === 'absolute') {
      // fixed → absolute：视口坐标转文档坐标
      newLeft = rect.left + scrollX;
      newTop = rect.top + scrollY;
    } else {
      // absolute → fixed：文档坐标转视口坐标
      newLeft = rect.left - scrollX;
      newTop = rect.top - scrollY;
    }

    this._state.setPositionStyle(newStyle);
    this._state.setDefaultPosition(newLeft, newTop);
    this._applyPositionStyle(newStyle);
    this._renderer.moveTo(newLeft, newTop);

    console.log('[MagicBox] 切换定位:', oldStyle, '→', newStyle, '坐标:', newLeft, newTop);
  }

  /** 应用 positionStyle 到容器 DOM */
  _applyPositionStyle(style) {
    const el = this._renderer.getElement();
    if (!el) return;
    el.style.position = style;
  }

  // ======================
  //  开箱逻辑
  // ======================

  async _openBox() {
    const item = pickItem(this._state.getLastItemId());
    EventBus.emit('box:opened', { item });
    await this._renderer.playOpenSequence(item);
    this._state.incrementCount();
    this._state.setLastItemId(item.id);
    this._renderer.refreshCount();
    EventBus.emit('box:item-shown', { item, count: this._state.getCount() });
  }

  // ======================
  //  公开 API
  // ======================

  setCustomLidImage(dataUrl)  { this._renderer.setCustomLidImage(dataUrl); }
  setCustomBodyImage(dataUrl) { this._renderer.setCustomBodyImage(dataUrl); }
  setItemImage(itemId, dataUrl) { this._state.setItemImage(itemId, dataUrl); }
  getState() { return this._state.exportState(); }

  // ======================
  //  图标包外部覆盖（不持久化）
  // ======================

  setExternalLidImage(url) {
    if (!this._state) return;
    this._state.setExternalLidImage(url);
    if (this._renderer) this._renderer.applyCustomImages();
  }

  setExternalBodyImage(url) {
    if (!this._state) return;
    this._state.setExternalBodyImage(url);
    if (this._renderer) this._renderer.applyCustomImages();
  }

  setExternalItemImage(itemId, url) {
    if (!this._state) return;
    this._state.setExternalItemImage(itemId, url);
    // 物品图仅在开箱动画中显示；若当前正在展示，尝试即时刷新
    if (this._renderer && typeof this._renderer.refreshItemImage === 'function') {
      this._renderer.refreshItemImage(itemId);
    }
  }

  resetCount() {
    this._state.resetCount();
    this._renderer.refreshCount();
  }

  resetPosition() {
    this._state.clearPosition();
    this._renderer.flyToDefault(500);
  }

  destroy() {
    this._hideContextMenu();
    if (this._drag) { this._drag.destroy(); this._drag = null; }
    if (this._renderer) { this._renderer.destroy(); this._renderer = null; }
    this._state = null;
    this._mounted = false;
  }
}

// 单例工厂
let _instance = null;

export function initMagicBox() {
  if (_instance) { console.warn('[MagicBox] 已初始化，跳过'); return _instance; }
  _instance = new BoxManager();
  _instance.init();
  return _instance;
}

export function getMagicBox() { return _instance; }
