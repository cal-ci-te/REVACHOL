// ！文章只读视图
// Article 是 ArticleService 的只读代理。早期代码直接使用 Article 对象，重构为 ArticleService 单一数据源后
// 保留此代理层，避免改动 20+ 处调用点；写入被静默忽略，读取始终反映 Service 的当前数据。
// TODO(待指派): 全部调用点改用 ArticleService 后移除此文件，触发条件为 Article.xxx 引用清零。

import { ArticleService } from '../services/article-service.js';

export const Article = {
    // 属性代理
    get allArticles() {
        return ArticleService.getAllArticles();
    },
    set allArticles(value) {
        // 忽略写入：保持只读视图语义，避免外部绕过 Service 改数据
    },
    get visibility() {
        const all = ArticleService.getAllArticles();
        const map = {};
        all.forEach(a => { map[a.id] = a.visible !== false; });
        return map;
    },
    get cache() {
        return ArticleService.cache;
    },

    // 方法代理
    fetchArticles: ArticleService.fetchArticles.bind(ArticleService),
    getVisibleArticles: ArticleService.getVisibleArticles.bind(ArticleService),
    getAllArticles: ArticleService.getAllArticles.bind(ArticleService),
    setVisibility: ArticleService.setVisibility.bind(ArticleService),
    onVisibilityChanged: ArticleService.onVisibilityChanged.bind(ArticleService),
    clearCache: ArticleService.clearCache.bind(ArticleService),
    getStats: ArticleService.getStats.bind(ArticleService),

    isVisible: ArticleService.isVisible.bind(ArticleService),
    getArticlesByCategory: ArticleService.getArticlesByCategory.bind(ArticleService),
    getAllCategories: ArticleService.getAllCategories.bind(ArticleService),
    buildDirectoryTree: ArticleService.buildDirectoryTree.bind(ArticleService),
};

