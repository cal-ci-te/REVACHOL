/**
 * 贴纸编辑器控制台 — 右下角贴纸库面板（拖拽、折叠、列表渲染、添加）。
 *
 * @module sticker-editor/console
 */

import { DecoShelf } from '../../services/deco.js';
import { UI } from '../../utils/ui-strings.js';

export const Console = {

  /**
   * 创建右下角贴纸库控制台面板。
   * @param {object} ctx - { stickerData, stickersModule, articleContainer }
   * @returns {HTMLElement}
   */
  create(ctx) {
    var self = this;

    // 面板容器 — 复用 .admin-panel CSS
    var panel = document.createElement('div');
    panel.className = 'admin-panel open';
    panel.id = 'sticker-console-panel';
    panel.style.cssText = 'width:280px;z-index:10000;display:block;';

    var savedPos = this._loadPos();
    panel.style.right = (savedPos.right || 20) + 'px';
    panel.style.bottom = (savedPos.bottom || 80) + 'px';

    // 标题栏 — 复用 .panel-header CSS
    var header = document.createElement('div');
    header.className = 'panel-header';
    header.style.cursor = 'grab';
    header.innerHTML = '<h4>' + (UI.stickerEditor.consoleTitle || '📚 贴纸库') + '</h4>' +
      '<span class="toggle-icon" id="stickerConsoleToggle">▶</span>';

    // 内容区 — 复用 .panel-content CSS
    var content = document.createElement('div');
    content.className = 'panel-content';
    content.id = 'sticker-console-content';
    content.style.maxHeight = '320px';
    content.style.overflowY = 'auto';

    panel.appendChild(header);
    panel.appendChild(content);
    document.body.appendChild(panel);

    // 拖拽 — 与 AdminDrag 逻辑一致
    this._bindDrag(panel, header, function (r, b) { self._savePos(r, b); });

    // 折叠/展开
    var collapsed = false;
    document.getElementById('stickerConsoleToggle').addEventListener('click', function (e) {
      e.stopPropagation();
      collapsed = !collapsed;
      if (collapsed) {
        panel.classList.add('collapsed');
        header.querySelector('.toggle-icon').textContent = '◀';
      } else {
        panel.classList.remove('collapsed');
        header.querySelector('.toggle-icon').textContent = '▶';
      }
    });

    // 填充贴纸库列表
    this._refresh(ctx);

    return panel;
  },

  /**
   * 刷新贴纸库列表。
   */
  refresh(ctx) {
    this._refresh(ctx);
  },

  // ---- 内部实现 ----

  _refresh(ctx) {
    var content = document.getElementById('sticker-console-content');
    if (!content) return;

    var allDecos = DecoShelf.getAll() || [];
    var placedIds = new Set((ctx.stickerData || []).map(function (s) { return s.decoId; }));
    var self = this;

    content.innerHTML = '';

    if (!allDecos.length) {
      content.innerHTML = '<div style="padding:16px;text-align:center;color:var(--color-text-muted);font-size:12px;">' +
        (UI.stickerEditor.emptyLibrary || '贴纸库为空，请先在管理面板上传贴纸') + '</div>';
      return;
    }

    allDecos.forEach(function (deco) {
      var isPlaced = placedIds.has(deco.id);

      var item = document.createElement('div');
      item.style.cssText = [
        'display:flex', 'align-items:center', 'gap:10px',
        'padding:8px 10px', 'margin-bottom:4px',
        'border-radius:4px', 'cursor:' + (isPlaced ? 'default' : 'pointer'),
        'border:1px solid ' + (isPlaced ? 'var(--color-accent)' : 'transparent'),
        'background:' + (isPlaced ? 'var(--color-active, rgba(196,122,68,0.15))' : 'none'),
        'opacity:' + (isPlaced ? '0.7' : '1'),
      ].join(';');

      // 缩略图
      var thumb = document.createElement('div');
      thumb.style.cssText = [
        'width:40px', 'height:40px', 'border-radius:4px', 'flex-shrink:0',
        'background-image:url(' + (deco.dataUrl || deco.url || '') + ')',
        'background-size:contain', 'background-repeat:no-repeat',
        'background-position:center',
        'background-color:var(--color-bg-primary)',
      ].join(';');
      item.appendChild(thumb);

      // 名称 + 状态
      var info = document.createElement('div');
      info.style.cssText = 'flex:1;min-width:0;';
      var name = deco.name || '未命名';
      if (name.length > 16) name = name.slice(0, 14) + '..';
      info.innerHTML = '<div style="color:var(--color-text-accent);font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
        name + '</div>' +
        (isPlaced ? '<div style="color:var(--color-accent);font-size:11px;">✅ ' +
          (UI.stickerEditor.placedLabel || '已放置') + '</div>' : '');
      item.appendChild(info);

      // 点击添加
      if (!isPlaced) {
        item.addEventListener('click', function () {
          ctx.stickersModule.addOne(ctx, deco);
        });
        item.addEventListener('mouseenter', function () {
          item.style.background = 'var(--color-hover, rgba(90,62,43,0.4))';
        });
        item.addEventListener('mouseleave', function () {
          item.style.background = 'none';
        });
      }

      content.appendChild(item);
    });
  },

  _bindDrag(panel, header, onSave) {
    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('.toggle-icon')) return;
      e.preventDefault();

      var rect = panel.getBoundingClientRect();
      var offsetX = e.clientX - rect.left;
      var offsetY = e.clientY - rect.top;
      panel.style.transition = 'none';

      var onMove = function (ev) {
        var newRight = window.innerWidth - (ev.clientX - offsetX + rect.width);
        var newBottom = window.innerHeight - (ev.clientY - offsetY + rect.height);
        newRight = Math.max(0, Math.min(newRight, window.innerWidth - 50));
        newBottom = Math.max(0, Math.min(newBottom, window.innerHeight - 50));
        panel.style.right = newRight + 'px';
        panel.style.bottom = newBottom + 'px';
        panel.style.left = 'auto';
        panel.style.top = 'auto';
      };

      var onUp = function () {
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.style.userSelect = '';
        if (onSave) onSave(parseFloat(panel.style.right) || 20, parseFloat(panel.style.bottom) || 80);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _savePos(right, bottom) {
    try {
      localStorage.setItem('sticker_console_pos', JSON.stringify({ right: right, bottom: bottom }));
    } catch (e) { /* ignore */ }
  },

  _loadPos() {
    try {
      var s = localStorage.getItem('sticker_console_pos');
      return s ? JSON.parse(s) : { right: 20, bottom: 80 };
    } catch (e) { return { right: 20, bottom: 80 }; }
  },

  destroy(panel) {
    if (panel) panel.remove();
  },
};
