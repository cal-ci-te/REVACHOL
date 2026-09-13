// ！搜索
// 搜索框交互与目录树过滤：Enter 触发搜索，上下键导航，Esc 退出。
// 搜索结果由 ArticleListStore 派生，本模块只负责输入事件与占位符文案。
import { UIArticles } from './articles.js';
import { UIDirectory } from './directory.js';
import { UIHelpers } from './helpers.js';
import { UI } from '../../utils/ui-strings.js';
import { ArticleListStore } from '../../stores/article-list-store.js';
import { Utils } from '../../utils.js';

export const UISearch = {
    searchInput: null,
    searchResults: [],
    searchCurrentIndex: -1,
    searchKeyword: '',
    directoryTreeContainer: null,

    // 初始化
    init(searchInputEl, treeContainer) {
        console.log('[UISearch] 初始化...');
        this.searchInput = searchInputEl;
        this.directoryTreeContainer = treeContainer;
        this.bindEvents();
        console.log('[UISearch] 初始化完成');
    },

    // 绑定输入事件
    bindEvents() {
        if (!this.searchInput) {
            console.warn('[UISearch] 搜索框元素不存在');
            return;
        }

        // 解锁搜索框：初始态被禁用，避免数据未就绪时误输入
        this.searchInput.disabled = false;
        this.searchInput.style.pointerEvents = 'auto';
        this.searchInput.style.opacity = '1';
        this.searchInput.style.zIndex = '100';

        // 移除旧监听
        this.searchInput.removeEventListener('focus', this._focusHandler);
        this.searchInput.removeEventListener('input', this._inputHandler);
        this.searchInput.removeEventListener('keydown', this._keydownHandler);

        this._focusHandler = () => {
            if (window.__REVACHOL__.UIController.sidebar && window.__REVACHOL__.UIController.sidebar.sidebarCollapsed) {
                window.__REVACHOL__.UIController.sidebar.toggleCollapse();
            }
        };

        // input 事件仅更新占位符，不触发搜索
        this._inputHandler = (e) => {
            const keyword = e.target.value.trim();
            if (keyword === '') {
                this.clearSearch();
            } else {
                this.searchInput.placeholder = `搜索: ${keyword} (按 Enter 执行)`;
            }
        };

        this._keydownHandler = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const keyword = this.searchInput.value.trim();
                if (keyword) {
                    this.performSearch(keyword);
                } else {
                    this.clearSearch();
                }
                setTimeout(() => {
                    if (this.searchInput) this.searchInput.focus();
                }, 100);
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateSearchResult(1);
                setTimeout(() => {
                    if (this.searchInput) this.searchInput.focus();
                }, 50);
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSearchResult(-1);
                setTimeout(() => {
                    if (this.searchInput) this.searchInput.focus();
                }, 50);
            }
            if (e.key === 'Escape') {
                this.clearSearchHighlights();
                this.clearSearch();
                if (this.searchInput) this.searchInput.blur();
            }
        };

        this.searchInput.addEventListener('focus', this._focusHandler);
        this.searchInput.addEventListener('input', this._inputHandler);
        this.searchInput.addEventListener('keydown', this._keydownHandler);
        console.log('[UISearch] 事件绑定完成');
    },

    // 执行搜索（按 Enter 触发）
    // 目录树与列表都进入过滤模式：关键词同时传给两者，保持两处结果一致
    performSearch(keyword) {
        if (!keyword || keyword.length < 1) {
            this.clearSearch();
            return;
        }

        this.searchKeyword = keyword;
        UIDirectory.updateTree(keyword);

        ArticleListStore.setSearchMode(keyword);

        // 占位符显示结果数：输入框本身不放结果列表，用户只能从这里感知命中量
        if (this.searchInput) {
            const count = ArticleListStore.getDisplayArticles().length;
            this.searchInput.placeholder = UI.common.searchResultCount(count) + ' (按 Enter 搜索)';
        }
        // 清空高亮
        this.clearSearchHighlights();
        this.searchResults = [];
        this.searchCurrentIndex = -1;
        console.log('[UISearch] 执行搜索:', keyword);
    },

    // 退出搜索
    clearSearch() {
        this.searchKeyword = '';
        if (this.searchInput) {
            this.searchInput.placeholder = UI.common.searchPlaceholder;
        }
        // 传 null 恢复无过滤的完整目录树
        UIDirectory.updateTree(null);
        ArticleListStore.exitSearchMode();
        this.clearSearchHighlights();
        this.searchResults = [];
        this.searchCurrentIndex = -1;
        console.log('[UISearch] 清空搜索');
    },

    // 上下键导航
    // 过滤模式下不维护结果列表，因此仅提示用户改用可见结果点击
    navigateSearchResult(direction) {
        Utils.showToast(UI.toast.searchNavigationSimplified, false);
    },

    // 清除搜索高亮
    clearSearchHighlights() {
        if (!this.directoryTreeContainer) return;
        const highlights = this.directoryTreeContainer.querySelectorAll('.tree-node-content.search-highlight');
        highlights.forEach(el => el.classList.remove('search-highlight'));
    },

    // 展开全部文件夹
    // 图标同时存在新旧两种写法（图标包 <span> 与纯文本），故两路都要处理
    expandSearchResults() {
        // 无关键词时不展开：空白搜索下文件夹状态由用户自己控制
        if (!this.searchKeyword) return;
        const allFolders = this.directoryTreeContainer.querySelectorAll('.tree-node.folder');
        allFolders.forEach(folder => {
            const childrenDiv = folder.querySelector(':scope > .children');
            if (childrenDiv) {
                childrenDiv.style.display = 'block';
                const toggleIcon = folder.querySelector('.toggle-icon[data-toggle="toggle"]');
                if (toggleIcon) {
                    const arrowEl = toggleIcon.querySelector('.icon-pack-arrow');
                    if (arrowEl) {
                        arrowEl.textContent = '▼';
                        arrowEl.classList.add('arrow-r90');
                        arrowEl.classList.remove('arrow-r0');
                    } else {
                        toggleIcon.textContent = '▼';
                    }
                }
            }
        });
    },
};

