// ！文章数据服务
// 全站文章与分类的单一数据源，负责从后端拉取、本地缓存、可见性切换与目录树构建。
// 选择「内存缓存 + TTL」而非每次请求：文章列表被首屏、目录树、搜索多处读取，无缓存会重复打后端。

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

    // 载入分类
    // 存储有数据即直接用，不再从文章推导，避免手动维护的分类顺序被覆盖
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
            // 兜底保留「未分类」：删除分类时文章会被迁入该桶，缺了它会出现无处安放的文章
            if (!this._categories.some(c => c.id === '未分类')) {
                this._categories.push({ id: '未分类', name: '未分类', parent: null });
            }
            this._saveCategories();
            this._initialCategoriesLoaded = true;
        }
    },

    // 保存分类
    _saveCategories() {
        StorageAdapter.set(this._categoryCacheKey, this._categories);
    },

    // 获取全部分类
    getAllCategories() {
        return this._categories.slice();
    },

    // 构建分类树
    // 两趟遍历：先建 id→节点索引，再挂载子节点，避免 O(n²) 的重复查找
    getCategoryTree() {
        const map = {};
        const roots = [];
        this._categories.forEach(cat => {
            map[cat.id] = { ...cat, children: [] };
        });
        this._categories.forEach(cat => {
            // 父节点不存在时降级为根节点：防止分类数据损坏导致整棵树丢失
            if (cat.parent && map[cat.parent]) {
                map[cat.parent].children.push(map[cat.id]);
            } else {
                roots.push(map[cat.id]);
            }
        });
        return roots;
    },

    // 获取分类父级
    getCategoryParent(categoryId) {
        const cat = this._categories.find(c => c.id === categoryId);
        return cat ? cat.parent : undefined;
    },

    // 获取直接子分类
    getCategoryChildren(parentId) {
        return this._categories.filter(function (c) { return c.parent === parentId; });
    },

    // 按 ID 查找分类
    findCategoryById(id) {
        return this._categories.find(function (c) { return c.id === id; }) || null;
    },

    // 新增分类
    addCategory(name, parentId = null) {
        const trimmed = name.trim();
        if (!trimmed) return false;
        // 同名同父视为重复：分类 id 即名称，重复会让目录树出现两个无法区分的节点
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

    // 移动分类到新父级
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
            // 移到自己的后代下会形成环，导致目录树递归建树时无限展开
            if (isAncestor(categoryId, newParentId)) return false;
        }
        cat.parent = newParentId;
        this._saveCategories();
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED);
        return true;
    },

    // 迁移旧父级下的子分类
    reparentCategoryChildren(oldParentId, newParentId) {
        this._categories.forEach(function (c) {
            if (c.parent === oldParentId) c.parent = newParentId;
        });
        this._saveCategories();
    },

    // 移除单个分类条目（不处理子分类与文章）
    removeCategoryEntry(categoryId) {
        const idx = this._categories.findIndex(function (c) { return c.id === categoryId; });
        if (idx === -1) return false;
        this._categories.splice(idx, 1);
        this._saveCategories();
        return true;
    },

    // 批量移除分类条目
    removeCategoriesByIds(ids) {
        this._categories = this._categories.filter(function (c) { return !ids.includes(c.id); });
        this._saveCategories();
    },

    // 设置根级分类排序（Plan 3 接口，拖拽排序时调用）
    // 传入按期望顺序排列的分类 id 数组，未出现的分类保持原 sort_order
    setCategoriesOrder(orderedIds) {
        if (!Array.isArray(orderedIds)) return;
        orderedIds.forEach(function (id, index) {
            const cat = this._categories.find(function (c) { return c.id === id; });
            if (cat) cat.sort_order = index;
        }, this);
        this._saveCategories();
    },

    // 新文章写入本地缓存
    // 避免新建后全量重拉：新建返回的字段已完整，直接补进列表即可
    addArticleToCache(article) {
        if (!article || !article.id) return;
        const all = this.getAllArticles();
        if (!all.some(function (a) { return a.id === article.id; })) {
            all.push(article);
        }
        this._data = all;
        this.cache = { data: all, timestamp: Date.now() };
    },

    // 保存数据快照（深拷贝，用于撤销/恢复）
    // 必须深拷贝：浅拷贝下后续编辑会污染快照，撤销将失效
    saveSnapshot() {
        return {
            articles: JSON.parse(JSON.stringify(this._data || [])),
            categories: JSON.parse(JSON.stringify(this._categories || [])),
        };
    },

    // 从快照恢复
    restoreSnapshot(snapshot) {
        if (!snapshot) return;
        this._data = snapshot.articles;
        this._categories = snapshot.categories;
        // 清缓存时间戳：强制下次 fetch 走网络，避免恢复后仍读到恢复前的旧缓存
        this.cache.data = null;
        this.cache.timestamp = null;
    },

    // 重命名分类
    // 分类 id 与 name 同源，重命名需同步迁移子分类的 parent 与文章的 category 引用
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
        const self = this;
        self._data.forEach(function (a) {
            if (a.category === oldId) a.category = newName;
        });
        return true;
    },

    // 删除分类（含全部子分类）
    removeCategory(categoryId) {
        const cat = this._categories.find(c => c.id === categoryId);
        if (!cat) return false;
        // 「未分类」是删除其他分类时的文章归宿，不允许删除
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
        // 文章不随分类删除：迁移到「未分类」，避免内容因目录整理而丢失
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

    // 拉取文章
    // 优先读未过期缓存；后端返回空列表时退回模拟数据，保证本地开发与首装可用
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
            // 兼容裸数组与 { articles } / { data } 两种包裹格式
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

    // 写入数据并广播
    _saveData(articles) {
        this._data = articles;
        this.cache = { data: articles, timestamp: Date.now() };
        EventBus.emit(EVENTS.ARTICLE_DATA_LOADED, { articles });
        this._loadCategories();
    },

    // 载入模拟数据
    _loadMockData() {
        const mockData = this._generateMockArticles();
        this._saveData(mockData);
        console.log('[ArticleService] 使用模拟数据，共', mockData.length, '篇');
        return mockData;
    },

    // 生成模拟文章
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
        // 预置两条隐藏文章：便于本地验证访客视角与可见性切换
        if (articles.length > 2) {
            articles[3].visible = false;
            articles[7].visible = false;
        }
        return articles;
    },

    // 获取全部文章
    getAllArticles() {
        return this._data ? this._data.slice() : [];
    },

    // 获取可见文章
    // 管理员可见全部（含隐藏）；访客只看到 visible !== false 的文章
    getVisibleArticles() {
        const all = this.getAllArticles();
        if (AppState.get('isLoggedIn')) return all;
        return all.filter(a => !!a.visible !== false);
    },

    // 切换文章可见性
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
            // 跨标签页同步：编辑器等独立页面收不到 EventBus，需走 BroadcastChannel
            try {
                const channel = new BroadcastChannel('revachol');
                channel.postMessage({ type: 'visibility_changed', payload: { articleId, visible } });
                channel.close();
            } catch (e) {
                // 忽略：旧浏览器不支持 BroadcastChannel，仅失去跨页同步
            }
            return true;
        } catch (error) {
            // 接口失败仍改本地并提示：单机部署下多为后端未起，本地改动可在恢复后由同步收敛
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

    // 处理远端可见性变更
    _onVisibilityChanged(data) {
        const { articleId, visible } = data;
        const all = this.getAllArticles();
        const article = all.find(a => a.id === articleId);
        if (article) {
            article.visible = visible;
            this.cache = { data: this._data, timestamp: Date.now() };
        }
        // 被隐藏的当前文章需通知详情浮层关闭：否则访客会停留在已不可见的内容上
        if (!AppState.get('isLoggedIn') && !visible) {
            EventBus.emit(EVENTS.ARTICLE_MADE_INVISIBLE, { articleId });
        }
        EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { articleId, visible, fromRemote: true });
        if (typeof window !== 'undefined' && window.__REVACHOL__.UIController && typeof window.__REVACHOL__.UIController.refreshDisplay === 'function') {
            window.__REVACHOL__.UIController.refreshDisplay();
        }
    },

    // 可见性变更对外入口
    onVisibilityChanged(data) {
        this._onVisibilityChanged(data);
    },

    // 清除缓存
    clearCache() {
        this.cache = { data: null, timestamp: null };
        console.log('[ArticleService] 缓存已清除');
    },

    // 获取统计
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

    // 按分类取文章
    getArticlesByCategory(categoryName) {
        const articles = this.getAllArticles();
        if (categoryName === 'all') return articles;
        return articles.filter(a => (a.categoryName || a.category || '未分类档案') === categoryName);
    },

    // 判断单篇是否可见
    isVisible(articleId) {
        const all = this.getAllArticles();
        const article = all.find(a => a.id === articleId);
        return article ? !!article.visible : false;
    },

    // 构建目录树
    // 分类树为主干、文章为叶；firstArticleId 供目录点击时跳到该分类首篇内容
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
            // 空分类时向下继承首个文章 id：保证点击任意层级文件夹都能定位到内容
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
        // sort_order 优先（Plan 3 手动排序），缺失时回退拼音排序
        // 混排规则：有 sort_order 的排在无 sort_order 之前，保证手动排序的项不被默认排序打散
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
