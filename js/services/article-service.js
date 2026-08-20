
import { CONFIG } from '../config.js';
import { EventBus } from '../core/event-bus.js';
import { AppState } from '../core/app-state.js';
import { EVENTS } from '../core/event-constants.js';
import { NotificationService } from './notification-service.js';
import { StorageAdapter } from './storage-adapter.js';
import { ApiClient } from './api-client.js';
import { UI } from '../utils/ui-strings.js';

export const ArticleService = {
    _data: [],
    cache: { data: null, timestamp: null },

    _categories: [],
    _categoryCacheKey: 'categories',
    _initialCategoriesLoaded: false,

    // ---- 加载分类 ----
    _loadCategories(forceFromStorage = false) {
        const saved = StorageAdapter.get(this._categoryCacheKey);
        if (saved && Array.isArray(saved) && saved.length > 0) {
            this._categories = saved.map(c => ({
                id: c.id || c.name,
                name: c.name || c.id,
                parent: c.parent !== undefined ? c.parent : null
            }));
            return;
        }
        if (!this._initialCategoriesLoaded && this._categories.length === 0) {
            const all = this.getAllArticles();
            const cats = new Set();
            all.forEach(a => {
                const cat = a.category || a.categoryName || '未分类';
                cats.add(cat);
            });
            this._categories = Array.from(cats).map(name => ({ id: name, name, parent: null }));
            if (!this._categories.some(c => c.id === '未分类')) {
                this._categories.push({ id: '未分类', name: '未分类', parent: null });
            }
            this._saveCategories();
            this._initialCategoriesLoaded = true;
        }
    },

    _saveCategories() {
        StorageAdapter.set(this._categoryCacheKey, this._categories);
    },

    // ---- 公开分类方法 ----
    getAllCategories() {
        return this._categories.slice();
    },

    getCategoryTree() {
        const map = {};
        const roots = [];
        this._categories.forEach(cat => {
            map[cat.id] = { ...cat, children: [] };
        });
        this._categories.forEach(cat => {
            if (cat.parent && map[cat.parent]) {
                map[cat.parent].children.push(map[cat.id]);
            } else {
                roots.push(map[cat.id]);
            }
        });
        return roots;
    },

    getCategoryParent(categoryId) {
        const cat = this._categories.find(c => c.id === categoryId);
        return cat ? cat.parent : undefined;
    },

    /** 获取指定分类的直接子分类 */
    getCategoryChildren(parentId) {
        return this._categories.filter(function (c) { return c.parent === parentId; });
    },

    /** 按 ID 查找分类 */
    findCategoryById(id) {
        return this._categories.find(function (c) { return c.id === id; }) || null;
    },

    addCategory(name, parentId = null) {
        const trimmed = name.trim();
        if (!trimmed) return false;
        if (this._categories.some(c => c.name === trimmed && c.parent === parentId)) {
            return false;
        }
        if (parentId !== null && parentId !== undefined) {
            const parentExists = this._categories.some(c => c.id === parentId);
            if (!parentExists) return false;
        }
        let maxOrder = 0;
        this._categories.forEach(function (c) {
            if (c.sort_order != null && c.sort_order >= maxOrder) maxOrder = c.sort_order + 1;
        });
        const newCat = { id: trimmed, name: trimmed, parent: parentId, sort_order: maxOrder };
        this._categories.push(newCat);
        this._saveCategories();
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { categoryAdded: trimmed });
        return true;
    },

    moveCategory(categoryId, newParentId) {
        const cat = this._categories.find(c => c.id === categoryId);
        if (!cat) return false;
        if (categoryId === newParentId) return false;
        if (cat.parent === newParentId) return true;
        if (newParentId !== null && newParentId !== undefined) {
            const parentExists = this._categories.some(c => c.id === newParentId);
            if (!parentExists) return false;
            const isAncestor = (id, targetId) => {
                const children = this._categories.filter(c => c.parent === id);
                for (const child of children) {
                    if (child.id === targetId) return true;
                    if (isAncestor(child.id, targetId)) return true;
                }
                return false;
            };
            if (isAncestor(categoryId, newParentId)) return false;
        }
        cat.parent = newParentId;
        this._saveCategories();
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED);
        return true;
    },

    /** 将旧父 ID 下所有子分类迁移到新父 ID */
    reparentCategoryChildren(oldParentId, newParentId) {
        this._categories.forEach(function (c) {
            if (c.parent === oldParentId) c.parent = newParentId;
        });
        this._saveCategories();
    },

    /** 从 _categories 中移除单个分类条目（不处理子分类和文章） */
    removeCategoryEntry(categoryId) {
        const idx = this._categories.findIndex(function (c) { return c.id === categoryId; });
        if (idx === -1) return false;
        this._categories.splice(idx, 1);
        this._saveCategories();
        return true;
    },

    /** 批量移除指定 ID 的分类条目 */
    removeCategoriesByIds(ids) {
        this._categories = this._categories.filter(function (c) { return !ids.includes(c.id); });
        this._saveCategories();
    },

    /**
     * 设置根级分类排序（Plan 3 接口 — 拖拽排序时调用）。
     * 传入按期望顺序排列的分类 id 数组，未出现的分类保持原有 sort_order。
     * @param {string[]} orderedIds - 按期望顺序排列的根级分类 id 列表
     */
    setCategoriesOrder(orderedIds) {
        if (!Array.isArray(orderedIds)) return;
        orderedIds.forEach(function (id, index) {
            const cat = this._categories.find(function (c) { return c.id === id; });
            if (cat) cat.sort_order = index;
        }, this);
        this._saveCategories();
    },

    /** 将新创建的文章加入本地缓存，避免全量重新拉取 */
    addArticleToCache(article) {
        if (!article || !article.id) return;
        const all = this.getAllArticles();
        if (!all.some(function (a) { return a.id === article.id; })) {
            all.push(article);
        }
        this._data = all;
        this.cache = { data: all, timestamp: Date.now() };
    },

    /** 保存当前数据快照（深拷贝，用于撤销/恢复） */
    saveSnapshot() {
        return {
            articles: JSON.parse(JSON.stringify(this._data || [])),
            categories: JSON.parse(JSON.stringify(this._categories || [])),
        };
    },

    /** 从快照恢复数据（含缓存清除） */
    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        this._data = snapshot.articles;
        this._categories = snapshot.categories;
        this.cache.data = null;
        this.cache.timestamp = null;
    },

    /** 重命名分类并迁移子分类的 parent 引用 */
    renameCategory(oldId, newName) {
        const cat = this._categories.find(function (c) { return c.id === oldId; });
        if (!cat) return false;
        cat.id = newName;
        cat.name = newName;
        this._categories.forEach(function (c) {
            if (c.parent === oldId) c.parent = newName;
        });
        this._saveCategories();
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { categoryRenamed: { oldId: oldId, newId: newName } });
        // 同步更新文章的 category 字段
        const self = this;
        self._data.forEach(function (a) {
            if (a.category === oldId) a.category = newName;
        });
        return true;
    },

    removeCategory(categoryId) {
        const cat = this._categories.find(c => c.id === categoryId);
        if (!cat) return false;
        if (categoryId === '未分类') {
            Utils.showToast(UI.toast.articleServiceCannotDeleteDefaultCategory, true);
            return false;
        }
        const getDescendantIds = (id) => {
            const children = this._categories.filter(c => c.parent === id);
            let ids = [id];
            children.forEach(c => {
                ids = ids.concat(getDescendantIds(c.id));
            });
            return ids;
        };
        const idsToDelete = getDescendantIds(categoryId);
        this._categories = this._categories.filter(c => !idsToDelete.includes(c.id));
        this._saveCategories();
        const all = this.getAllArticles();
        let needSave = false;
        all.forEach(a => {
            if (idsToDelete.includes(a.category)) {
                a.category = '未分类';
                needSave = true;
            }
        });
        if (needSave) {
            this.cache = { data: this._data, timestamp: Date.now() };
            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { categoryRemoved: categoryId });
        }
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { categoriesUpdated: true });
        return true;
    },

    async fetchArticles(forceRefresh = false) {
        const now = Date.now();
        const cacheTTL = CONFIG.CACHE_TTL || 5 * 60 * 1000;
        if (!forceRefresh && this.cache.data && now - this.cache.timestamp < cacheTTL) {
            console.log('[ArticleService] 使用缓存数据');
            return this.cache.data;
        }
        try {
            const result = await ApiClient.get('/api/articles');
            let articles = result;
            if (result.articles && Array.isArray(result.articles)) {
                articles = result.articles;
            } else if (result.data && Array.isArray(result.data)) {
                articles = result.data;
            }
            if (!Array.isArray(articles)) throw new Error('响应不是数组');
            if (articles.length === 0) {
                console.warn('[ArticleService] 后端返回空数据，使用模拟数据');
                return this._loadMockData();
            }
            this._saveData(articles);
            console.log('[ArticleService] 从后端获取文章，共', articles.length, '篇');
            this._loadCategories();
            return articles;
        } catch (error) {
            console.error('[ArticleService] 获取文章失败:', error);
            return this._loadMockData();
        }
    },

    _saveData(articles) {
        this._data = articles;
        this.cache = { data: articles, timestamp: Date.now() };
        EventBus.emit(EVENTS.ARTICLE_DATA_LOADED, { articles });
        this._loadCategories();
    },

    _loadMockData() {
        const mockData = this._generateMockArticles();
        this._saveData(mockData);
        console.log('[ArticleService] 使用模拟数据，共', mockData.length, '篇');
        return mockData;
    },

    _generateMockArticles() {
        const categories = ['🔥 魔法师', '⚔️ 骑士', '🗡️ 刺客'];
        const articles = [];
        let id = 1;
        for (let c = 0; c < categories.length; c++) {
            for (let i = 1; i <= 10; i++) {
                articles.push({
                    id: id++,
                    title: categories[c] + ' ' + i,
                    content: `这是 ${categories[c]} 的第 ${i} 个角色。\n\n## 背景故事\n详细设定...\n\n## 能力\n- 技能1\n- 技能2`,
                    category: categories[c],
                    categoryName: categories[c],
                    updateTime: new Date().toISOString(),
                    visible: true,
                });
            }
        }
        if (articles.length > 2) {
            articles[3].visible = false;
            articles[7].visible = false;
        }
        return articles;
    },

    getAllArticles() {
        return this._data ? this._data.slice() : [];
    },

    getVisibleArticles() {
        const all = this.getAllArticles();
        if (AppState.get('isLoggedIn')) return all;
        return all.filter(a => !!a.visible !== false);
    },

    async setVisibility(articleId, visible) {
        if (!AppState.get('isLoggedIn')) {
            NotificationService.showToast(NotificationService.messages.visibilityAdminOnly, true);
            return false;
        }
        const all = this.getAllArticles();
        const article = all.find(a => a.id === articleId);
        if (!article) return false;
        try {
            await ApiClient.put(`/api/articles/${articleId}/visibility`, { visible });
            article.visible = visible;
            this.cache = { data: this._data, timestamp: Date.now() };
            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { articleId, visible, fromRemote: false });
            NotificationService.showVisibilityChanged(visible);
            try {
                const channel = new BroadcastChannel('revachol');
                channel.postMessage({ type: 'visibility_changed', payload: { articleId, visible } });
                channel.close();
            } catch (e) { /* ignore */ }
            return true;
        } catch (error) {
            console.warn('[ArticleService] 修改可见性失败，降级为本地模拟:', error);
            article.visible = visible;
            this.cache = { data: this._data, timestamp: Date.now() };
            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { articleId, visible, fromRemote: false });
            NotificationService.showToast(
                NotificationService.messages.visibilityChangedLocal(visible),
                false
            );
            return true;
        }
    },

    _onVisibilityChanged(data) {
        const { articleId, visible } = data;
        const all = this.getAllArticles();
        const article = all.find(a => a.id === articleId);
        if (article) {
            article.visible = visible;
            this.cache = { data: this._data, timestamp: Date.now() };
        }
        if (!AppState.get('isLoggedIn') && !visible) {
            EventBus.emit(EVENTS.ARTICLE_MADE_INVISIBLE, { articleId });
        }
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { articleId, visible, fromRemote: true });
        if (typeof window !== 'undefined' && window.__REVACHOL__.UIController && typeof window.__REVACHOL__.UIController.refreshDisplay === 'function') {
            window.__REVACHOL__.UIController.refreshDisplay();
        }
    },

    onVisibilityChanged(data) {
        this._onVisibilityChanged(data);
    },

    clearCache() {
        this.cache = { data: null, timestamp: null };
        console.log('[ArticleService] 缓存已清除');
    },

    getStats() {
        const all = this.getAllArticles();
        const visible = this.getVisibleArticles();
        return {
            total: all.length,
            visible: visible.length,
            hidden: all.length - visible.length,
            categories: this._categories.length,
        };
    },

    getArticlesByCategory(categoryName) {
        const articles = this.getAllArticles();
        if (categoryName === 'all') return articles;
        return articles.filter(a => (a.categoryName || a.category || '未分类档案') === categoryName);
    },

    isVisible(articleId) {
        const all = this.getAllArticles();
        const article = all.find(a => a.id === articleId);
        return article ? !!article.visible : false;
    },

    buildDirectoryTree(articles) {
        const list = articles || this.getAllArticles();
        const tree = this.getCategoryTree();

        const articleMap = {};
        list.forEach(article => {
            const catId = article.category || article.categoryName || '未分类';
            if (!articleMap[catId]) articleMap[catId] = [];
            articleMap[catId].push(article);
        });

        const buildNode = (catNode) => {
            const node = {
                name: catNode.name,
                sort_order: catNode.sort_order,
                type: 'folder',
                children: [],
                isFolder: true,
                articleId: null,
                firstArticleId: null,
                minId: Infinity,
            };
            if (articleMap[catNode.id]) {
                articleMap[catNode.id].forEach(article => {
                    node.children.push({
                        name: article.title || '无名记录',
                        type: 'article',
                        articleId: article.id,
                        isFolder: false,
                        parentFolder: catNode.id,
                    });
                    if (article.id < node.minId) node.minId = article.id;
                });
            }
            catNode.children.forEach(child => {
                node.children.push(buildNode(child));
            });
            if (node.children.length > 0) {
                const firstArticleChild = node.children.find(c => c.type === 'article');
                if (firstArticleChild) {
                    node.firstArticleId = firstArticleChild.articleId;
                } else {
                    const firstFolder = node.children.find(c => c.type === 'folder');
                    node.firstArticleId = firstFolder ? firstFolder.firstArticleId : null;
                }
            }
            return node;
        };

        const result = tree.map(buildNode);
        // sort_order 优先（Plan 3 接口），回退拼音排序（方案一）
        result.sort((a, b) => {
            const hasA = a.sort_order != null;
            const hasB = b.sort_order != null;
            if (hasA && hasB) return a.sort_order - b.sort_order;
            if (hasA) return -1;
            if (hasB) return 1;
            return a.name.localeCompare(b.name, 'zh-CN');
        });
        return result;
    },
};

