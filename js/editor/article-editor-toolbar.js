/**
 * 文章编辑器悬浮工具栏 — 可拖拽、可折叠。
 *
 * 按钮：💾保存草稿 🚀发布 📌贴纸 ↩放弃 ✕退出
 * 标题编辑：工具栏内的 input 字段
 *
 * @module article-editor-toolbar
 */

import { UI } from '../utils/ui-strings.js';

export const ArticleEditorToolbar = {

  _panel: null,
  _collapsed: false,
  _visible: false,
  _callbacks: null,
  _posKey: 'article_editor_toolbar_pos',

  /**
   * @param {object} cb { onSaveDraft, onPublish, onStickers, onDiscard, onExit, onTitleChange, onToggleRender }
   */
  create(cb) {
    this._callbacks = cb || {};
    const self = this;

    const panel = document.createElement('div');
    panel.className = 'admin-panel open';
    panel.id = 'article-editor-toolbar-panel';
    panel.style.cssText = [
      'position:fixed', 'z-index:10001', 'display:block',
      'width:300px', 'min-width:48px',
      'right:20px', 'top:20px',
      'background:var(--color-bg-tertiary, #2a231c)',
      'border:1px solid var(--color-border-highlight, #c47a44)',
      'border-radius:8px', 'box-shadow:var(--shadow-md, 4px 4px 0 rgba(0,0,0,0.35))',
      'font-family:"Courier New", monospace', 'font-size:13px',
      'transition:width 0.2s',
    ].join(';');

    const pos = this._loadPos();
    panel.style.right = (pos.right || 20) + 'px';
    panel.style.top = (pos.top || 20) + 'px';
    panel.style.bottom = 'auto';
    panel.style.left = 'auto';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.style.cssText = 'cursor:grab;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = [
      '<h4 style="margin:0;font-size:14px;color:var(--color-text-heading,#e8c88a);">✎ ',
        (UI.editor.toolbarTitle || '文章编辑'),
      '</h4>',
      '<span class="toggle-icon" id="editorToolbarToggle" style="cursor:pointer;">▶</span>',
    ].join('');
    panel.appendChild(header);

    const content = document.createElement('div');
    content.className = 'panel-content';
    content.id = 'editor-toolbar-content';
    content.style.cssText = 'padding:12px;';
    content.innerHTML = _buildHTML();
    panel.appendChild(content);

    this._bindDrag(panel, header);

    const toggle = header.querySelector('#editorToolbarToggle');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      self._collapsed = !self._collapsed;
      if (self._collapsed) {
        panel.style.width = '48px'; panel.style.minWidth = '48px';
        content.style.display = 'none';
        header.querySelector('h4').style.display = 'none';
        toggle.textContent = '◀';
      } else {
        panel.style.width = '300px'; panel.style.minWidth = '';
        content.style.display = '';
        header.querySelector('h4').style.display = '';
        toggle.textContent = '▶';
      }
    });

    document.body.appendChild(panel);
    this._panel = panel;
    this._visible = true;

    this._bindButtons();

    return this;
  },

  /** 更新标题/分类显示 */
  updateInfo(title, category) {
    const ti = document.getElementById('editorToolbarTitleInput');
    const c = document.getElementById('editorToolbarCategory');
    if (ti && ti.value !== title) ti.value = title || '';
    if (c) c.textContent = category || '未分类';
  },

  /** 获取当前输入框中的标题 */
  getTitleInput() {
    const ti = document.getElementById('editorToolbarTitleInput');
    return ti ? ti.value.trim() : '';
  },

  /** 更新渲染模式按钮文案（'html' | 'text'） */
  updateRenderMode(mode) {
    const btn = document.getElementById('editorBtnToggleRender');
    if (btn) {
      const label = (mode === 'text') ? (UI.editor.renderHtml || 'HTML 渲染') : (UI.editor.renderText || '纯文本');
      btn.textContent = '🔀 ' + label;
      btn.title = (mode === 'text') ? '当前为纯文本模式，点击切换到 HTML 渲染' : '当前为 HTML 渲染模式，点击切换到纯文本';
    }
  },

  _bindButtons() {
    const cb = this._callbacks || {};
    const b = function (id, fn) {
      const el = document.getElementById(id);
      if (el && fn) el.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
    };

    b('editorBtnSaveDraft', cb.onSaveDraft);
    b('editorBtnPublish',  cb.onPublish);
    b('editorBtnStickers', cb.onStickers);
    b('editorBtnToggleRender', cb.onToggleRender);
    b('editorBtnDiscard',  cb.onDiscard);
    b('editorBtnExit',     cb.onExit);

    // 标题输入
    const self = this;
    const ti = document.getElementById('editorToolbarTitleInput');
    if (ti && cb.onTitleChange) {
      ti.addEventListener('input', function () {
        cb.onTitleChange(ti.value);
      });
    }
  },

  _bindDrag(panel, header) {
    const self = this;
    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('.toggle-icon') || e.target.closest('button') || e.target.closest('input')) return;
      e.preventDefault();
      const rect = panel.getBoundingClientRect();
      const offX = e.clientX - rect.left, offY = e.clientY - rect.top;
      panel.style.transition = 'none';
      const onMove = function (ev) {
        let r = window.innerWidth - (ev.clientX - offX + rect.width);
        let t = ev.clientY - offY;
        r = Math.max(0, Math.min(r, window.innerWidth - 50));
        t = Math.max(0, Math.min(t, window.innerHeight - 50));
        panel.style.right = r + 'px'; panel.style.top = t + 'px';
        panel.style.left = 'auto'; panel.style.bottom = 'auto';
      };
      const onUp = function () {
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        self._savePos(parseFloat(panel.style.right) || 20, parseFloat(panel.style.top) || 20);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _savePos(r, t) { try { localStorage.setItem(this._posKey, JSON.stringify({ right: r, top: t })); } catch (_) {} },
  _loadPos() { try { const s = localStorage.getItem(this._posKey); return s ? JSON.parse(s) : { right: 20, top: 20 }; } catch (_) { return { right: 20, top: 20 }; } },

  isVisible() { return this._visible; },

  destroy() {
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._visible = false; this._collapsed = false; this._callbacks = null;
  },
};

