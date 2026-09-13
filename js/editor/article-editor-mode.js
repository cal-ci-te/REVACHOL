// ！文章编辑模式
// 主页面内的全屏模态所见即所得编辑器，入口 ArticleEditorMode.open(articleId)，关闭 close(save)。
// 采用分工复用策略：文章渲染与内容读写交 EditorContent，覆盖层交 EditorOverlay，
// 贴纸预览交 EditorStickers，快捷键交 EditorKeys，工具栏与草稿面板各自独立——
// 本模块只做编排与状态持有，避免单文件膨胀并绕开循环引用。
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

  // 状态

  _article: null,
  _articleId: null,
  _dirty: false,
  // _saving 兼作防重复保存/发布锁
  // _snapshot 为打开时的原始数据快照 { title, content, stickers }，用于判断是否真有改动
  _saving: false,
  _snapshot: null,

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

  // 渲染模式：html 渲染标签与贴纸；text 显示纯文本源码，不渲染标签与贴纸
  _renderMode: 'html',

  // CSS 由 EditorOverlay 管理

  // 入口

  // 打开文章编辑模式
  // 宽度小于 768px 直接拒绝：编辑依赖悬浮工具栏与宽内容区，窄屏下无法正常操作
  // 贴纸数据缺失时从正文标记回填，保证后续锚点计算有完整数据
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

    const articles = ArticleService.getAllArticles();
    const article = articles.find(function (a) { return a.id === articleId; });
    if (!article) {
      Utils.showToast('文章不存在', true);
      return;
    }

    this._article = article;
    this._articleId = articleId;
    this._dirty = false;

    if (!article.stickers || !article.stickers.length) {
      article.stickers = this._parseStickersFromContent(article.content || '');
      console.log('[ArticleEditorMode.open] 从 content 解析贴纸: ' + (article.stickers ? article.stickers.length : 0) + ' 张 | content len=' + (article.content ? article.content.length : 0));
    } else {
      console.log('[ArticleEditorMode.open] 使用已有 article.stickers: ' + article.stickers.length + ' 张');
    }

    // 深拷贝快照：贴纸对象在编辑过程中会被就地改写，存引用会让快照随之变化而失去比对意义
    this._snapshot = {
      title: article.title || '',
      content: article.content || '',
      stickers: article.stickers ? JSON.parse(JSON.stringify(article.stickers)) : [],
    };

    const decos = DecoShelf.getAll();
    if (!decos || !decos.length) {
      // 贴纸库加载失败不阻断编辑：无贴纸的文章仍可正常编辑
      try { await DecoShelf.loadLibrary(); } catch (e) {
        // 无贴纸库，仅影响贴纸渲染
      }
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

  // 关闭编辑模式
  // save 为 true 时先落盘再拆 DOM；保存为异步过程，故此处只触发不等待
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
    // save=true 表示关闭时执行了保存；false 表示无需保存（数据已在之前发布或存为草稿）
    console.log('[ArticleEditorMode] 编辑模式已关闭 | 关闭时保存=' + save + ' | _dirty=' + this._dirty);
  },

  isVisible() { return this._visible; },

  // 覆盖层与文章渲染（委托给 EditorOverlay / EditorContent）

  _createOverlay() {
    const elements = EditorOverlay.create();
    this._overlay = elements.overlay;
    this._topbar = elements.topbar;
    this._articleContainer = elements.articleContainer;
  },

  _renderArticle(article) {
    const elements = EditorContent.render(article, this._articleContainer);
    this._titleEl = elements.titleEl;
    this._contentEl = elements.contentEl;
  },

  _renderContent(text) {
    return EditorContent.renderContent(text);
  },

  _isHtmlContent(text) {
    return EditorContent._isHtmlContent(text);
  },

  // 切换渲染模式：html（渲染标签与贴纸）与 text（纯文本源码）互切
  // 切换前必须先回写当前内容：两种模式的内容读取方式不同，不回写会丢失本模式的编辑结果
  toggleRenderMode() {
    if (!this._article) return;
    this._captureContent();
    this._renderMode = (this._renderMode === 'html') ? 'text' : 'html';
    this._applyRenderMode();
    if (this._toolbar) this._toolbar.updateRenderMode(this._renderMode);
    Utils.showToast(
      this._renderMode === 'html'
        ? (UI.editor.renderHtmlToast || '已切换为 HTML 渲染模式')
        : (UI.editor.renderTextToast || '已切换为纯文本模式'),
      false
    );
  },

  // 将内容区当前内容写回 article.content（按当前模式读取，html 模式下贴纸还原为标记）
  _captureContent() {
    if (!this._contentEl || !this._article) return;
    this._article.content = this._buildSaveContent();
  },

  // 按当前渲染模式重绘内容区
  _applyRenderMode() {
    if (!this._contentEl || !this._article) return;
    const content = this._article.content || '';
    if (this._renderMode === 'text') {
      // 纯文本模式用 textContent：让 HTML 标签与贴纸标记以源码形式可见，同时天然避免 XSS
      EditorStickers.cleanup(this._contentEl);
      this._contentEl.textContent = content;
    } else {
      this._contentEl.innerHTML = EditorContent.renderContent(content);
      this._renderExistingStickers(this._article);
    }
    this._dirty = true;
  },

  // 编辑能力（委托给 EditorContent）

  _enableEditing() {
    const self = this;
    const handlers = EditorContent.enableEditing(this._titleEl, this._contentEl, function () { self._dirty = true; });
    this._inputHandler = handlers.inputHandler;
    this._pasteHandler = handlers.pasteHandler;
  },

  getTitle() {
    return EditorContent.getTitle(this._titleEl);
  },

  setTitle(val) {
    const self = this;
    EditorContent.setTitle(this._titleEl, val, this._toolbar, this._article, function () { self._dirty = true; });
  },

  getContentHTML() {
    return EditorContent.getContentHTML(this._contentEl);
  },

  // 构建待保存内容
  // 纯文本模式下内容区存的是原始源码，直接取其文本；html 模式走贴纸锚点重建
  _buildSaveContent() {
    if (this._renderMode === 'text') {
      return this._contentEl ? (this._contentEl.textContent || '') : '';
    }
    return EditorContent.buildSaveContent(this._contentEl, this._article);
  },

  _parseStickersFromContent(content) {
    return EditorContent.parseStickersFromContent(content);
  },

  hasChanges() {
    return EditorContent.hasChanges(this._snapshot, this._titleEl, this._contentEl, this._article, this._dirty);
  },

  // 贴纸渲染与交互（委托给 EditorStickers）

  // 构建贴纸模块所需的 ctx 对象
  _getStickerCtx(article) {
    const self = this;
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

  // 键盘事件

  _bindKeys() {
    this._escUnbind = EditorKeys.bind(this);
    console.log('[ArticleEditorMode] 快捷键已绑定');
  },

  // 保存操作

  // 显示反馈弹窗（保存/发布成功）
  // 同时支持按钮、点击遮罩关闭与 2.5 秒自动关闭：成功反馈无需用户确认，但也不应阻塞操作
  _showFeedbackModal(title, details) {
    const existing = document.getElementById('editor-feedback-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'editor-feedback-modal';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:10050', 'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(0,0,0,0.5)', 'backdrop-filter:blur(4px)',
    ].join(';');

    const box = document.createElement('div');
    box.style.cssText = [
      'background:var(--color-bg-tertiary, #2a231c)',
      'border:1px solid var(--color-border-highlight, #c47a44)',
      'border-radius:8px', 'padding:24px 28px', 'min-width:300px', 'max-width:420px',
      'box-shadow:var(--shadow-md, 4px 4px 0 rgba(0,0,0,0.35))',
      'font-family:Courier New,monospace', 'font-size:13px',
      'text-align:center',
    ].join(';');

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'color:var(--color-text-heading, #e8c88a);margin:0 0 16px;font-size:16px;';
    titleEl.textContent = title;
    box.appendChild(titleEl);

    if (details && details.length) {
      details.forEach(function (row) {
        const line = document.createElement('div');
        line.style.cssText = 'margin-bottom:8px;';
        // label 为内部固定文案，value 可能含用户输入，故仅对 value 转义
        line.innerHTML =
          '<span style="color:var(--color-text-muted);">' + row.label + '：</span>' +
          '<span style="color:var(--color-text-accent);">' + Utils.escapeHtml(row.value || '') + '</span>';
        box.appendChild(line);
      });
    }

    const btn = document.createElement('button');
    btn.textContent = UI.editor.modalConfirmBtn || '确定';
    btn.style.cssText = [
      'margin-top:16px', 'padding:8px 32px',
      'background:var(--color-accent, #c47a44)',
      'color:#fff', 'border:none', 'border-radius:4px',
      'cursor:pointer', 'font-family:Courier New,monospace', 'font-size:13px',
    ].join(';');
    const closeModal = function () { if (overlay.parentNode) overlay.remove(); };
    btn.addEventListener('click', closeModal);
    box.appendChild(btn);

    overlay.appendChild(box);
    // 仅点击遮罩本身才关闭，避免点击弹窗内容冒泡到遮罩
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);

    setTimeout(function () { if (overlay.parentNode) overlay.remove(); }, 2500);
  },

  // 保存草稿到后端
  // _saving 兼作互斥锁：保存为异步且可能被快捷键连续触发，不加锁会产生重复请求
  async saveDraft() {
    if (this._saving) { console.log('[ArticleEditorMode] 保存中，跳过重复请求'); return; }
    if (!this._articleId) {
      Utils.showToast(UI.editor.noArticleSelected, true);
      return;
    }

    const title = this.getTitle();
    if (!title) {
      Utils.showToast(UI.editor.titleRequired, true);
      return;
    }

    this._saving = true;
    try {
      const content = this._buildSaveContent();
      const category = this._article ? (this._article.category || '未分类') : '未分类';
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

      // 保存成功后重置快照与脏标记：此后 hasChanges 应以本次保存的内容为基准
      this._snapshot = { title: title, content: content, stickers: this._article ? JSON.parse(JSON.stringify(this._article.stickers || [])) : [] };
      this._dirty = false;
      if (this._draftManager) { await this._draftManager.refresh(); }
      console.log('[ArticleEditorMode] 草稿已保存');
    } catch (err) {
      console.error('[ArticleEditorMode] 草稿保存失败:', err);
      Utils.showToast(UI.editor.saveFailed + err.message, true);
    } finally {
      // 无论成败都释放锁，否则一次失败会让后续保存永久被跳过
      this._saving = false;
    }
  },

  // 发布或更新文章到后端
  async saveAndPublish() {
    if (this._saving) { console.log('[ArticleEditorMode] 发布中，跳过重复请求'); return; }
    if (!this._articleId) {
      Utils.showToast(UI.editor.noArticleSelected, true);
      return;
    }

    const title = this.getTitle();
    if (!title) {
      Utils.showToast(UI.editor.titleRequired, true);
      return;
    }

    this._saving = true;
    try {
      const content = this._buildSaveContent();
      const category = this._article ? (this._article.category || '未分类') : '未分类';
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

      // 通知其他标签页刷新：发布改变了服务端数据，其他标签页的缓存已过期
      try {
        const channel = new BroadcastChannel('revachol');
        channel.postMessage({ type: 'article_updated', payload: { articleId: this._articleId } });
        channel.close();
      } catch (e) {
        // 环境不支持 BroadcastChannel，跳过跨页同步
      }

      console.log('[ArticleEditorMode] 文章已发布');
    } catch (err) {
      console.error('[ArticleEditorMode] 发布失败:', err);
      Utils.showToast(UI.editor.publishFailed + err.message, true);
    } finally {
      this._saving = false;
    }
  },

  // 内部保存方法，由 close(true) 调用
  // 不 await：close 流程需同步完成拆解，且此处已有 catch 兜底记录失败
  _saveArticle() {
    if (this._dirty || this.hasChanges()) {
      this.saveAndPublish().catch(function (err) {
        console.error('[ArticleEditorMode] _saveArticle 发布失败:', err);
      });
    }
    this._dirty = false;
  },

  // 放弃所有修改，恢复到打开编辑器时的原始状态
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

  // 从草稿恢复文章内容
  // 恢复后把快照对齐到草稿：用户看到的即为「当前基准」，继续编辑才不会被误判为已修改
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

  // 打开贴纸编辑模式
  // 先存草稿再打开，保证贴纸编辑器拿到的是已落盘的内容
  // 用 _stickerEditorOpen 防重入：双击会注册多份监听器，导致保存回调被重复执行
  async _openStickers() {
    if (!this._articleId) return;
    if (this._stickerEditorOpen) return;
    this._stickerEditorOpen = true;

    try { await this.saveDraft(); } catch (e) {
      // 草稿保存失败不阻断：贴纸编辑仍可基于当前内存内容进行
    }

    // 把内容区最新编辑写回 article.content：贴纸编辑器与后续保存须基于同一份内容做锚点计算
    this._captureContent();

    const article = {
      id: this._articleId,
      title: this.getTitle(),
      content: this._article ? (this._article.content || '') : '',
      stickers: this._article ? (this._article.stickers || []) : [],
    };

    const self = this;

    // 贴纸保存后同步回文章并立即落盘，避免用户直接关闭标签页导致贴纸改动丢失
    const onStickerSaved = async function (data) {
      if (data.articleId === self._articleId && data.stickers) {
        if (self._article) {
          self._article.stickers = JSON.parse(JSON.stringify(data.stickers));
        }

        self._refreshStickerLayer();

        // 从 DOM 重建保存内容：贴纸 div 就地还原为标记，保留其在正文中的位置
        const content = self._buildSaveContent();
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
      self._stickerEditorOpen = false;
      EventBus.off(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
      EventBus.off(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);
    };

    // 保存与关闭两条路径都要解绑：只解其一会让另一条路径留下悬挂监听，造成下次打开重复触发
    var onStickerClosed = function () {
      self._stickerEditorOpen = false;
      EventBus.off(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
      EventBus.off(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);
    };

    EventBus.on(EVENTS.STICKER_EDITOR_SAVED, onStickerSaved);
    EventBus.on(EVENTS.STICKER_EDITOR_CLOSED, onStickerClosed);

    StickerEditorMode.open(article, null);
  },

  // 工具栏与草稿面板

  _createToolbar(article) {
    const self = this;

    this._toolbar = ArticleEditorToolbar.create({
      onSaveDraft: function () { self.saveDraft(); },
      onPublish: function () { self.saveAndPublish(); },
      onStickers: function () { self._openStickers(); },
      onToggleRender: function () { self.toggleRenderMode(); },
      onDiscard: function () { self.discardChanges(); },
      onTitleChange: function (val) { self.setTitle(val); },
      onExit: function () {
        if (self._dirty || self.hasChanges()) {
          const ok = confirm(UI.editor.unsavedConfirm || '有未保存的更改，确定要退出吗？');
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
    this._toolbar.updateRenderMode(this._renderMode);
  },

  // 创建草稿管理面板
  _createDraftManager(articleId) {
    const self = this;
    this._draftManager = DraftManager.create(articleId, {
      onRestore: function (draft) {
        self._restoreFromDraft(draft);
      },
    });
  },

  // 清理

  // 拆解编辑会话
  // 顺序为「状态锁 → 事件监听 → 子模块 DOM → 状态复位」，
  // 先锁住重入再拆监听，避免拆卸过程中被快捷键或事件回调再次进入
  _cleanup() {
    // 重置贴纸编辑器状态，防止编辑器被强制关闭后残留打开标记
    this._stickerEditorOpen = false;

    if (this._escUnbind) {
      this._escUnbind();
      this._escUnbind = null;
    }

    EditorContent.cleanupEditing(this._titleEl, this._contentEl, this._inputHandler, this._pasteHandler);
    this._inputHandler = null;
    this._pasteHandler = null;

    // 贴纸清理含右键菜单与浮动贴纸元素
    EditorStickers.cleanup(this._contentEl);

    EditorOverlay.destroy(this._overlay);
    this._overlay = null;
    this._articleContainer = null;
    this._titleEl = null;
    this._contentEl = null;

    if (this._toolbar) { this._toolbar.destroy(); this._toolbar = null; }

    if (this._draftManager) { this._draftManager.destroy(); this._draftManager = null; }

    // 恢复页面滚动：覆盖层打开时锁定过 body，遗漏此处会导致关闭后页面无法滚动
    document.body.style.overflow = '';
    this._article = null;
    this._articleId = null;
    this._dirty = false;
    this._snapshot = null;
  },
};

export default ArticleEditorMode;
