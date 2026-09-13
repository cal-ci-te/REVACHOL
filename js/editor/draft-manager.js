// ！草稿管理面板
// 可拖拽、可折叠的侧边面板，展示当前文章的全部草稿版本，支持预览、恢复与删除。
// 位置持久化到 localStorage，折叠状态仅存内存（属临时视图偏好，不值得跨会话保留）。
import { ApiClient } from '../services/api-client.js';
import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

export const DraftManager = {

  _panel: null,
  _articleId: null,
  _visible: false,
  _collapsed: false,
  _drafts: [],

  // 恢复回调：function(draft)
  onRestore: null,

  _posKey: 'article_editor_draft_pos',

  // 创建草稿管理面板
  // 折叠态宽度取 48px，与面板内 toggle 图标宽度一致，避免折叠后图标贴边被裁切
  create(articleId, callbacks) {
    this._articleId = articleId;
    this.onRestore = (callbacks && callbacks.onRestore) || null;
    const self = this;

    const panel = document.createElement('div');
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

    const pos = this._loadPos();
    panel.style.left = (pos.left || 20) + 'px';
    panel.style.top = (pos.top || 80) + 'px';

    const header = document.createElement('div');
    header.className = 'panel-header';
    header.style.cssText = 'cursor:grab;display:flex;justify-content:space-between;align-items:center;';
    header.innerHTML = [
      '<h4 style="margin:0;font-size:14px;color:var(--color-text-heading,#e8c88a);">',
        '📋 ', (UI.draft.previewTitle || '草稿管理'),
      '</h4>',
      '<span class="toggle-icon" id="draftPanelToggle" style="cursor:pointer;">▶</span>',
    ].join('');
    panel.appendChild(header);

    const content = document.createElement('div');
    content.className = 'panel-content';
    content.id = 'draft-panel-content';
    content.style.cssText = [
      'padding:8px 10px', 'max-height:320px', 'overflow-y:auto',
      'scrollbar-width:thin', 'scrollbar-color:var(--color-border) transparent',
    ].join(';');
    content.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:16px;">加载中...</div>';
    panel.appendChild(content);

    this._bindDrag(panel, header);

    // 折叠/展开：同时收起标题与内容，只留 toggle 图标供再次点开
    const toggle = header.querySelector('#draftPanelToggle');
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

    this.refresh();

    return this;
  },

  // 刷新草稿列表
  // 每次刷新都重新拉取：草稿可由其他标签页或自动保存写入，本地缓存可能已过期
  async refresh() {
    if (!this._articleId || !this._visible) return;

    const content = document.getElementById('draft-panel-content');
    if (!content) return;

    try {
      const drafts = await ApiClient.get('/api/articles/' + this._articleId + '/drafts');
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

  // 渲染草稿列表 HTML
  // 预览先剥掉 HTML 标签再截断：直接截断会把标签从中间切断，显示出错乱片段
  // 预览文本经 escapeHtml 转义后才拼入 innerHTML，防止草稿内容注入标记
  _renderList() {
    const self = this;
    let html = '';

    this._drafts.forEach(function (draft) {
      const savedAt = new Date(draft.saved_at);
      const timeStr = savedAt.toLocaleString('zh-CN', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
      const preview = (draft.content || '')
        .replace(/<[^>]*>/g, '')
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

  // 绑定恢复与删除事件
  // 每次重渲染后都要重新绑定：列表用 innerHTML 整体重建，旧节点上的监听随节点一同丢弃
  _bindEvents() {
    const self = this;

    document.querySelectorAll('#draft-panel-content .draft-restore-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const draftId = parseInt(btn.dataset.draftId);
        const draft = self._drafts.find(function (d) { return d.id === draftId; });
        if (draft) self._restoreDraft(draft);
      });
    });

    document.querySelectorAll('#draft-panel-content .draft-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const draftId = parseInt(btn.dataset.draftId);
        self._deleteDraft(draftId);
      });
    });

    // 双击整条草稿同样触发恢复，减少一次精确点击
    document.querySelectorAll('#draft-panel-content .draft-item').forEach(function (item) {
      item.addEventListener('dblclick', function () {
        const draftId = parseInt(item.dataset.draftId);
        const draft = self._drafts.find(function (d) { return d.id === draftId; });
        if (draft) self._restoreDraft(draft);
      });
    });
  },

  // 恢复草稿
  // 覆盖当前编辑内容属破坏性操作，故必须经确认；实际写入由外部 onRestore 回调完成
  _restoreDraft(draft) {
    const timeStr = new Date(draft.saved_at).toLocaleString('zh-CN');
    const ok = confirm(
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

  // 删除草稿
  // 后端返回 404 视为「已不存在」，同步从本地列表移除，避免刷新后仍显示一条幽灵记录
  async _deleteDraft(draftId) {
    const draft = this._drafts.find(function (d) { return d.id === draftId; });
    const timeStr = draft && draft.saved_at ? new Date(draft.saved_at).toLocaleString('zh-CN') : '';
    if (!confirm(UI.draft.deleteConfirm(timeStr) || '确定要删除该草稿吗？')) return;

    try {
      await ApiClient.delete('/api/articles/' + this._articleId + '/drafts/' + draftId);
      Utils.showToast(UI.draft.deleteSuccess || '草稿已删除', false);
    } catch (err) {
      console.warn('[DraftManager] 删除请求失败:', err.message, '| 从本地列表移除此草稿');
      Utils.showToast(UI.draft.deleteFailed ? UI.draft.deleteFailed(err.message) : '删除失败', true);
      if (err.status === 404 || (err.message && err.message.includes('not found'))) {
        this._drafts = this._drafts.filter(function (d) { return d.id !== draftId; });
        this._renderAfterDelete();
      }
      return;
    }
    this.refresh();
  },

  // 删除后重新渲染列表（不重新 fetch）
  _renderAfterDelete() {
    const content = document.getElementById('draft-panel-content');
    if (!content) return;
    if (!this._drafts.length) {
      content.innerHTML = '<div style="text-align:center;color:var(--color-text-muted);padding:16px;">' +
        (UI.draft.noHistory || '暂无草稿历史') + '</div>';
      return;
    }
    content.innerHTML = this._renderList();
    this._bindEvents();
  },

  // 切换当前文章 ID
  // 面板可见时立即刷新：否则会继续展示上一篇文章的草稿列表
  setArticleId(articleId) {
    this._articleId = articleId;
    if (this._visible) this.refresh();
  },

  // 面板拖拽
  // 拖拽期间关闭 width 过渡（transition:none）：保留过渡会让面板滞后于光标
  // 移动范围夹在视口内减去 50px，保证标题栏始终留有可抓取区域
  _bindDrag(panel, header) {
    const self = this;

    header.addEventListener('mousedown', function (e) {
      // 点折叠图标或按钮时不进入拖拽，否则点击会被拖拽逻辑吞掉
      if (e.target.closest('.toggle-icon') || e.target.closest('button')) return;
      e.preventDefault();

      const rect = panel.getBoundingClientRect();
      const offX = e.clientX - rect.left;
      const offY = e.clientY - rect.top;
      panel.style.transition = 'none';

      const onMove = function (ev) {
        let l = ev.clientX - offX;
        let t = ev.clientY - offY;
        l = Math.max(0, Math.min(l, window.innerWidth - 50));
        t = Math.max(0, Math.min(t, window.innerHeight - 50));
        panel.style.left = l + 'px';
        panel.style.top = t + 'px';
        // 清掉 right/bottom：否则与 left/top 同时生效时定位会被另一组值覆盖
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
      };

      const onUp = function () {
        panel.style.transition = '';
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        self._savePos(parseFloat(panel.style.left) || 20, parseFloat(panel.style.top) || 80);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  },

  // 保存面板位置，localStorage 不可用时静默忽略
  _savePos(l, t) { try { localStorage.setItem(this._posKey, JSON.stringify({ left: l, top: t })); } catch (_) {} },
  // 读取面板位置，解析失败回落默认值
  _loadPos() { try { const s = localStorage.getItem(this._posKey); return s ? JSON.parse(s) : { left: 20, top: 80 }; } catch (_) { return { left: 20, top: 80 }; } },

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
