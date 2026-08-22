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

    init(searchInputEl, treeContainer) {
        console.log('[UISearch] 初始化...');
        this.searchInput = searchInputEl;
        this.directoryTreeContainer = treeContainer;
        this.bindEvents();
        console.log('[UISearch] 初始化完成');
    },

    bindEvents() {
        if (!this.searchInput) {
            console.warn('[UISearch] 搜索框元素不存在');
            return;
        }

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

    /**
     * 执行搜索（按 Enter 触发），过滤目录树，并通知 ArticleListStore 进入搜索模式
     */
    performSearch(keyword) {
        if (!keyword || keyword.length < 1) {
            this.clearSearch();
            return;
        }

        this.searchKeyword = keyword;
        // 更新目录树，传入关键字进行过滤
        UIDirectory.updateTree(keyword);

        // ★★★ 通知 ArticleListStore 进入搜索模式，由它自己从 ArticleService 派生数据 ★★★
        ArticleListStore.setSearchMode(keyword);

        // 更新搜索框占位（显示结果数量）
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

    /**
     * 清空搜索，恢复原始目录树和文章列表
     */
    clearSearch() {
        this.searchKeyword = '';
        if (this.searchInput) {
            this.searchInput.placeholder = UI.common.searchPlaceholder;
        }
        // 恢复目录树（无过滤）
        UIDirectory.updateTree(null);
        // ★★★ 退出搜索模式 ★★★
        ArticleListStore.exitSearchMode();
        this.clearSearchHighlights();
        this.searchResults = [];
        this.searchCurrentIndex = -1;
        console.log('[UISearch] 清空搜索');
    },

    navigateSearchResult(direction) {
        // 此功能在过滤模式下可能仍有用，但当前我们未存储搜索结果列表
        // 简化提示
        Utils.showToast(UI.toast.searchNavigationSimplified, false);
    },

    clearSearchHighlights() {
        if (!this.directoryTreeContainer) return;
        const highlights = this.directoryTreeContainer.querySelectorAll('.tree-node-content.search-highlight');
        highlights.forEach(el => el.classList.remove('search-highlight'));
    },

    expandSearchResults() {
        // 在过滤模式下，展开所有文件夹
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

