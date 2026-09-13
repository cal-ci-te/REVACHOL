// ！UI 总控
// 统一持有各 UI 子模块引用，负责首屏初始化编排与全局刷新入口。
// 子模块各自持有 DOM 引用，此处只做装配与事件转发，不参与具体渲染。
import { DOMRefs } from '../core/dom-refs.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { AppState } from '../core/app-state.js';
import { ArticleService } from '../services/article-service.js';
import { Sidebar } from './components/sidebar.js';
import { UISearch } from './components/search.js';
import { UIDirectory } from './components/directory/index.js';
import { UIArticles } from './components/articles.js';
import { UIDetail } from './components/detail.js';
import { UIHelpers } from './components/helpers.js';

export const UIController = {
  sidebar: Sidebar,
  search: UISearch,
  directory: UIDirectory,
  articles: UIArticles,
  detail: UIDetail,
  helpers: UIHelpers,
  elements: {},
  _dataLoaded: false,
  _refreshPending: false,

  // 集中查询 DOM 并初始化各子模块
  init() {
    console.log('[UIController] 初始化开始...');

    this.elements = {
      sidebar: DOMRefs.get(DOMRefs.sidebar.container),
      overlay: DOMRefs.get(DOMRefs.sidebar.overlay),
      treeContainer: DOMRefs.get(DOMRefs.sidebar.directoryTree),
      articlesContainer: DOMRefs.get(DOMRefs.articles.container),
      searchInput: DOMRefs.get(DOMRefs.sidebar.searchInput),
      detailOverlay: DOMRefs.get(DOMRefs.detail.overlay),
      detailBody: DOMRefs.get(DOMRefs.detail.body),
      detailCloseBtn: DOMRefs.get(DOMRefs.detail.closeBtn),
    };

    if (Sidebar.init) {
      Sidebar.init(this.elements.sidebar, this.elements.overlay, this.elements.treeContainer);
    }
    if (UIDirectory.init) {
      UIDirectory.init(this.elements.treeContainer);
    }
    if (UISearch.init) {
      UISearch.init(this.elements.searchInput, this.elements.treeContainer);
    }
    if (UIArticles.init) {
      UIArticles.init(this.elements.articlesContainer, this.elements.searchInput);
    }
    if (UIDetail.init) {
      UIDetail.init();
    }

    EventBus.on(EVENTS.ARTICLE_DATA_LOADED, () => {
      console.log('[UIController] 文章数据已加载，刷新显示');
      this._dataLoaded = true;
      this.refreshDisplay();
    });

    // 可见性变更同样走全量刷新：目录树与卡片列表都可能受影响
    EventBus.on(EVENTS.ARTICLE_VISIBILITY_CHANGED, () => {
      this.refreshDisplay();
    });

    this.bindGlobalEvents();

    // 已有数据时直接渲染，否则先占位：首屏不应因等待网络而空白
    const existingData = ArticleService.getAllArticles();
    if (existingData && existingData.length > 0) {
      this._dataLoaded = true;
      this.refreshDisplay();
    } else {
      if (this.elements.treeContainer) {
        this.elements.treeContainer.innerHTML =
          '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">📖 加载中...</div>';
      }
      if (this.elements.articlesContainer) {
        this.elements.articlesContainer.innerHTML = '<div class="loading">⏳ 正在加载角色...</div>';
      }
    }

    console.log('[UIController] 初始化完成');
    EventBus.emit(EVENTS.UI_INITIALIZED);
  },

  // 合并同一轮内的刷新请求
  // 用微任务而非直接刷新：数据加载时会连续触发多个事件，合并后只渲染一次
  refreshDisplay() {
    if (this._refreshPending) return;
    this._refreshPending = true;
    Promise.resolve().then(() => {
      this._refreshPending = false;
      this._doRefresh();
    });
  },

  // 刷新占位/列表
  // 列表渲染由 ArticleListStore 订阅事件后驱动，这里只保证加载态文案正确
  _doRefresh() {
    console.log('[UIController] 刷新显示...');
    console.log('[UIController] 刷新显示...');
   // ArticleListStore 已订阅数据变更事件，自动管理列表
   // 这里只需确保加载状态显示正确
   if (!this._dataLoaded) {
       if (this.elements.treeContainer) {
           this.elements.treeContainer.innerHTML =
               '<div style="padding: 20px; text-align: center; color: var(--color-text-muted);">📖 加载中...</div>';
       }
       if (this.elements.articlesContainer) {
           this.elements.articlesContainer.innerHTML =
               '<div class="loading">⏳ 正在加载角色...</div>';
       }
   }
   // 数据加载完成后，ArticleListStore 会自动触发 ARTICLES_LIST_UPDATED
   // UIArticles 会响应并重新渲染
   console.log('[UIController] 刷新完成');

  },

  // 保留接口（已废弃）
  loadData() {
    // 已废弃
  },

  // 保留接口（已废弃）
  // 可见性控制已移至目录树，这里仅向旧面板写入提示文案
  updateArticleListPanel(_articles, _categories) {
    console.log('[UIController] updateArticleListPanel 已废弃');
    const panel = DOMRefs.get(DOMRefs.adminControls.articleListPanel);
    if (panel) {
      panel.innerHTML =
        '<div style="color: var(--color-text-muted); text-align: center; padding: 10px;">可见性控制已移至目录树</div>';
    }
  },

  // 绑定全局事件
  bindGlobalEvents() {
    const collapseBtn = DOMRefs.get(DOMRefs.sidebar.toggleBtn);
    if (collapseBtn) {
      collapseBtn.addEventListener('click', () => {
        Sidebar.toggleCollapse();
      });
    }
    console.log('[UIController] 全局事件绑定完成');
  },
};

