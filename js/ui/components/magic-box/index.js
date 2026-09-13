// ！魔法箱主控
// 组装 State / Renderer / Drag，并处理拖拽边界钳制与右键菜单的定位方式切换。
// 管理员拖拽即保存为新默认位置，普通用户拖拽后飞回原位——用同一套拖拽逻辑区分两类用户。
import { BoxState } from './BoxState.js';
import { BoxRenderer } from './BoxRenderer.js';
import { BoxDrag } from './BoxDrag.js';
import { pickItem } from './BoxItemPool.js';
import { UI } from '../../../utils/ui-strings.js';
import { AppState } from '../../../core/app-state.js';
import { EventBus } from '../../../core/event-bus.js';
import { EVENTS } from '../../../core/event-constants.js';

// 拖拽边界留白（px）
const DRAG_MARGIN = 10;
// 计数器区域高度：盒子本体之外底部还伸出一段，钳制时需一并计入
const BOTTOM_EXTRA = 28;

export class BoxManager {
  constructor() {
    this._state = new BoxState();
    this._renderer = new BoxRenderer(this._state, { defaultRight: 30, defaultBottom: 30 });
    this._drag = null;
    this._ctxMenuEl = null;
    this._mounted = false;
    this._interactive = true;
  }

  // 初始化
  // 已挂载则直接返回：重复 init 会再建一套 DOM 与拖拽监听
  init() {
    if (this._mounted) return this;

    this._state.load();
    this._renderer.mount();
    this._mounted = true;

    // 应用持久化的定位方式（fixed / absolute）
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

    // 登录态变化仅用于日志追踪，箱子本身的管理入口由右键菜单按权限动态决定
    EventBus.on(EVENTS.AUTH_LOGGED_IN, () => {
      console.log('[MagicBox] 管理员已登录');
    });
    EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => {
      console.log('[MagicBox] 管理员已登出');
    });

    // 点击别处关闭右键菜单；菜单内部点击不算「别处」
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

  // 是否管理员
  _isAdmin() {
    try { return !!AppState.get('isLoggedIn'); } catch (e) { return false; }
  }

  // 钳制位置
  // 按定位方式取不同边界：fixed 限视口，absolute 限文档（可滚动区域）
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

  // 点击开箱
  // 动画期间吞掉点击：否则连点会打断播放序列
  _handleClick() {
    if (!this._interactive || this._renderer.isAnimating) return;
    this._openBox();
  }

  // 拖拽开始
  _handleDragStart() {
    this._renderer.setGrabbing(true);
    if (this._isAdmin()) this._renderer.setAdminHint(true);
  }

  // 拖拽结束
  // 管理员落点即新默认位置并广播；普通用户飞回原位，飞回期间禁用交互
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
      } catch (e) {
        // 忽略：BroadcastChannel 不可用不影响本页保存
      }
    } else {
      this._interactive = false;
      const self = this;
      this._renderer.flyToDefault(500);
      // 比飞回动画（500ms）多留 20ms 再恢复交互，避免动画末尾被点击打断
      setTimeout(function () { self._interactive = true; }, 520);
    }
  }

  // 显示右键菜单
  _showContextMenu(x, y) {
    this._hideContextMenu();

    const self = this;
    const currentStyle = this._state.getPositionStyle();
    const nextStyle = currentStyle === 'fixed' ? 'absolute' : 'fixed';
    // 菜单文案描述「切到哪种模式」，故取反后的目标态
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

    // 菜单按菜单自身尺寸收边，避免贴到右/下边缘时溢出视口
    const winW = window.innerWidth, winH = window.innerHeight;
    menu.style.left = Math.min(x, winW - 160) + 'px';
    menu.style.top = Math.min(y, winH - 40) + 'px';

    this._ctxMenuEl = menu;
  }

  // 隐藏右键菜单
  _hideContextMenu() {
    if (this._ctxMenuEl) {
      this._ctxMenuEl.remove();
      this._ctxMenuEl = null;
    }
  }

  // 切换定位方式
  // 两种定位的坐标系不同，切换时必须换算坐标，否则箱子会突跳到另一位置
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
      // fixed → absolute：视口坐标加滚动量得到文档坐标
      newLeft = rect.left + scrollX;
      newTop = rect.top + scrollY;
    } else {
      // absolute → fixed：文档坐标减去滚动量得到视口坐标
      newLeft = rect.left - scrollX;
      newTop = rect.top - scrollY;
    }

    this._state.setPositionStyle(newStyle);
    this._state.setDefaultPosition(newLeft, newTop);
    this._applyPositionStyle(newStyle);
    this._renderer.moveTo(newLeft, newTop);

    console.log('[MagicBox] 切换定位:', oldStyle, '→', newStyle, '坐标:', newLeft, newTop);
  }

  // 应用定位方式到容器
  _applyPositionStyle(style) {
    const el = this._renderer.getElement();
    if (!el) return;
    el.style.position = style;
  }

  // 开箱
  // 传入上次物品 ID 以去重；计数与物品 ID 在动画结束后才落库
  async _openBox() {
    const item = pickItem(this._state.getLastItemId());
    EventBus.emit('box:opened', { item });
    await this._renderer.playOpenSequence(item);
    this._state.incrementCount();
    this._state.setLastItemId(item.id);
    this._renderer.refreshCount();
    EventBus.emit('box:item-shown', { item, count: this._state.getCount() });
  }

  // 公开 API：设置自定义贴图
  setCustomLidImage(dataUrl)  { this._renderer.setCustomLidImage(dataUrl); }
  setCustomBodyImage(dataUrl) { this._renderer.setCustomBodyImage(dataUrl); }
  setItemImage(itemId, dataUrl) { this._state.setItemImage(itemId, dataUrl); }
  getState() { return this._state.exportState(); }

  // 图标包外部覆盖（不落盘）
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
    // 物品图只在开箱动画中出现，若当前正展示则尝试即时刷新
    if (this._renderer && typeof this._renderer.refreshItemImage === 'function') {
      this._renderer.refreshItemImage(itemId);
    }
  }

  // 重置开启次数
  resetCount() {
    this._state.resetCount();
    this._renderer.refreshCount();
  }

  // 重置位置
  resetPosition() {
    this._state.clearPosition();
    this._renderer.flyToDefault(500);
  }

  // 销毁
  destroy() {
    this._hideContextMenu();
    if (this._drag) { this._drag.destroy(); this._drag = null; }
    if (this._renderer) { this._renderer.destroy(); this._renderer = null; }
    this._state = null;
    this._mounted = false;
  }
}

// 单例
let _instance = null;

// 初始化单例
export function initMagicBox() {
  if (_instance) { console.warn('[MagicBox] 已初始化，跳过'); return _instance; }
  _instance = new BoxManager();
  _instance.init();
  return _instance;
}

// 取当前实例
export function getMagicBox() { return _instance; }
