/**
 * 贴纸编辑器贴纸交互层 — 渲染、拖拽、右键菜单、添加。
 *
 * 通过 ctx 注入依赖，不依赖主控模块。
 *
 * @module sticker-editor/stickers
 */

import { DecoShelf } from '../../services/deco.js';
import { StickerShape } from '../sticker-shape.js';
import { UI } from '../../utils/ui-strings.js';

export const Stickers = {

  /**
   * 渲染已有贴纸（从 stickerData 数组）。
   * @param {object} ctx - { stickerLayer, stickerData, articleContainer }
   */
  render(ctx) {
    if (!ctx.stickerData || !ctx.stickerData.length) return;

    const self = this;

    ctx.stickerData.forEach(function (data, index) {
      const deco = DecoShelf.get(data.decoId);
      if (!deco) return;

      const el = self._buildElement(deco, data, ctx.articleContainer);
      el.dataset.index = index;

      self._bindDrag(el, ctx.articleContainer);
      el.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        self._showContextMenu(e.clientX, e.clientY, data, el, ctx);
      });

      ctx.stickerLayer.appendChild(el);
    });
  },

  /**
   * 从贴纸库添加一张新贴纸。
   * @param {object} ctx
   * @param {object} deco - 贴纸对象
   */
  addOne(ctx, deco) {
    const cr = ctx.articleContainer.getBoundingClientRect();
    const w = StickerShape.DEFAULT_SIZE;
    const h = StickerShape.DEFAULT_SIZE;

    const suggested = StickerShape.suggestPosition(
      ctx.stickerData, cr.width,
      80 + ctx.stickerData.length * 30
    );

    const data = {
      decoId: deco.id,
      x: suggested.x,
      y: suggested.y,
      width: w,
      height: h,
      align: suggested.align,
      margin: StickerShape.DEFAULT_MARGIN,
    };

    ctx.stickerData.push(data);

    const el = this._buildElement(deco, data, ctx.articleContainer);
    el.dataset.index = ctx.stickerData.length - 1;

    // 入场动画
    el.style.animation = 'sticker-appear 0.3s ease-out';

    const self = this;
    this._bindDrag(el, ctx.articleContainer);
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self._showContextMenu(e.clientX, e.clientY, data, el, ctx);
    });

    ctx.stickerLayer.appendChild(el);

    // 通知控制台刷新
    if (ctx.onRefreshConsole) ctx.onRefreshConsole();
  },

  /**
   * 创建单个贴纸 DOM 元素。
   */
  _buildElement(deco, data, container) {
    const el = document.createElement('div');
    el.className = 'article-sticker-editing';
    el.id = 'sticker-el-' + deco.id;
    el.dataset.decoId = deco.id;

    const imgSrc = deco.dataUrl || deco.url || '';
    const w = data.width || StickerShape.DEFAULT_SIZE;
    const h = data.height || StickerShape.DEFAULT_SIZE;

    el.style.cssText = [
      'position:absolute',
      'left:' + (data.x || StickerShape.DEFAULT_X) + 'px',
      'top:' + (data.y || StickerShape.DEFAULT_Y) + 'px',
      'width:' + w + 'px',
      'height:' + h + 'px',
      'background-image:url(' + imgSrc + ')',
      'background-size:contain',
      'background-repeat:no-repeat',
      'background-position:center',
      'pointer-events:auto', 'z-index:10', 'cursor:grab',
      'border:2px solid transparent', 'border-radius:4px',
    ].join(';');

    // hover 边框高亮
    el.addEventListener('mouseenter', function () {
      if (el.style.cursor !== 'grabbing') {
        document.body.style.userSelect = 'none';
        el.style.borderColor = 'var(--color-accent, #c47a44)';
      }
    });
    el.addEventListener('mouseleave', function () {
      el.style.borderColor = 'transparent';
    });

    return el;
  },

  /**
   * 绑定贴纸拖拽交互。
   */
  _bindDrag(el, container) {
    const onDown = function (e) {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      el.style.cursor = 'grabbing';
      el.style.zIndex = '20';
      document.body.style.userSelect = 'none';
      el.style.borderColor = 'var(--color-accent, #c47a44)';

      const onMove = function (ev) {
        ev.preventDefault();
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        let newLeft = startLeft + dx;
        let newTop = startTop + dy;

        if (container) {
          const cr = container.getBoundingClientRect();
          const ew = el.offsetWidth || 100;
          const eh = el.offsetHeight || 100;
          newLeft = Math.max(0, Math.min(newLeft, cr.width - ew));
          newTop = Math.max(0, Math.min(newTop, cr.height - eh));
        }

        el.style.left = newLeft + 'px';
        el.style.top = newTop + 'px';
      };

      const onUp = function () {
        el.style.cursor = 'grab';
        el.style.zIndex = '10';
        el.style.borderColor = 'transparent';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    };

    el._stickerDragDown = onDown;
    el.addEventListener('mousedown', onDown);
  },

  /**
   * 显示右键菜单（浮动方向切换 + 删除）。
   */
  _showContextMenu(x, y, stickerData, stickerEl, ctx) {
    this.removeContextMenu();

    const self = this;
    const menu = document.createElement('div');
    menu.id = 'sticker-context-menu';
    menu.style.cssText = [
      'position:fixed', 'left:' + x + 'px', 'top:' + y + 'px',
      'z-index:10002',
      'background:var(--color-bg-tertiary, #2a231c)',
      'border:1px solid var(--color-border-highlight, #c47a44)',
      'border-radius:4px', 'padding:4px 0', 'min-width:160px',
      'box-shadow:4px 4px 0 rgba(0,0,0,0.35)',
      'font-family:Courier New,monospace', 'font-size:13px',
    ].join(';');

    const items = [
      { label: UI.stickerEditor.ctxToggleAlign || '🔄 切换浮动方向',
        action: function () {
          const newAlign = stickerData.align === 'right' ? 'left' : 'right';
          stickerData.align = newAlign;
          const container = ctx.articleContainer;
          if (container && stickerEl) {
            const cw = container.getBoundingClientRect().width || 800;
            const ew = parseFloat(stickerEl.style.width) || StickerShape.DEFAULT_SIZE;
            const curLeft = parseFloat(stickerEl.style.left) || 0;
            const margin = stickerData.margin || StickerShape.DEFAULT_MARGIN;
            if (newAlign === 'right') {
              stickerEl.style.left = (cw - ew - margin) + 'px';
            } else {
              stickerEl.style.left = margin + 'px';
            }
          }
          self.removeContextMenu();
        }},
      { type: 'sep' },
      { label: UI.stickerEditor.ctxRemove || '🗑️ 删除贴纸',
        action: function () {
          // 移除 DOM 事件监听器
          if (stickerEl._stickerDragDown) {
            stickerEl.removeEventListener('mousedown', stickerEl._stickerDragDown);
            delete stickerEl._stickerDragDown;
          }
          stickerEl.onmouseenter = null;
          stickerEl.onmouseleave = null;
          stickerEl.oncontextmenu = null;
          // 从数据中移除（通过回调通知主控更新 _stickerData）
          const newData = ctx.stickerData.filter(function (s) {
            return s.decoId !== stickerData.decoId;
          });
          if (ctx.onDataChange) ctx.onDataChange(newData);
          // 从 DOM 中移除
          if (stickerEl.parentNode) stickerEl.parentNode.removeChild(stickerEl);
          // 清理 + 刷新控制台
          self.removeContextMenu();
          if (ctx.onRefreshConsole) ctx.onRefreshConsole();
        }},
    ];

    items.forEach(function (item) {
      if (item.type === 'sep') {
        const sep = document.createElement('div');
        sep.style.cssText = 'height:1px;background:var(--color-border);margin:4px 0;';
        menu.appendChild(sep);
      } else {
        const btn = document.createElement('button');
        btn.textContent = item.label;
        btn.style.cssText = [
          'display:block', 'width:100%', 'text-align:left',
          'padding:8px 16px', 'background:none', 'border:none',
          'color:var(--color-text-accent)', 'cursor:pointer',
          'font-family:Courier New,monospace', 'font-size:13px',
        ].join(';');
        btn.addEventListener('mouseenter', function () {
          btn.style.background = 'var(--color-hover)';
        });
        btn.addEventListener('mouseleave', function () {
          btn.style.background = 'none';
        });
        btn.addEventListener('click', function (e) { e.stopPropagation(); item.action(); });
        menu.appendChild(btn);
      }
    });

    document.body.appendChild(menu);

    // 点击任意位置关闭
    setTimeout(function () {
      document.addEventListener('click', function closeMenu() {
        self.removeContextMenu();
        document.removeEventListener('click', closeMenu);
      }, { once: true });
    }, 0);
  },

  removeContextMenu() {
    const m = document.getElementById('sticker-context-menu');
    if (m) m.remove();
  },

  /**
   * 解绑所有贴纸元素的事件监听器（在 innerHTML 清空前调用）。
   */
  unbindAll(stickerLayer) {
    if (!stickerLayer) return;
    const els = stickerLayer.querySelectorAll('.article-sticker-editing');
    els.forEach(function (el) {
      if (el._stickerDragDown) {
        el.removeEventListener('mousedown', el._stickerDragDown);
        delete el._stickerDragDown;
      }
      el.onmouseenter = null;
      el.onmouseleave = null;
      el.oncontextmenu = null;
    });
  },

  /**
   * 清理（右键菜单 + 解绑元素）。
   */
  cleanup(stickerLayer) {
    this.removeContextMenu();
    this.unbindAll(stickerLayer);
  },
};
