/**
 * 文章编辑器草稿管理面板 — 可拖拽、可折叠的侧边面板。
 *
 * 显示当前文章的所有草稿版本，支持：
 *   - 时间显示（格式化）
 *   - 内容预览（30 字截断）
 *   - 恢复草稿 → 加载到编辑器
 *   - 删除草稿
 *   - 保存后自动刷新
 *
 * 样式复用 .admin-panel（与工具栏一致）。
 *
 * @module draft-manager
 */

import { ApiClient } from '../services/api-client.js';
import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

export const DraftManager = {

  _panel: null,
  _articleId: null,
  _visible: false,
  _collapsed: false,
  _drafts: [],

  /** 恢复回调：function(draft) */
  onRestore: null,

  _posKey: 'article_editor_draft_pos',

  /**
   * 创建草稿管理面板。
   * @param {number} articleId
   * @param {object} callbacks - { onRestore(draft) }
   * @returns {object} this
   */
  create(articleId, callbacks) {
    this._articleId = articleId;
    this.onRestore = (callbacks && callbacks.onRestore) || null;
    var self = this;

    // 面板容器
    var panel = document.createElement('div');
    panel.className = 'admin-panel open';
    panel.id = 'article-editor-draft-panel';
    panel.style.cssText = [
      'position:fixed', 'z-index:10001', 'display:block',
      'width:280px', 'min-width:48px',
      'left:20px', 'top:80px',
      'background:var(--color-bg-tertiary, #2a231c)',
      'border:1px solid var(--color-border-highlight, #c47a44)',
      'border-radius:8px', 'box-shadow:var(--shadow-md, 4px 4px 0 rgba(0,0,0,0.35))',
      'font-family:\"Courier New\", monospace', 'font-size:12px',
      'transition:width 0.2s', 'max-height:400px',
    ].join(';');

    // 恢复位置
    var pos = this._loadPos();
    panel.style.left = (pos.left || 20) + 'px';
    panel.style.top = (pos.top || 80) + 'px';

    // 标题栏
    var header = document.createElement('div');
    header.className = 'panel-header';
    header.style.cssText = 'cursor:grab;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = [
      '<h4 style="margin:0;font-size:14px;color:var(--color-text-heading,#e8c88a);">',
        '📋 ', (UI.draft.previewTitle || '草稿管理'),
      '</h4>',
      '<span class="toggle-icon" id="draftPanelToggle" style="cursor:pointer;">▶</span>',
    ].join('');
    panel.appendChild(header);

    // 内容区
    var content = document.createElement('div');
    content.className = 'panel-content';
    content.id = 'draft-panel-content';
    content.style.cssText = [
      'padding:8px 10px', 'max-height:320px', 'overflow-y:auto',
      'scrollbar-width:thin', 'scrollbar-color:var(--color-border) transparent',
    ].join(';');
    content.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:16px;">加载中...</div>';
    panel.appendChild(content);

    // 拖拽
    this._bindDrag(panel, header);

    // 折叠
    var toggle = header.querySelector('#draftPanelToggle');
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      self._collapsed = !self._collapsed;
      if (self._collapsed) {
        panel.style.width = '48px';
        panel.style.minWidth = '48px';
        content.style.display = 'none';
        header.querySelector('h4').style.display = 'none';
        toggle.textContent = '◀';
      } else {
        panel.style.width = '280px';
        panel.style.minWidth = '';
        content.style.display = '';
        header.querySelector('h4').style.display = '';
        toggle.textContent = '▶';
      }
    });

    document.body.appendChild(panel);
    this._panel = panel;
    this._visible = true;

    // 加载草稿列表
    this.refresh();

    return this;
  },

  /** 刷新草稿列表 */
  async refresh() {
    if (!this._articleId || !this._visible) return;

    var content = document.getElementById('draft-panel-content');
    if (!content) return;

    try {
      var drafts = await ApiClient.get('/api/articles/' + this._articleId + '/drafts');
      this._drafts = drafts || [];

      if (!this._drafts.length) {
        content.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:16px;">' +
          (UI.draft.noHistory || '暂无草稿历史') + '</div>';
        return;
      }

      content.innerHTML = this._renderList();
      this._bindEvents();
    } catch (err) {
      console.error('[DraftManager] 加载失败:', err);
      content.innerHTML = '<div style="color:var(--color-error);text-align:center;padding:16px;">' +
        (UI.draft.loadFailed || '加载失败') + '</div>';
    }
  },

  /** 渲染草稿列表 HTML */
  _renderList() {
    var self = this;
    var html = '';

    this._drafts.forEach(function (draft) {
      var savedAt = new Date(draft.saved_at);
      var timeStr = savedAt.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      var preview = (draft.content || '')
        .replace(/<[^>]*>/g, '')  // 去 HTML 标签
        .substring(0, 40) + ((draft.content || '').length > 40 ? '…' : '');

      html += [
        '<div class="draft-item" data-draft-id="' + draft.id + '" style="',
          'padding:8px 6px;margin-bottom:6px;border-radius:4px;',
          'border:1px solid var(--color-border);',
          'background:var(--color-bg-primary);',
          'cursor:default;',
        '">',
          '<div style="color:var(--color-text-accent);font-size:12px;margin-bottom:4px;">',
            timeStr,
          '</div>',
          '<div style="color:var(--color-text-muted);font-size:11px;',
            'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-bottom:6px;',
          '">', Utils.escapeHtml(preview), '</div>',
          '<div style="display:flex;gap:4px;">',
            '<button class="draft-restore-btn" data-draft-id="' + draft.id + '" style="',
              'flex:1;padding:4px 6px;font-size:11px;font-family:Courier New,monospace;',
              'background:var(--color-accent,#c47a44);color:#fff;border:none;border-radius:3px;cursor:pointer;',
            '">', (UI.draft.restoreBtn || '↩ 恢复'), '</button>',
            '<button class="draft-delete-btn" data-draft-id="' + draft.id + '" style="',
              'padding:4px 8px;font-size:11px;font-family:Courier New,monospace;',
              'background:none;color:var(--color-danger,#e04040);border:1px solid var(--color-danger,#e04040);',
              'border-radius:3px;cursor:pointer;',
            '">', (UI.draft.deleteBtn || '🗑'), '</button>',
          '</div>',
        '</div>',
      ].join('');
    });

    return html;
  },

  /** 绑定恢复/删除事件 */
  _bindEvents() {
    var self = this;

    document.querySelectorAll('#draft-panel-content .draft-restore-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var draftId = parseInt(btn.dataset.draftId);
        var draft = self._drafts.find(function (d) { return d.id === draftId; });
        if (draft) self._restoreDraft(draft);
      });
    });

    document.querySelectorAll('#draft-panel-content .draft-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var draftId = parseInt(btn.dataset.draftId);
        self._deleteDraft(draftId);
      });
    });

    // 双击恢复
    document.querySelectorAll('#draft-panel-content .draft-item').forEach(function (item) {
      item.addEventListener('dblclick', function () {
        var draftId = parseInt(item.dataset.draftId);
        var draft = self._drafts.find(function (d) { return d.id === draftId; });
        if (draft) self._restoreDraft(draft);
      });
    });
  },

  /** 恢复草稿 */
  _restoreDraft(draft) {
    var timeStr = new Date(draft.saved_at).toLocaleString('zh-CN');
    var ok = confirm(
      (UI.draft.restoreConfirm && UI.draft.restoreConfirm(timeStr)) ||
      '确定要将文章恢复为 ' + timeStr + ' 的草稿版本吗？'
    );
    if (!ok) return;

    if (this.onRestore) {
      this.onRestore(draft);
    }

    Utils.showToast(UI.draft.restoreSuccess || '已恢复草稿版本', false);
    console.log('[DraftManager] 已恢复草稿:', draft.id);
  },

  /** 删除草稿 */
  async _deleteDraft(draftId) {
    var draft = this._drafts.find(function (d) { return d.id === draftId; });
    var timeStr = draft && draft.saved_at ? new Date(draft.saved_at).toLocaleString('zh-CN') : '';
    if (!confirm(UI.draft.deleteConfirm(timeStr) || '确定要删除该草稿吗？')) return;

    try {
      await ApiClient.delete('/api/articles/' + this._articleId + '/drafts/' + draftId);
      Utils.showToast(UI.draft.deleteSuccess || '草稿已删除', false);
      this.refresh();
    } catch (err) {
      console.error('[DraftManager] 删除失败:', err);
      Utils.showToast(UI.draft.deleteFailed ? UI.draft.deleteFailed(err.message) : '删除失败', true);
    }
  },

  /** 更新当前文章 ID */
  setArticleId(articleId) {
    this._articleId = articleId;
    if (this._visible) this.refresh();
  },

  /** 拖拽 */
  _bindDrag(panel, header) {
    var self = this;

    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('.toggle-icon') || e.target.closest('button')) return;
      e.preventDefault();

      var rect = panel.getBoundingClientRect();
      var offX = e.clientX - rect.left;
      var offY = e.clientY - rect.top;
      panel.style.transition = 'none';

      var onMove = function (ev) {
        var l = ev.clientX - offX;
        var t = ev.clientY - offY;
        l = Math.max(0, Math.min(l, window.innerWidth - 50));
        t = Math.max(0, Math.min(t, window.innerHeight - 50));
        panel.style.left = l + 'px';
        panel.style.top = t + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      var onUp = function () {
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        self._savePos(parseFloat(panel.style.left) || 20, parseFloat(panel.style.top) || 80);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  _savePos(l, t) { try { localStorage.setItem(this._posKey, JSON.stringify({ left: l, top: t })); } catch (_) {} },
  _loadPos() { try { var s = localStorage.getItem(this._posKey); return s ? JSON.parse(s) : { left: 20, top: 80 }; } catch (_) { return { left: 20, top: 80 }; } },

  isVisible() { return this._visible; },

  destroy() {
    if (this._panel) { this._panel.remove(); this._panel = null; }
    this._visible = false;
    this._collapsed = false;
    this._drafts = [];
    this.onRestore = null;
  },
};

export default DraftManager;