function _buildHTML() {
  return [
    // 标题输入
    '<div style="margin-bottom:12px;">',
      '<label style="color:var(--color-text-muted);font-size:11px;">', (UI.editor.titleLabel || '📌 标题'), '</label>',
      '<input id="editorToolbarTitleInput" type="text" style="',
        'width:100%;box-sizing:border-box;padding:6px 8px;',
        'background:var(--color-bg-primary);color:var(--color-text-accent);',
        'border:1px solid var(--color-border);border-radius:4px;',
        'font-family:Courier New,monospace;font-size:13px;',
        'outline:none;',
      '" placeholder="', (UI.editor.titlePlaceholder || '输入标题...'), '" value="">',
    '</div>',

    '<div style="margin-bottom:14px;">',
      '<label style="color:var(--color-text-muted);font-size:11px;">', (UI.editor.categoryLabel || '📁 分类'), '</label>',
      '<div id="editorToolbarCategory" style="color:var(--color-text-accent);font-size:13px;">—</div>',
    '</div>',

    '<div style="display:flex;flex-direction:column;gap:8px;">',
      _b('editorBtnSaveDraft', '💾 ' + (UI.editor.saveDraft || '保存草稿'), ''),
      _b('editorBtnPublish', '🚀 ' + (UI.editor.publish || '发布/应用'), 'primary'),
      _b('editorBtnStickers', '📌 ' + (UI.stickerEditor.addStickerBtn || '贴纸'), ''),
      _b('editorBtnToggleRender', '🔀 ' + (UI.editor.toggleRender || '切换渲染'), ''),
      '<div style="border-top:1px solid var(--color-border);margin:2px 0;"></div>',
      _b('editorBtnDiscard', '↩ ' + (UI.editor.cancel || '放弃修改'), ''),
      _b('editorBtnExit', '✕ ' + (UI.common.close || '退出编辑'), 'danger'),
    '</div>',
  ].join('');
}

function _b(id, label, type) {
  let bg = 'background:var(--color-bg-primary);border:1px solid var(--color-border);';
  let color = 'color:var(--color-text-accent);';
  if (type === 'primary') { bg = 'background:var(--color-accent,#c47a44);border:1px solid var(--color-border-highlight);'; color = 'color:#fff;font-weight:bold;'; }
  else if (type === 'danger') { color = 'color:var(--color-danger,#e04040);'; }
  return '<button id="' + id + '" class="toolbar-btn" style="' +
    'width:100%;padding:8px 12px;text-align:left;border-radius:4px;cursor:pointer;' +
    'font-family:Courier New,monospace;font-size:13px;' + bg + color + '">' + label + '</button>';
}

export default ArticleEditorToolbar;
