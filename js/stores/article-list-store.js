// ！文章列表状态
// 承载首页文章列表的分页、搜索过滤与加载更多状态，数据源为 ArticleService。
// 不做数据缓存：文章增删改由事件驱动重新拉取，本 store 只维护「显示到第几页」这类视图状态。

import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { ArticleService } from '../services/article-service.js';

export const ArticleListStore = {
    _currentPage: 1,
    _pageSize: 10,
    _isSearchMode: false,
    _searchKeyword: '',
    _isLoadingMore: false,
    _initialized: false,

    // 初始化并订阅数据事件
    init() {
        if (this._initialized) return;
        this._initialized = true;
        console.log('[ArticleListStore] 初始化，订阅数据变更事件');

        EventBus.on(EVENTS.ARTICLE_DATA_LOADED, () => {
            console.log('[ArticleListStore] 收到数据加载事件，刷新列表');
            this._resetPagination();
            this._notify();
        });

        EventBus.on(EVENTS.ARTICLES_UPDATED, () => {
            console.log('[ArticleListStore] 收到数据更新事件，刷新列表');
            this._resetPagination();
            this._notify();
        });

        // 登出后隐藏文章对访客不可见，可见列表需重新过滤
        EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => {
            console.log('[ArticleListStore] 收到登出事件，重新过滤文章列表');
            this._resetPagination();
            this._notify();
        });

        // 登录后管理员可见全部文章（含隐藏），可见列表随之扩张
        EventBus.on(EVENTS.AUTH_LOGGED_IN, () => {
            console.log('[ArticleListStore] 收到登录事件，显示全部文章');
            this._resetPagination();
            this._notify();
        });

        // 已有数据时立即通知，避免等待下一次事件才首屏渲染
        if (ArticleService.getAllArticles().length > 0) {
            this._resetPagination();
            this._notify();
        }
    },

    // 重置分页
    _resetPagination() {
        this._currentPage = 1;
        this._isLoadingMore = false;
    },

    // 生成过滤后的完整列表
    // 搜索同时匹配标题与正文，忽略大小写
    _getFullList() {
        const all = ArticleService.getVisibleArticles();
        if (this._isSearchMode && this._searchKeyword) {
            const kw = this._searchKeyword.toLowerCase();
            return all.filter(a =>
                (a.title && a.title.toLowerCase().includes(kw)) ||
                (a.content && a.content.toLowerCase().includes(kw))
            );
        }
        return all;
    },


    // 获取当前显示列表
    // 按页大小向前截断：分页语义是「显示到第 N 页」而非切片
    getDisplayArticles() {
        const full = this._getFullList();
        const end = this._currentPage * this._pageSize;
        return full.slice(0, end);
    },

    // 判断是否还有更多
    getHasMore() {
        const full = this._getFullList();
        return this._currentPage * this._pageSize < full.length;
    },

    // 加载更多
    loadMore() {
        if (this._isLoadingMore || !this.getHasMore()) return;
        this._isLoadingMore = true;
        this._currentPage++;
        this._isLoadingMore = false;
        this._notify();
    },

    // 进入搜索模式
    setSearchMode(keyword) {
        if (!keyword || keyword.trim() === '') {
            this.exitSearchMode();
            return;
        }
        this._isSearchMode = true;
        this._searchKeyword = keyword.trim();
        this._resetPagination();
        this._notify();
    },

    // 退出搜索模式
    exitSearchMode() {
        if (!this._isSearchMode) return;
        this._isSearchMode = false;
        this._searchKeyword = '';
        this._resetPagination();
        this._notify();
    },

    // 获取搜索关键词
    getSearchKeyword() {
        return this._searchKeyword;
    },

    // 判断是否搜索模式
    getIsSearchMode() {
        return this._isSearchMode;
    },

    // 获取当前页码
    getCurrentPage() {
        return this._currentPage;
    },

    // 获取每页大小
    getPageSize() {
        return this._pageSize;
    },

    // 判断是否加载中
    getIsLoadingMore() {
        return this._isLoadingMore;
    },

    // 广播列表更新
    _notify() {
        EventBus.emit(EVENTS.ARTICLES_LIST_UPDATED);
    },

    // 已废弃入口
    resetToFullList() {
        console.warn('[ArticleListStore] resetToFullList 已废弃，由事件驱动刷新');
        // 保留旧行为：调用仍重置分页并通知，避免旧调用点静默失效
        this._resetPagination();
        this._notify();
    },

    // 已废弃入口
    setSearchResults() {
        console.warn('[ArticleListStore] setSearchResults 已废弃，请使用 setSearchMode');
    },

    getSearchResults() {
        return this.getDisplayArticles();
    },

    // 透传 ArticleService 的数据查询，逐步收敛两处耦合

    // 按 ID 查找单篇
    getArticleById(id) {
        return ArticleService.getAllArticles().find(function (a) { return a.id === id; }) || null;
    },

    // 获取全部文章
    getAllArticles() {
        return ArticleService.getAllArticles();
    },

    // 切换可见性
    async setVisibility(id, visible) {
        return ArticleService.setVisibility(id, visible);
    },

    // 获取可见文章
    getVisibleArticles() {
        return ArticleService.getVisibleArticles();
    },

    // 构建目录树
    buildDirectoryTree(articles) {
        return ArticleService.buildDirectoryTree(articles);
    },

    // 获取子分类
    getCategoryChildren(parentId) {
        return ArticleService.getCategoryChildren(parentId);
    },

    // 按 ID 查找分类
    findCategoryById(id) {
        return ArticleService.findCategoryById(id);
    },

    // 迁移子分类父级
    reparentCategoryChildren(oldParentId, newParentId) {
        ArticleService.reparentCategoryChildren(oldParentId, newParentId);
    },
};

// 模块加载即初始化：首页首屏依赖列表状态，延后初始化会漏掉早期事件
ArticleListStore.init();

