/**
 * 文章编辑模式 — 主页面内的全屏模态 WYSIWYG 文章编辑器。
 *
 * 复用策略：
 *   1. 文章渲染 → 复用 UIDetail.renderContent 的 Markdown→HTML 逻辑
 *   2. 全屏覆盖层 → 复用 StickerEditorMode._createOverlay 模式
 *   3. 贴纸展示 → 从 article.stickers 渲染贴纸（只读，Phase 4 后交互）
 *   4. ESC 退出 → 复用贴纸编辑模式的按键处理
 *
 * 入口：ArticleEditorMode.open(articleId)
 * 关闭：ArticleEditorMode.close(save)
 *
 * @module article-editor-mode
 */

import { ArticleService } from '../services/article-service.js';
import { DecoShelf } from '../services/deco.js';
import { ApiClient } from '../services/api-client.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { UI } from '../utils/ui-strings.js';
import { Utils } from '../utils.js';
import { StickerRenderer } from './sticker-renderer.js';
import { ArticleEditorToolbar } from './article-editor-toolbar.js';
import { StickerEditorMode } from './sticker-editor/index.js';
import { DraftManager } from './draft-manager.js';
import { EditorKeys } from './editor-keys.js';
import { EditorStickers } from './editor-stickers.js';
import { EditorOverlay } from './editor-overlay.js';
import { EditorContent } from './editor-content.js';

