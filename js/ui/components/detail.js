import { Article } from '../../models/article-model.js';
import { ArticleService } from '../../services/article-service.js';
import { ArticleListStore } from '../../stores/article-list-store.js';
import { AppState } from '../../core/app-state.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';
import { MarkdownUtils } from '../../utils/markdown-utils.js';
import { StickerRenderer } from '../../editor/sticker-renderer.js';
import { StickerShape } from '../../editor/sticker-shape.js';

export const UIDetail = {
  overlay: null,
  tabsContainer: null,
  panesContainer: null,
  openArticles: [],
  activeId: null,
  minimizedContainer: null,
  isFullscreen: false,

  init: function () {
    this.overlay = document.getElementById('detailOverlay');
    this.tabsContainer = document.getElementById('detailTabs');
    this.panesContainer = document.getElementById('detailPanes');

    if (!this.overlay || !this.tabsContainer || !this.panesContainer) {
      console.warn('[UIDetail] 缺少必要元素，初始化中止');
      return;
    }

    // 构建浏览器式顶部栏：标签页在左，控件按钮在右
    this._buildTopbar();
    this._createMinimizedBar();

    this.overlay.addEventListener(
      'click',
      function (e) {
        if (e.target === this.overlay) this.closeAll();
      }.bind(this)
    );

    document.addEventListener(
      'keydown',
      function (e) {
        if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
          this.closeAll();
        }
      }.bind(this)
    );

    document.addEventListener('fullscreenchange', this._onFullscreenChange.bind(this));
    document.addEventListener('webkitfullscreenchange', this._onFullscreenChange.bind(this));
    document.addEventListener('mozfullscreenchange', this._onFullscreenChange.bind(this));
    document.addEventListener('MSFullscreenChange', this._onFullscreenChange.bind(this));

    EventBus.on(
      EVENTS.ARTICLE_MADE_INVISIBLE,
      function (data) {
        const articleId = data.articleId;
        const entry = this.openArticles.find((item) => item.id === articleId);
        if (entry) {
          if (AppState.get('isLoggedIn')) {
            Utils.showToast(UI.detail.invisibleToast, false);
            return;
          }
          const confirmClose = confirm(UI.detail.invisibleConfirm);
          if (confirmClose) {
            this.closeTab(articleId);
          }
        }
      }.bind(this)
    );

    console.log('[UIDetail] 初始化完成（浏览器式顶部栏 + 最小化栏 + 全屏）');
    setTimeout(() => { this._restoreMinimizedState(); }, 100);
  },

  _buildTopbar: function () {
    const container = this.tabsContainer.parentElement;
    // 用 detail-topbar 包裹 tabs + controls
    const topbar = document.createElement('div');
    topbar.className = 'detail-topbar';
    // 把原 tabsContainer 移入 topbar
    this.tabsContainer.parentElement.removeChild(this.tabsContainer);
    this.tabsContainer.classList.add('detail-tabs');
    topbar.appendChild(this.tabsContainer);

    // 右侧控件按钮
    const controls = document.createElement('div');
    controls.className = 'detail-topbar-controls';
    controls.innerHTML = `
      <button class="tb-minimize" title="${UI.detail.minimizeTitle}">${UI.detail.paneMinimize}</button>
      <button class="tb-fullscreen" title="${UI.detail.fullscreenTitle}">${UI.detail.paneFullscreen}</button>
      <button class="tb-close" title="${UI.common.close}">${UI.detail.paneClose}</button>
    `;
    topbar.appendChild(controls);

    // 插入回 detail-container 顶部
    container.insertBefore(topbar, container.firstChild);

    // 按钮事件绑定
    controls.querySelector('.tb-minimize').addEventListener('click', () => {
      if (this.activeId) this.minimizeTab(this.activeId);
    });
    controls.querySelector('.tb-fullscreen').addEventListener('click', () => {
      this.toggleFullscreen();
    });
    controls.querySelector('.tb-close').addEventListener('click', () => {
      if (this.activeId) this.closeTab(this.activeId);
    });
  },

  _createMinimizedBar: function () {
    const bar = document.createElement('div');
    bar.id = 'minimized-bar';
    bar.className = 'minimized-bar';
    bar.style.display = 'none';
    document.body.appendChild(bar);
    this.minimizedContainer = bar;
  },

  openDetail: function (articleId) {
    let articles;
    if (typeof ArticleService !== 'undefined' && ArticleService.getAllArticles) {
      articles = ArticleService.getAllArticles();
    } else if (Article && Article.getAllArticles) {
      articles = Article.getAllArticles();
    } else {
      articles = Article.allArticles || [];
    }
    const article = articles.find((a) => a.id === articleId);
    if (!article) {
      Utils.showToast(UI.detail.articleNotFound, true);
      return;
    }

    this.createTab(article);
  },

  createTab: function (article) {
    const id = article.id;

    // 去重：已存在激活则 focus，已最小化则恢复，都不存在才新建
    var existing = this.openArticles.find(function (e) { return e.id === id; });
    if (existing) {
      if (existing.isMinimized) {
        this.restoreFromMinimize(id);
      } else {
        this.activateTab(id);
      }
      return;
    }

    const title = article.title || UI.detail.defaultTitle;
    const rawContent = article.content || UI.detail.defaultContent;
    const html = this.renderContent(rawContent);

    const tab = document.createElement('button');
    tab.className = 'detail-tab';
    tab.dataset.id = id;
    tab.innerHTML = `
            <span class="tab-title">${Utils.escapeHtml(title)}</span>
            <span class="tab-close" data-id="${id}">${UI.detail.tabClose}</span>
        `;
    this.tabsContainer.appendChild(tab);

    const pane = document.createElement('div');
    pane.className = 'detail-pane';
    pane.dataset.id = id;
    pane.innerHTML = `
            <h1 class="detail-title">${Utils.escapeHtml(title)}</h1>
            <div class="detail-body">${html}</div>
        `;
    this.panesContainer.appendChild(pane);

    const entry = {
      id: id,
      title: title,
      tabElement: tab,
      paneElement: pane,
      isMinimized: false,
      minimizedItem: null,
    };
    if (existing) {
      existing.tabElement = tab;
      existing.paneElement = pane;
    } else {
      this.openArticles.push(entry);
    }

    tab.addEventListener(
      'click',
      function (e) {
        if (e.target.classList.contains('tab-close')) return;
        if (entry.isMinimized) this.restoreFromMinimize(id);
        this.activateTab(id);
      }.bind(this)
    );

    const closeBtn = tab.querySelector('.tab-close');
    closeBtn.addEventListener(
      'click',
      function (e) {
        e.stopPropagation();
        this.closeTab(id);
      }.bind(this)
    );

    this.activateTab(id);
    // 渲染文章贴纸
    this._renderStickersForArticle(article, pane);
    this.overlay.classList.add('active');
    document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden";
  },

  /**
   * 渲染文章内容为 HTML。
   * 统一使用 MarkdownUtils.toHTML()，与编辑器保持一致的渲染结果。
   * 贴纸标记（<!-- sticker:xxx -->）保留在内容中，由 _renderStickersForArticle
   * 通过 TreeWalker 原位替换为浮动贴纸元素。
   * @param {string} text - 文章内容（Markdown 或 HTML）
   * @returns {string} HTML
   */
  renderContent: function (text) {
    if (!text) return '';
    console.log('[UIDetail.renderContent] input len=' + (text ? text.length : 0) +
                ' | stickerMarkers=' + (text.match(/sticker:/g) || []).length +
                ' | head80=' + JSON.stringify(text ? text.substring(0, 80) : ''));
    var result = MarkdownUtils.toHTML(text);
    console.log('[UIDetail.renderContent] output len=' + (result ? result.length : 0) +
                ' | head80=' + JSON.stringify(result ? result.substring(0, 80) : ''));
    return result;
  },

  activateTab: function (id) {
    this.activeId = id;
    var isActiveNonMinimized = false;
    this.openArticles.forEach(function (item) {
      if (item.id === id) {
        if (item.tabElement) item.tabElement.classList.add('active');
        if (!item.isMinimized) {
          isActiveNonMinimized = true;
          if (item.paneElement) item.paneElement.classList.add('active');
        } else {
          if (item.paneElement) item.paneElement.classList.remove('active');
        }
      } else {
        if (item.tabElement) item.tabElement.classList.remove('active');
        if (item.paneElement) item.paneElement.classList.remove('active');
      }
    });
    // 详情页激活时隐藏最小化栏，关闭/全最小化时恢复
    if (this.minimizedContainer) {
      this.minimizedContainer.style.display = isActiveNonMinimized ? 'none' : '';
    }
  },

  minimizeTab: function (id) {
    const entry = this.openArticles.find((item) => item.id === id);
    if (!entry || entry.isMinimized) return;

    entry.isMinimized = true;
    entry.paneElement.classList.remove('active');

    this._addToMinimizedBar(entry);
    this._saveMinimizedState();
    Utils.showToast(UI.detail.minimizeToast, false);

    const next = this.openArticles.find((item) => !item.isMinimized && item.id !== id);
    if (next) {
      this.activateTab(next.id);
    } else {
      this.overlay.classList.remove('active');
      document.documentElement.style.overflow = ''; document.body.style.overflow = '';
      this.activeId = null;
    }
  },

  _addToMinimizedBar: function (entry) {
    this._renderMinimizedBar();
  },

  _renderMinimizedBar: function () {
    const bar = this.minimizedContainer;
    if (!bar) return;
    // 清空并全量重渲染（保证顺序与 openArticles 一致）
    bar.innerHTML = '';
    const minimized = this.openArticles.filter(function (e) { return e.isMinimized; });
    if (minimized.length === 0) {
      bar.style.display = 'none';
      return;
    }
    // 有激活的非最小化标签页时隐藏，避免覆盖在详情页上方
    var hasActive = this.openArticles.some(function (e) { return !e.isMinimized; });
    bar.style.display = hasActive ? 'none' : 'flex';
    var self = this;
    minimized.forEach(function (entry) {
      const item = document.createElement('div');
      item.className = 'minimized-item';
      item.dataset.id = entry.id;
      item.innerHTML = '' +
        '<span class="minimized-title">' + Utils.escapeHtml(entry.title) + '</span>' +
        '<span class="minimized-restore" data-id="' + entry.id + '">' + UI.detail.restoreFromMinimize + '</span>' +
        '<span class="minimized-close" data-id="' + entry.id + '">' + UI.detail.paneClose + '</span>';
      bar.appendChild(item);
      entry.minimizedItem = item;

      item.querySelector('.minimized-title').addEventListener('click', function () {
        self.restoreFromMinimize(entry.id);
      });
      item.querySelector('.minimized-restore').addEventListener('click', function (e) {
        e.stopPropagation();
        self.restoreFromMinimize(entry.id);
      });
      item.querySelector('.minimized-close').addEventListener('click', function (e) {
        e.stopPropagation();
        self.closeTab(entry.id);
      });
    });
    bar.scrollLeft = bar.scrollWidth;
  },

  _saveMinimizedState: function () {
    var data = this.openArticles
      .filter(function (e) { return e.isMinimized; })
      .map(function (e) { return { id: e.id, title: e.title }; });
    Utils.storage.set('minimized_articles', data);
  },

  _restoreMinimizedState: function () {
    var self = this;
    var data = Utils.storage.get('minimized_articles');
    if (!data || !Array.isArray(data) || data.length === 0) return;
    data.forEach(function (item) {
      self.openArticles.push({
        id: item.id,
        title: item.title,
        tabElement: null,
        paneElement: null,
        isMinimized: true,
        minimizedItem: null,
      });
    });
    this._renderMinimizedBar();
  },

  restoreFromMinimize: function (id) {
    const entry = this.openArticles.find((item) => item.id === id);
    if (!entry || !entry.isMinimized) return;

    entry.isMinimized = false;
    if (entry.minimizedItem) { entry.minimizedItem = null; }
    this._renderMinimizedBar();

    // 持久化条目（无 paneElement）：获取文章数据后通过 createTab 渲染
    if (!entry.paneElement) {
      this.openArticles = this.openArticles.filter(function (e) { return e.id !== id; });
      this._renderMinimizedBar();
      var article = ArticleListStore.getArticleById(id);
      if (article) { this.createTab(article); }
      else { Utils.showToast(UI.detail.defaultContent, true); }
      return;
    }

    entry.paneElement.classList.add('active');
    this.activateTab(id);
    this.overlay.classList.add('active');
    document.documentElement.style.overflow = "hidden"; document.body.style.overflow = "hidden";
    this._saveMinimizedState();
  },

  toggleFullscreen: function () {
    const isFullscreen = !!(document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement);
    if (isFullscreen) {
      this._exitFullscreen();
    } else {
      this._requestFullscreen();
    }
    this._updateFullscreenButtons();
  },

  _requestFullscreen: function () {
    const el = document.documentElement;
    if (el.requestFullscreen) el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen) el.mozRequestFullScreen();
    else if (el.msRequestFullscreen) el.msRequestFullscreen();
  },

  _exitFullscreen: function () {
    if (document.exitFullscreen) document.exitFullscreen();
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    else if (document.mozCancelFullScreen) document.mozCancelFullScreen();
    else if (document.msExitFullscreen) document.msExitFullscreen();
  },

  _onFullscreenChange: function () {
    this._updateFullscreenButtons();
  },

  _updateFullscreenButtons: function () {
    const isFullscreen = !!(document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement);
    const btns = document.querySelectorAll('.pane-fullscreen');
    btns.forEach(function (btn) {
      btn.textContent = isFullscreen ? UI.detail.paneFullscreenExit : UI.detail.paneFullscreen;
      btn.title = isFullscreen ? UI.detail.fullscreenTitle : UI.detail.fullscreenTitle;
    });
  },

  closeTab: function (id) {
    const index = this.openArticles.findIndex((item) => item.id === id);
    if (index === -1) return;
    const entry = this.openArticles[index];

    if (entry.minimizedItem) {
      entry.minimizedItem.remove();
      entry.minimizedItem = null;
    }
    if (entry.tabElement) entry.tabElement.remove();
    if (entry.paneElement) entry.paneElement.remove();
    this.openArticles.splice(index, 1);

    this._renderMinimizedBar();

    if (this.openArticles.length > 0) {
      const next = this.openArticles.find((item) => !item.isMinimized);
      if (next) {
        this.activateTab(next.id);
      } else {
        this.overlay.classList.remove('active');
        document.documentElement.style.overflow = ''; document.body.style.overflow = '';
        this.activeId = null;
      }
    } else {
      this.overlay.classList.remove('active');
      document.documentElement.style.overflow = ''; document.body.style.overflow = '';
      this.activeId = null;
      if (document.fullscreenElement) this._exitFullscreen();
    }
    this._saveMinimizedState();
  },

  closeAll: function () {
    while (this.openArticles.length > 0) {
      const item = this.openArticles[0];
      if (item.minimizedItem) item.minimizedItem.remove();
      if (item.tabElement) item.tabElement.remove();
      if (item.paneElement) item.paneElement.remove();
      this.openArticles.splice(0, 1);
    }
    if (this.minimizedContainer) {
      this.minimizedContainer.innerHTML = '';
      this.minimizedContainer.style.display = 'none';
    }
    this.overlay.classList.remove('active');
    document.documentElement.style.overflow = ''; document.body.style.overflow = '';
    this.activeId = null;
    if (document.fullscreenElement) this._exitFullscreen();
  },

  /** 在阅读面板中渲染文章贴纸（从 article.stickers 或内容标记解析）。
   *  委托 StickerRenderer 在标记原始位置替换为浮动贴纸元素。 */
  _renderStickersForArticle: function (article, pane) {
    if (!pane) return;
    // 清除旧贴纸
    var existing = pane.querySelectorAll('.detail-sticker, .article-sticker, .sticker-clearfix');
    existing.forEach(function (el) { el.remove(); });

    // 优先使用 article.stickers 数组
    var stickers = article.stickers;
    if (!stickers || !stickers.length) {
      var parsed = this._parseStickerMarkers(article.content || '');
      stickers = parsed.stickers;
      console.log('[UIDetail._renderStickersForArticle] 从 content 解析到 ' + stickers.length + ' 张贴纸');
      if (stickers.length) {
        var s0 = stickers[0];
        console.log('[UIDetail._renderStickersForArticle] sticker[0]: decoId=' + s0.decoId +
                    ' | w=' + s0.width + ' h=' + s0.height +
                    ' | align=' + s0.align + ' shape=' + s0.shape + ' vertices=' + s0.vertices +
                    ' | margin=' + s0.margin + ' x=' + s0.x + ' y=' + s0.y);
      }
    } else {
      console.log('[UIDetail._renderStickersForArticle] 使用已有 article.stickers: ' + stickers.length + ' 张');
    }
    if (!stickers || !stickers.length) {
      console.warn('[UIDetail._renderStickersForArticle] 无贴纸数据，跳过渲染。article.stickers=' + JSON.stringify(article.stickers));
      return;
    }
    console.log('[UIDetail._renderStickersForArticle] 开始渲染 ' + stickers.length + ' 张贴纸');

    // 找到正文容器（.detail-body），贴纸需注入正文流中才能触发 float + shape-outside 绕排
    var bodyEl = pane.querySelector('.detail-body');
    if (!bodyEl) bodyEl = pane;
    console.log('[UIDetail._renderStickersForArticle] bodyEl=' + (bodyEl ? (bodyEl.tagName + '.' + bodyEl.className) : 'null') +
                ' | childNodes=' + (bodyEl ? bodyEl.childNodes.length : 0));

    // 检查 bodyEl 中是否有 marker 注释节点
    var commentCount = 0;
    if (bodyEl) {
      var walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_COMMENT);
      while (walker.nextNode()) { commentCount++; }
    }
    console.log('[UIDetail._renderStickersForArticle] bodyEl 中注释节点总数: ' + commentCount);

    // 延迟到下一帧渲染贴纸，让浏览器先完成内容布局，避免浮动元素尺寸为零
    var self = this;
    requestAnimationFrame(function () {
      StickerRenderer.renderInArticle(bodyEl, stickers);
    });
  },

  /** 从内容中解析贴纸标记（复用 StickerRenderer._MARKER_REGEX 统一正则） */
  _parseStickerMarkers: function (content) {
    var stickers = [];
    var regex = StickerRenderer._MARKER_REGEX;
    regex.lastIndex = 0; // 重置全局正则状态（共享实例可能被其他模块使用后残留 lastIndex）
    var match;
    while ((match = regex.exec(content)) !== null) {
      console.log('[UIDetail._parseStickerMarkers] 匹配到标记: index=' + match.index + ' | raw=' + match[0].substring(0, 80));
      var fields = StickerRenderer._parseMarkerContent(match[1]);
      console.log('[UIDetail._parseStickerMarkers] 解析字段: decoId=' + fields.decoId +
                  ' | x=' + fields.x + ' y=' + fields.y +
                  ' | w=' + fields.w + ' h=' + fields.h +
                  ' | align=' + fields.align + ' shape=' + fields.shape +
                  ' | vertices=' + fields.vertices + ' margin=' + fields.margin);
      stickers.push({
        decoId: fields.decoId,
        x: fields.x ? parseInt(fields.x) : StickerShape.DEFAULT_X,
        y: fields.y ? parseInt(fields.y) : StickerShape.DEFAULT_Y + stickers.length * StickerShape.DEFAULT_GAP,
        width: parseInt(fields.w) || 100,
        height: parseInt(fields.h) || 100,
        w: parseInt(fields.w) || StickerShape.DEFAULT_SIZE,
        h: parseInt(fields.h) || StickerShape.DEFAULT_SIZE,
        align: fields.align || 'left',
        margin: fields.margin !== undefined ? parseInt(fields.margin) : StickerShape.DEFAULT_MARGIN,
        pos: fields.pos !== undefined ? parseInt(fields.pos) : -1,
      });
    }
    return { stickers: stickers };
  },
};

