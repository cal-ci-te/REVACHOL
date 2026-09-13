// ！贴纸编辑器交互层
// 负责贴纸的渲染、拖拽、右键菜单与新增。
// 依赖全部经 ctx 注入，不引用主控模块，便于单独测试且避免循环引用。
import { DecoShelf } from '../../services/deco.js';
import { StickerShape } from '../sticker-shape.js';
import { UI } from '../../utils/ui-strings.js';

export const Stickers = {

  // 渲染已有贴纸
  // 事件在此统一挂载，故 unbindAll 必须能按同一套引用解绑
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
        // 阻止冒泡：否则会同时触发覆盖层空白区的关闭逻辑
        e.stopPropagation();
        self._showContextMenu(e.clientX, e.clientY, data, el, ctx);
      });

      ctx.stickerLayer.appendChild(el);
    });
  },

  // 从贴纸库新增一张贴纸
  // 初始位置按已贴纸数量下移，避免新增的贴纸全部叠在同一处
  // 位置再经 suggestPosition 做重叠规避，两者共同决定落点
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

    // 入场动画：让新增的贴纸在满屏已有贴纸中可被一眼定位
    el.style.animation = 'sticker-appear 0.3s ease-out';

    const self = this;
    this._bindDrag(el, ctx.articleContainer);
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self._showContextMenu(e.clientX, e.clientY, data, el, ctx);
    });

    ctx.stickerLayer.appendChild(el);

    if (ctx.onRefreshConsole) ctx.onRefreshConsole();
  },

  // 创建单个贴纸元素
  // 透明边框占位而非拖拽时再加：保证 hover 高亮与拖拽高亮不改变元素尺寸，避免位置抖动
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

    el.addEventListener('mouseenter', function () {
      // 拖拽中不加 hover 高亮：拖拽态已用边框色表达，两者叠加会闪烁
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

  // 绑定贴纸拖拽
  // move/up 挂 document 而非元素本身：拖拽中指针移出贴纸范围仍需持续跟随
  // 位置夹在容器范围内，防止贴纸被拖到不可见区域而无法再选回
  _bindDrag(el, container) {
    const onDown = function (e) {
      // 仅响应左键；右键留给上下文菜单
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const startLeft = parseFloat(el.style.left) || 0;
      const startTop = parseFloat(el.style.top) || 0;
      el.style.cursor = 'grabbing';
      // 拖拽中抬高层级：被拖者应始终覆盖在其他贴纸之上
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

    // 保存引用以便解绑：匿名监听器无法被 removeEventListener 摘除
    el._stickerDragDown = onDown;
    el.addEventListener('mousedown', onDown);
  },

  // 显示贴纸右键菜单（切换浮动方向、删除）
  // 菜单挂 body 并 fixed 定位：贴纸层 overflow 受限，挂在层内会被裁剪
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
          // 切换方向时同步移动贴纸到对应侧：只改 align 而不动位置，视觉上会看不出变化
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
          if (stickerEl._stickerDragDown) {
            stickerEl.removeEventListener('mousedown', stickerEl._stickerDragDown);
            delete stickerEl._stickerDragDown;
          }
          stickerEl.onmouseenter = null;
          stickerEl.onmouseleave = null;
          stickerEl.oncontextmenu = null;
          // 数据与 DOM 双删：只删 DOM 会在下次收集时按旧数据把贴纸复原
          const newData = ctx.stickerData.filter(function (s) {
            return s.decoId !== stickerData.decoId;
          });
          if (ctx.onDataChange) ctx.onDataChange(newData);
          if (stickerEl.parentNode) stickerEl.parentNode.removeChild(stickerEl);
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

    // 延后一拍再绑定关闭：本次触发菜单的点击仍在冒泡，立即绑定会被同一次点击关闭
    setTimeout(function () {
      document.addEventListener('click', function closeMenu() {
        self.removeContextMenu();
        document.removeEventListener('click', closeMenu);
      }, { once: true });
    }, 0);
  },

  // 移除右键菜单（幂等）
  removeContextMenu() {
    const m = document.getElementById('sticker-context-menu');
    if (m) m.remove();
  },

  // 解绑全部贴纸元素的事件监听
  // 需在移除 DOM 前调用：节点一旦脱离文档，再想按选择器找回就为时已晚
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

  // 清理：右键菜单与元素监听一并处理
  cleanup(stickerLayer) {
    this.removeContextMenu();
    this.unbindAll(stickerLayer);
  },
};
