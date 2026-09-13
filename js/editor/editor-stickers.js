// ！编辑器贴纸预览
// 在文章编辑器的内容流中渲染贴纸预览，并提供右键操作菜单。
// 贴纸以浮动元素插入 contentEl，样式经 StickerShape.buildInlineStyle 生成（固定矩形绕排）。
// 拖拽由贴纸编辑器（StickerEditorMode）负责，本模块只做预览渲染与右键菜单。
import { DecoShelf } from '../services/deco.js';
import { StickerShape } from './sticker-shape.js';

export const EditorStickers = {

  // 渲染贴纸到内容容器
  // 用 TreeWalker 找到注释节点并在原位置替换，保留贴纸与对应段落的相对关系
  render(ctx) {
    const contentEl = ctx.contentEl;
    const article = ctx.article;
    const onDirty = ctx.onDirty;
    if (!contentEl || !article) return;
    const stickers = article.stickers || [];
    if (!stickers || !stickers.length) return;

    const stickerMap = {};
    stickers.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    const walker = document.createTreeWalker(
      contentEl, NodeFilter.SHOW_COMMENT,
      { acceptNode: function (c) {
        return (c.nodeValue && /^\s*sticker:/.test(c.nodeValue.trim())) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }}
    );

    // 先收集全部注释再替换：遍历中改 DOM 会破坏 TreeWalker 迭代
    const comments = [];
    let node;
    while ((node = walker.nextNode())) { comments.push(node); }

    const self = this;
    comments.forEach(function (comment) {
      const match = comment.nodeValue.match(/sticker:([a-zA-Z0-9_-]+)/);
      if (!match) return;
      const decoId = match[1];
      const data = stickerMap[decoId];
      if (!data) return;

      const deco = DecoShelf.get(decoId);
      if (!deco) return;

      const el = self._createStickerElementWithContext(data, deco, article, onDirty);
      comment.parentNode.replaceChild(el, comment);
    });

    this._ensureClearfix(contentEl);
  },

  // 原地刷新贴纸：只改样式与图片，保留既有 DOM 位置
  // 与 render 重建 DOM 的做法区分开：刷新频繁发生，重建会丢失滚动位置与选中态
  refresh(ctx) {
    const contentEl = ctx.contentEl;
    const article = ctx.article;
    const onDirty = ctx.onDirty;
    if (!contentEl || !article) return;

    const stickers = article.stickers || [];
    const self = this;

    const existingEls = contentEl.querySelectorAll('.article-sticker');
    const existingMap = {};
    existingEls.forEach(function (el) {
      const id = el.dataset.decoId;
      if (id) existingMap[id] = el;
    });

    const newDecoIds = {};
    stickers.forEach(function (s) { if (s && s.decoId) newDecoIds[s.decoId] = true; });

    // 先移除已删除的贴纸元素，避免残留孤儿节点
    existingEls.forEach(function (el) {
      if (!newDecoIds[el.dataset.decoId]) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });

    stickers.forEach(function (data) {
      const deco = DecoShelf.get(data.decoId);
      if (!deco) return;

      const existing = existingMap[data.decoId];
      if (existing) {
        // 原地更新：仅重写样式与图片，保持节点位置不变
        const imgSrc = deco.dataUrl || deco.url || '';
        const w = data.width || StickerShape.DEFAULT_SIZE;
        const h = data.height || StickerShape.DEFAULT_SIZE;
        const shapeData = {
          width: w, height: h,
          align: data.align || 'left',
          margin: data.margin || StickerShape.DEFAULT_MARGIN,
        };
        existing.style.cssText = StickerShape.buildInlineStyle(shapeData, imgSrc);
      } else {
        // 新增贴纸无锚点信息可依，追加到末尾
        const el = self._createStickerElementWithContext(data, deco, article, onDirty);
        contentEl.appendChild(el);
      }
    });

    const oldCf = contentEl.querySelectorAll('.sticker-clearfix');
    oldCf.forEach(function (el) { el.remove(); });
    this._ensureClearfix(contentEl);
  },

  // 移除右键菜单（幂等）
  removeContextMenu() {
    const m = document.getElementById('editor-sticker-context-menu');
    if (m) m.remove();
  },

  // 清理本模块创建的全部 DOM 残留
  cleanup(contentEl) {
    this.removeContextMenu();
    if (contentEl) {
      const existing = contentEl.querySelectorAll('.article-sticker, .sticker-clearfix');
      existing.forEach(function (el) { el.remove(); });
    }
  },

  // 内部方法

  // 创建贴纸元素（render 与 refresh 共用）
  // id 前缀 editor-sticker- 以便与阅读视图的贴纸元素区分
  _createStickerElementWithContext(data, deco, article, onDirty) {
    const el = document.createElement('div');
    el.className = 'article-sticker';
    el.id = 'editor-sticker-' + data.decoId;
    el.dataset.decoId = data.decoId;

    const imgSrc = deco.dataUrl || deco.url || '';
    const w = data.width || StickerShape.DEFAULT_SIZE;
    const h = data.height || StickerShape.DEFAULT_SIZE;

    const shapeData = {
      width: w, height: h,
      align: data.align || 'left',
      margin: data.margin || StickerShape.DEFAULT_MARGIN,
    };
    el.style.cssText = StickerShape.buildInlineStyle(shapeData, imgSrc);

    const self = this;
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      // 阻止冒泡：否则会一并触发容器上的默认右键处理
      e.stopPropagation();
      self._showContextMenu(e.clientX, e.clientY, data, el, article, onDirty);
    });

    return el;
  },

  // 确保容器末尾有 clearfix
  // 复用已有节点而非新建：本函数会被反复调用，复用可避免 clearfix 在容器内不断堆积
  _ensureClearfix(container) {
    const existing = container.querySelector('.sticker-clearfix');
    if (existing) {
      container.appendChild(existing);
    } else {
      const cf = document.createElement('div');
      cf.className = 'sticker-clearfix';
      cf.style.cssText = 'clear:both;height:0;visibility:hidden;';
      container.appendChild(cf);
    }
  },

  // 显示贴纸右键菜单
  // 菜单挂在 body 并用 fixed 定位：贴纸处在 contentEditable 内，挂容器内会受其层叠与溢出裁剪影响
  _showContextMenu(x, y, stickerData, stickerEl, article, onDirty) {
    const self = this;
    this.removeContextMenu();

    const menu = document.createElement('div');
    menu.id = 'editor-sticker-context-menu';
    menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:10002;background:var(--color-bg-tertiary,#2a231c);border:1px solid var(--color-border-highlight,#c47a44);border-radius:4px;padding:4px 0;min-width:160px;box-shadow:4px 4px 0 rgba(0,0,0,0.35);font-family:Courier New,monospace;font-size:13px';

    [{ label: '🔄 切换浮动方向', action: function () {
       const newAlign = stickerData.align === 'right' ? 'left' : 'right';
       stickerData.align = newAlign;
       const margin = stickerData.margin || StickerShape.DEFAULT_MARGIN;
       // 只改 float 与 margin，不整体重写 cssText：整体重写会覆盖掉图片等其余内联样式
       stickerEl.style.float = newAlign;
       stickerEl.style.margin = '10px ' + margin + 'px 10px ' + margin + 'px';
       self.removeContextMenu();
       if (onDirty) onDirty();
     }},
     { sep: true },
     { label: '🗑️ 删除贴纸', action: function () {
       if (article && article.stickers) {
         article.stickers = article.stickers.filter(function (s) { return s.decoId !== stickerData.decoId; });
       }
       stickerEl.oncontextmenu = null;
       if (stickerEl.parentNode) stickerEl.parentNode.removeChild(stickerEl);
       self.removeContextMenu();
       if (onDirty) onDirty();
     }}].forEach(function (item) {
      if (item.sep) { const s = document.createElement('div'); s.style.cssText = 'height:1px;background:var(--color-border);margin:4px 0'; menu.appendChild(s); }
      else {
        const b = document.createElement('button'); b.textContent = item.label;
        b.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 16px;background:none;border:none;color:var(--color-text-accent);cursor:pointer;font-family:Courier New,monospace;font-size:13px';
        b.addEventListener('mouseenter', function () { b.style.background = 'var(--color-hover)'; });
        b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
        b.addEventListener('click', function (ev) { ev.stopPropagation(); item.action(); });
        menu.appendChild(b);
      }
    });
    document.body.appendChild(menu);
    // 延后一拍再挂 document 点击关闭：本次触发菜单的点击仍在冒泡，立即绑定会被同一次点击关掉
    // once:true 让监听器自动摘除，无需手动维护
    setTimeout(function () { document.addEventListener('click', function cm() { self.removeContextMenu(); document.removeEventListener('click', cm); }, { once: true }); }, 0);
  },
};