export const ArticleEditorMode = {

  // ---- 状态 ----

  _article: null,
  _articleId: null,
  _dirty: false,
  _saving: false,           // 防重复保存/发布锁
  _snapshot: null,        // 打开时的原始数据快照 { title, content, stickers }

  _overlay: null,
  _articleContainer: null,
  _titleEl: null,
  _contentEl: null,
  _toolbar: null,
  _draftManager: null,

  _visible: false,
  _escUnbind: null,
  _inputHandler: null,
  _pasteHandler: null,

  // ---- CSS 由 EditorOverlay 管理 ----

  // =========================================================================
  //  入口
  // =========================================================================

  /**
   * 打开文章编辑模式。
   * @param {number} articleId - 文章 ID
   */
  async open(articleId) {
    if (this._visible) {
      console.warn('[ArticleEditorMode] 编辑模式已打开');
      return;
    }

    if (window.innerWidth <= 768) {
      Utils.showToast('文章编辑功能仅支持桌面端', true);
      return;
    }

    console.log('[ArticleEditorMode] 打开编辑模式，文章 ID:', articleId);

    var articles = ArticleService.getAllArticles();
    var article = articles.find(function (a) { return a.id === articleId; });
    if (!article) {
      Utils.showToast('文章不存在', true);
      return;
    }

    this._article = article;
    this._articleId = articleId;
    this._dirty = false;

    // 确保贴纸数据已加载（从内容标记解析）
    if (!article.stickers || !article.stickers.length) {
      article.stickers = this._parseStickersFromContent(article.content || '');
      console.log('[ArticleEditorMode.open] 从 content 解析贴纸: ' + (article.stickers ? article.stickers.length : 0) + ' 张 | content len=' + (article.content ? article.content.length : 0));
    } else {
      console.log('[ArticleEditorMode.open] 使用已有 article.stickers: ' + article.stickers.length + ' 张');
    }

    // 快照：用于检测是否真的有修改（含贴纸数据）
    this._snapshot = {
      title: article.title || '',
      content: article.content || '',
      stickers: article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [],
    };

    // 加载贴纸库
    var decos = DecoShelf.getAll();
    if (!decos || !decos.length) {
      try { await DecoShelf.loadLibrary(); } catch (e) { /* 继续 */ }
    }

    EditorOverlay.ensureCSS();
    this._createOverlay();
    this._renderArticle(article);
    this._renderExistingStickers(article);
    this._enableEditing();
    this._createToolbar(article);
    this._createDraftManager(articleId);
    this._bindKeys();

    this._visible = true;
    document.body.style.overflow = 'hidden';

    EventBus.emit(EVENTS.STICKER_EDITOR_OPENED, { articleId: articleId });
    EventBus.emit(EVENTS.EDITOR_OPENED, { articleId: articleId });
    console.log('[ArticleEditorMode] 编辑模式已打开');
  },

  /**
   * 关闭编辑模式。
   * @param {boolean} save - 是否保存更改
   */
  close(save) {
    if (!this._visible) return;

    if (save) {
      this._saveArticle();
    }

    this._cleanup();

    EventBus.emit(EVENTS.STICKER_EDITOR_CLOSED, {
      articleId: this._articleId,
      saved: save,
    });
    EventBus.emit(EVENTS.EDITOR_CLOSED, { articleId: this._articleId, saved: save });

    this._visible = false;
    console.log('[ArticleEditorMode] 编辑模式已关闭, save:', save);
  },

  isVisible() { return this._visible; },

  // =========================================================================
  //  覆盖层 — 委托给 EditorOverlay 模块
  // =========================================================================

  _createOverlay() {
    var elements = EditorOverlay.create();
    this._overlay = elements.overlay;
    this._topbar = elements.topbar;
    this._articleContainer = elements.articleContainer;
  },

  // =========================================================================
  //  文章渲染 — 委托给 EditorContent 模块
  // =========================================================================

  _renderArticle(article) {
    var elements = EditorContent.render(article, this._articleContainer);
    this._titleEl = elements.titleEl;
    this._contentEl = elements.contentEl;
  },

  _renderContent(text) {
    return EditorContent.renderContent(text);
  },

  _isHtmlContent(text) {
    return EditorContent._isHtmlContent(text);
  },

  // =========================================================================
  //  编辑能力 — 委托给 EditorContent 模块
  // =========================================================================

  _enableEditing() {
    var self = this;
    var handlers = EditorContent.enableEditing(this._titleEl, this._contentEl, function () { self._dirty = true; });
    this._inputHandler = handlers.inputHandler;
    this._pasteHandler = handlers.pasteHandler;
  },

  getTitle() {
    return EditorContent.getTitle(this._titleEl);
  },

  setTitle(val) {
    var self = this;
    EditorContent.setTitle(this._titleEl, val, this._toolbar, this._article, function () { self._dirty = true; });
  },

  getContentHTML() {
    return EditorContent.getContentHTML(this._contentEl);
  },

  _buildSaveContent() {
    return EditorContent.buildSaveContent(this._contentEl, this._article);
  },

  _parseStickersFromContent(content) {
    return EditorContent.parseStickersFromContent(content);
  },

  hasChanges() {
    return EditorContent.hasChanges(this._snapshot, this._titleEl, this._contentEl, this._article, this._dirty);
  },

  // =========================================================================
  //  贴纸渲染与交互 — 委托给 EditorStickers 模块
  // =========================================================================

  /** 构建贴纸模块所需的 ctx 对象 */
  _getStickerCtx(article) {
    var self = this;
    return {
      contentEl: self._contentEl,
      article: article || self._article,
      onDirty: function () { self._dirty = true; },
    };
  },

  _renderExistingStickers(article) {
    EditorStickers.render(this._getStickerCtx(article));
  },

  _refreshStickerLayer() {
    EditorStickers.refresh(this._getStickerCtx());
  },

    // =========================================================================
  //  键盘事件
  // =========================================================================

  _bindKeys() {
    this._escUnbind = EditorKeys.bind(this);
    console.log('[ArticleEditorMode] 快捷键已绑定');
  },

  // =========================================================================
  //  保存操作
  // =========================================================================

  /**
   * 显示反馈弹窗（保存/发布成功）。
   * @param {string} title - 弹窗标题
   * @param {Array<{label:string, value:string}>} details - 详情行 [{label, value}]
   */
  _showFeedbackModal(title, details) {
    var existing = document.getElementById('editor-feedback-modal');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'editor-feedback-modal';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:10050', 'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.5)', 'backdrop-filter:blur(4px)',
    ].join(';');

    var box = document.createElement('div');
    box.style.cssText = [
      'background:var(--color-bg-tertiary, #2a231c)',
      'border:1px solid var(--color-border-highlight, #c47a44)',
      'border-radius:8px', 'padding:24px 28px', 'min-width:300px', 'max-width:420px',
      'box-shadow:var(--shadow-md, 4px 4px 0 rgba(0,0,0,0.35))',
      'font-family:Courier New,monospace', 'font-size:13px',
      'text-align:center',
    ].join(';');

    var titleEl = document.createElement('h3');
    titleEl.style.cssText = 'color:var(--color-text-heading, #e8c88a);margin:0 0 16px;font-size:16px;';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    if (details && details.length) {
      details.forEach(function (row) {
        var line = document.createElement('div');
        line.style.cssText = 'margin-bottom:8px;';
        line.innerHTML =
          '<span style="color:var(--color-text-muted);">' + row.label + '：</span>' +
          '<span style="color:var(--color-text-accent);">' + Utils.escapeHtml(row.value || '') + '</span>';
        box.appendChild(line);
      });
    }

    var btn = document.createElement('button');
    btn.textContent = UI.editor.modalConfirmBtn || '确定';
    btn.style.cssText = [
      'margin-top:16px', 'padding:8px 32px',
      'background:var(--color-accent, #c47a44)',
      'color:#fff', 'border:none', 'border-radius:4px',
      'cursor:pointer', 'font-family:Courier New,monospace', 'font-size:13px',
    ].join(';');
    var closeModal = function () { if (overlay.parentNode) overlay.remove(); };
    btn.addEventListener('click', closeModal);
    box.appendChild(btn);

    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);

    setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 2500);
  },

  /**
   * 保存草稿到后端。
   */
  async saveDraft() {
    if (this._saving) { console.log('[ArticleEditorMode] 保存中，跳过重复请求'); return; }
    if (!this._articleId) {
      Utils.showToast(UI.editor.noArticleSelected, true);
      return;
    }

    var title = this.getTitle();
    if (!title) {
      Utils.showToast(UI.editor.titleRequired, true);
      return;
    }

    this._saving = true;
    try {
      var content = this._buildSaveContent();
      var category = this._article ? (this._article.category || '未分类') : '未分类';
      await ApiClient.post('/api/articles/' + this._articleId + '/drafts', {
        title: title,
        content: content,
        category: category,
      });
      Utils.showToast(UI.editor.saveSuccess, false);
      this._showFeedbackModal(UI.editor.modalDraftSavedTitle, [
        { label: UI.editor.modalDraftSavedTime, value: new Date().toLocaleString() },
        { label: UI.editor.titleLabel, value: title }
      ]);

      this._snapshot = { title: title, content: content, stickers: this._article ? JSON.parse(JSON.stringify(this._article.stickers || [])) : [] };
      this._dirty = false;
      if (this._draftManager) { this._draftManager.refresh(); }
      console.log('[ArticleEditorMode] 草稿已保存');
    } catch (err) {
      console.error('[ArticleEditorMode] 草稿保存失败:', err);
      Utils.showToast(UI.editor.saveFailed + err.message, true);
    } finally {
      this._saving = false;
    }
  },

  /**
   * 发布/更新文章到后端。
   */
  async saveAndPublish() {
    if (this._saving) { console.log('[ArticleEditorMode] 发布中，跳过重复请求'); return; }
    if (!this._articleId) {
      Utils.showToast(UI.editor.noArticleSelected, true);
      return;
    }

    var title = this.getTitle();
    if (!title) {
      Utils.showToast(UI.editor.titleRequired, true);
      return;
    }

    this._saving = true;
    try {
      var content = this._buildSaveContent();
      var category = this._article ? (this._article.category || '未分类') : '未分类';
      await ApiClient.put('/api/articles/' + this._articleId, {
        title: title,
        content: content,
        category: category,
      });

      await ArticleService.fetchArticles(true);

      Utils.showToast(UI.editor.publishSuccess, false);
      this._showFeedbackModal(UI.editor.modalPublishSuccessTitle, [
        { label: UI.editor.modalPublishSuccessDetail, value: title },
        { label: UI.editor.categoryLabel, value: category }
      ]);

      this._snapshot = { title: title, content: content, stickers: this._article ? JSON.parse(JSON.stringify(this._article.stickers || [])) : [] };
      this._dirty = false;

      try {
        var channel = new BroadcastChannel('revachol');
        channel.postMessage({ type: 'article_updated', payload: { articleId: this._articleId } });
        channel.close();
      } catch (e) { /* ignore */ }

      console.log('[ArticleEditorMode] 文章已发布');
    } catch (err) {
      console.error('[ArticleEditorMode] 发布失败:', err);
      Utils.showToast(UI.editor.publishFailed + err.message, true);
    } finally {
      this._saving = false;
    }
  },

  /**
   * 内部保存方法，由 close(true) 调用。
   */
  _saveArticle() {
    if (this._dirty || this.hasChanges()) {
      this.saveAndPublish().catch(function (err) {
        console.error('[ArticleEditorMode] _saveArticle 发布失败:', err);
      });
    }
    this._dirty = false;
  },

  /**
   * 放弃所有修改，恢复到打开编辑器时的原始状态。
   */
  discardChanges() {
    if (!this._snapshot) return;
    if (!(this._dirty || this.hasChanges())) {
      Utils.showToast('没有需要放弃的修改', false);
      return;
    }

    if (this._titleEl) {
      this._titleEl.textContent = this._snapshot.title;
    }
    if (this._contentEl) {
      this._contentEl.innerHTML = this._renderContent(this._snapshot.content);
    }
    this._snapshot = {
      title: this._titleEl ? this._titleEl.textContent.trim() : '',
      content: this._snapshot.content,
    };
    this._dirty = false;

    if (this._toolbar) {
      this._toolbar.updateInfo(
        this._snapshot.title || '未命名',
        this._article ? (this._article.category || this._article.categoryName || '未分类') : ''
      );
    }

    Utils.showToast('已恢复到编辑前的状态', false);
    console.log('[ArticleEditorMode] 已放弃修改');
  },

  /**
   * 从草稿恢复文章内容。
   * @param {object} draft - { id, title, content, category, saved_at }
   */
  _restoreFromDraft(draft) {
    if (!draft) return;

    if (this._titleEl && draft.title) {
      this._titleEl.textContent = draft.title;
    }
    if (this._contentEl && draft.content) {
      this._contentEl.innerHTML = this._renderContent(draft.content);
    }
    if (this._article && draft.content) {
      this._article.stickers = this._parseStickersFromContent(draft.content);
      this._refreshStickerLayer();
    }

    this._dirty = true;
    this._snapshot = {
      title: draft.title || '',
      content: draft.content || '',
      stickers: this._article ? JSON.parse(JSON.stringify(this._article.stickers || [])) : [],
    };

    if (this._toolbar) {
      this._toolbar.updateInfo(
        draft.title || '未命名',
        draft.category || '未分类'
      );
    }

    console.log('[ArticleEditorMode] 已从草稿恢复:', draft.id);
  },

  /**
   * 打开贴纸编辑模式（StickerEditorMode）。
   * 先保存当前草稿，再以当前文章数据打开贴纸编辑器。
   */
  async _openStickers() {
    if (!this._articleId) return;

    try { await this.saveDraft(); } catch (e) { /* 不阻断 */ }

    var article = {
      id: this._articleId,
      title: this.getTitle(),
      content: this._article ? (this._article.content || '') : '',
      stickers: this._article ? (this._article.stickers || []) : [],
    };

    var self = this;

    var onStickerSaved = async function (data) {
      if (data.articleId === self._articleId && data.stickers) {
        if (self._article) {
          self._article.stickers = JSON.parse(JSON.stringify(data.stickers));
        }

        self._refreshStickerLayer();

        // 从 DOM 构建保存内容（贴纸 div 就地替换为标记，保留位置）
        var content = self._buildSaveContent();
        if (self._article) {
          self._article.content = content;
        }
        console.log('[ArticleEditorMode.onStickerSaved] content 已更新, len=' + content.length);

        try {
          await ApiClient.put('/api/articles/' + self._articleId, {
            title: self.getTitle(),
            content: content,
            category: self._article ? (self._article.category || '未分类') : '未分类',
          });
          console.log('[ArticleEditorMode] 贴纸已同步到后端');
        } catch (err) {
          console.error('[ArticleEditorMode] 贴纸同步后端失败:', err);
        }

        self._dirty = true;
      }
      EventBus.off(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
      EventBus.off(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);
    };

    var onStickerClosed = function () {
      EventBus.off(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
      EventBus.off(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);
    };

    EventBus.on(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
    EventBus.on(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);

    StickerEditorMode.open(article, null);
  },

  // =========================================================================
  //  工具栏
  // =========================================================================

  _createToolbar(article) {
    var self = this;

    this._toolbar = ArticleEditorToolbar.create({
      onSaveDraft: function () { self.saveDraft(); },
      onPublish: function () { self.saveAndPublish(); },
      onStickers: function () { self._openStickers(); },
      onDiscard: function () { self.discardChanges(); },
      onTitleChange: function (val) { self.setTitle(val); },
      onExit: function () {
        if (self._dirty || self.hasChanges()) {
          var ok = confirm(UI.editor.unsavedConfirm || '有未保存的更改，确定要退出吗？');
          if (ok) self.close(false);
        } else {
          self.close(false);
        }
      },
    });

    this._toolbar.updateInfo(
      article.title || '未命名',
      article.category || article.categoryName || '未分类'
    );
  },

  /** 创建草稿管理面板 */
  _createDraftManager(articleId) {
    var self = this;
    this._draftManager = DraftManager.create(articleId, {
      onRestore: function (draft) {
        self._restoreFromDraft(draft);
      },
    });
  },

  // =========================================================================
  //  清理
  // =========================================================================

  _cleanup() {
    // 键盘事件
    if (this._escUnbind) {
      this._escUnbind();
      this._escUnbind = null;
    }

    // 编辑事件（由 EditorContent 管理）
    EditorContent.cleanupEditing(this._titleEl, this._contentEl, this._inputHandler, this._pasteHandler);
    this._inputHandler = null;
    this._pasteHandler = null;

    // 贴纸清理（右键菜单 + 浮动贴纸元素 DOM）
    EditorStickers.cleanup(this._contentEl);

    // DOM（覆盖层由 EditorOverlay 管理）
    EditorOverlay.destroy(this._overlay);
    this._overlay = null;
    this._articleContainer = null;
    this._titleEl = null;
    this._contentEl = null;

    // 工具栏
    if (this._toolbar) { this._toolbar.destroy(); this._toolbar = null; }

    // 草稿管理面板
    if (this._draftManager) { this._draftManager.destroy(); this._draftManager = null; }

    // 状态
    document.body.style.overflow = '';
    this._article = null;
    this._articleId = null;
    this._dirty = false;
    this._snapshot = null;
  },
};

export default ArticleEditorMode;
