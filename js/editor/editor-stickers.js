/**
 * 编辑器内贴纸交互 — float + shape-outside 浮动渲染、右键菜单。
 *
 * 贴纸作为浮动元素插入 contentEl 内容流，使用 StickerShape.buildInlineStyle
 * 生成 shape-outside + clip-path 实现文字绕排预览。
 * 拖拽功能由贴纸编辑器（StickerEditorMode）提供，此处仅渲染预览 + 右键菜单。
 *
 * @module editor-stickers
 */

import { DecoShelf } from '../services/deco.js';
import { StickerShape } from './sticker-shape.js';

export const EditorStickers = {

  /**
   * 渲染贴纸到文章内容容器中（float + shape-outside 浮动元素）。
   *
   * 首次渲染使用 TreeWalker 遍历 DOM 注释节点，在标记原始位置替换为贴纸浮动元素。
   * @param {object} ctx
   * @param {HTMLElement} ctx.contentEl - 文章内容容器（已渲染内容含标记注释）
   * @param {object} ctx.article - 文章对象（含 stickers 数组）
   * @param {function} ctx.onDirty - 标记脏状态回调
   */
  render(ctx) {
    var contentEl = ctx.contentEl;
    var article = ctx.article;
    var onDirty = ctx.onDirty;
    if (!contentEl || !article) return;
    var stickers = article.stickers || [];
    if (!stickers || !stickers.length) return;

    var stickerMap = {};
    stickers.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    var walker = document.createTreeWalker(
      contentEl, NodeFilter.SHOW_COMMENT,
      { acceptNode: function (c) {
        return (c.nodeValue && /^\s*sticker:/.test(c.nodeValue.trim())) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }}
    );

    var comments = [];
    var node;
    while ((node = walker.nextNode())) { comments.push(node); }

    var self = this;
    comments.forEach(function (comment) {
      var match = comment.nodeValue.match(/sticker:([a-zA-Z0-9_-]+)/);
      if (!match) return;
      var decoId = match[1];
      var data = stickerMap[decoId];
      if (!data) return;

      var deco = DecoShelf.get(decoId);
      if (!deco) return;

      var el = self._createStickerElementWithContext(data, deco, article, onDirty);
      comment.parentNode.replaceChild(el, comment);
    });

    this._ensureClearfix(contentEl);
  },

  /**
   * 刷新贴纸 — 原地更新每个贴纸元素的样式和图片，保留 DOM 位置。
   * 新增的贴纸追加到末尾，已删除的贴纸移除 DOM 元素。
   */
  refresh(ctx) {
    var contentEl = ctx.contentEl;
    var article = ctx.article;
    var onDirty = ctx.onDirty;
    if (!contentEl || !article) return;

    var stickers = article.stickers || [];
    var self = this;

    // 收集现有贴纸元素，按 decoId 索引
    var existingEls = contentEl.querySelectorAll('.article-sticker');
    var existingMap = {};
    existingEls.forEach(function (el) {
      var id = el.dataset.decoId;
      if (id) existingMap[id] = el;
    });

    // 构建新 decoId 集合
    var newDecoIds = {};
    stickers.forEach(function (s) { if (s && s.decoId) newDecoIds[s.decoId] = true; });

    // 移除已不存在的贴纸元素
    existingEls.forEach(function (el) {
      if (!newDecoIds[el.dataset.decoId]) {
        if (el.parentNode) el.parentNode.removeChild(el);
      }
    });

    // 更新现有贴纸 + 添加新贴纸
    stickers.forEach(function (data) {
      var deco = DecoShelf.get(data.decoId);
      if (!deco) return;

      var existing = existingMap[data.decoId];
      if (existing) {
        // 原地更新：只改样式和图片，不改变 DOM 位置
        var imgSrc = deco.dataUrl || deco.url || '';
        var w = data.width || StickerShape.DEFAULT_SIZE;
        var h = data.height || StickerShape.DEFAULT_SIZE;
        var shapeData = {
          width: w, height: h,
          align: data.align || 'left',
          margin: data.margin || StickerShape.DEFAULT_MARGIN,
        };
        existing.style.cssText = StickerShape.buildInlineStyle(shapeData, imgSrc);
      } else {
        // 新贴纸：追加到末尾
        var el = self._createStickerElementWithContext(data, deco, article, onDirty);
        contentEl.appendChild(el);
      }
    });

    // 清理旧的 clearfix，追加新的
    var oldCf = contentEl.querySelectorAll('.sticker-clearfix');
    oldCf.forEach(function (el) { el.remove(); });
    this._ensureClearfix(contentEl);
  },

  removeContextMenu() {
    var m = document.getElementById('editor-sticker-context-menu');
    if (m) m.remove();
  },

  cleanup(contentEl) {
    this.removeContextMenu();
    if (contentEl) {
      var existing = contentEl.querySelectorAll('.article-sticker, .sticker-clearfix');
      existing.forEach(function (el) { el.remove(); });
    }
  },

  // ---- 内部方法 ----

  /**
   * 创建单个贴纸 DOM 元素（render 和 refresh 共用）。
   */
  _createStickerElementWithContext(data, deco, article, onDirty) {
    var el = document.createElement('div');
    el.className = 'article-sticker';
    el.id = 'editor-sticker-' + data.decoId;
    el.dataset.decoId = data.decoId;

    var imgSrc = deco.dataUrl || deco.url || '';
    var w = data.width || StickerShape.DEFAULT_SIZE;
    var h = data.height || StickerShape.DEFAULT_SIZE;

    var shapeData = {
      width: w, height: h,
      align: data.align || 'left',
      margin: data.margin || StickerShape.DEFAULT_MARGIN,
    };
    el.style.cssText = StickerShape.buildInlineStyle(shapeData, imgSrc);

    var self = this;
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
      e.stopPropagation();
      self._showContextMenu(e.clientX, e.clientY, data, el, article, onDirty);
    });

    return el;
  },

  _ensureClearfix(container) {
    var existing = container.querySelector('.sticker-clearfix');
    if (existing) {
      container.appendChild(existing);
    } else {
      var cf = document.createElement('div');
      cf.className = 'sticker-clearfix';
      cf.style.cssText = 'clear:both;height:0;visibility:hidden;';
      container.appendChild(cf);
    }
  },

  _showContextMenu(x, y, stickerData, stickerEl, article, onDirty) {
    var self = this;
    this.removeContextMenu();

    var menu = document.createElement('div');
    menu.id = 'editor-sticker-context-menu';
    menu.style.cssText = 'position:fixed;left:' + x + 'px;top:' + y + 'px;z-index:10002;background:var(--color-bg-tertiary,#2a231c);border:1px solid var(--color-border-highlight,#c47a44);border-radius:4px;padding:4px 0;min-width:160px;box-shadow:4px 4px 0 rgba(0,0,0,0.35);font-family:Courier New,monospace;font-size:13px';

    [{ label: '🔄 切换浮动方向', action: function () {
       var newAlign = stickerData.align === 'right' ? 'left' : 'right';
       stickerData.align = newAlign;
       var margin = stickerData.margin || StickerShape.DEFAULT_MARGIN;
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
      if (item.sep) { var s = document.createElement('div'); s.style.cssText = 'height:1px;background:var(--color-border);margin:4px 0'; menu.appendChild(s); }
      else {
        var b = document.createElement('button'); b.textContent = item.label;
        b.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 16px;background:none;border:none;color:var(--color-text-accent);cursor:pointer;font-family:Courier New,monospace;font-size:13px';
        b.addEventListener('mouseenter', function () { b.style.background = 'var(--color-hover)'; });
        b.addEventListener('mouseleave', function () { b.style.background = 'none'; });
        b.addEventListener('click', function (ev) { ev.stopPropagation(); item.action(); });
        menu.appendChild(b);
      }
    });
    document.body.appendChild(menu);
    setTimeout(function () { document.addEventListener('click', function cm() { self.removeContextMenu(); document.removeEventListener('click', cm); }, { once: true }); }, 0);
  },
};
