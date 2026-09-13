// ！文章卡片列表
// 卡片与分组表头的渲染、无限滚动触发，数据统一取自 ArticleListStore。
// 优先复用 <template>，缺失时走字符串拼接兜底：模板可保持 HTML 与 JS 分离，兜底保证模板被裁剪时列表仍可用。
import { UIHelpers } from './helpers.js';
import { UIDetail } from './detail.js';
import { Utils } from '../../utils.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { UI } from '../../utils/ui-strings.js';
import { ArticleListStore } from '../../stores/article-list-store.js';
import { MarkdownUtils } from '../../utils/markdown-utils.js';
import { StickerRenderer } from '../../editor/sticker-renderer.js';
import { truncateHtml } from '../../utils/dom.js';

export const UIArticles = {
    container: null,
    searchInput: null,
    scrollHandler: null,
    _storeUnsubscribe: null,

    // 初始化
    init: function (container, searchInputEl) {
        console.log('[UIArticles] 初始化...');
        this.container = container;
        this.searchInput = searchInputEl;

        ArticleListStore.init();

        // 订阅列表更新：渲染时机完全由 Store 决定，本模块不自持数据源
        this._storeUnsubscribe = EventBus.on(EVENTS.ARTICLES_LIST_UPDATED, () => {
            this.renderArticles();
        });

        // 初始渲染
        this.renderArticles();

        // 绑定滚动监听
        this.bindScrollListener();

        console.log('[UIArticles] 初始化完成');
    },

    // 显示骨架屏
    showSkeleton: function () {
        let skeletonHtml = '';
        for (let i = 0; i < 4; i++) {
            skeletonHtml +=
                '<div class="skeleton-card"><div class="skeleton-line title"></div><div class="skeleton-line long"></div><div class="skeleton-line"></div><div class="skeleton-line short"></div></div>';
        }
        this.container.innerHTML = skeletonHtml;
    },

    // 渲染列表
    renderArticles: function () {
        const container = this.container;
        if (!container) return;

        const articles = ArticleListStore.getDisplayArticles();

        if (!articles || articles.length === 0) {
            container.innerHTML = `<div class="empty">${UI.articles.empty}</div>`;
            return;
        }

        const cardTemplate = document.getElementById('article-card-template');
        const headerTemplate = document.getElementById('group-header-template');

        const groups = this._groupArticles(articles);
        let html = '';
        let cardIndex = 0;
        let groupIndex = 0;

        for (const category in groups) {
            if (Object.hasOwn(groups, category)) {
                const categoryArticles = groups[category];

                if (headerTemplate) {
                    const headerClone = document.importNode(headerTemplate.content, true);
                    const folderTitle = headerClone.querySelector('.folder-title');
                    const level = UIHelpers.getCategoryLevel(category);
                    const icon = level === 1 ? '📁' : level === 2 ? '📂' : '📄';
                    const nameSpan = headerClone.querySelector('.folder-name');
                    const iconSpan = headerClone.querySelector('.folder-icon');
                    if (folderTitle) folderTitle.className = 'folder-title level-' + Math.min(level, 6);
                    if (iconSpan) iconSpan.textContent = icon;
                    if (nameSpan) nameSpan.textContent = category;
                    const tempDiv = document.createElement('div');
                    tempDiv.appendChild(headerClone);
                    html += tempDiv.innerHTML;
                } else {
                    html += this._fallbackGroupHeader(category, groupIndex);
                }

                for (let i = 0; i < categoryArticles.length; i++) {
                    const article = categoryArticles[i];
                    if (cardTemplate) {
                        const cardClone = document.importNode(cardTemplate.content, true);
                        const cardDiv = cardClone.querySelector('.card');
                        if (cardDiv) {
                            cardDiv.id = UIHelpers.generateCardId(article.id);
                            cardDiv.dataset.articleId = article.id;
                            cardDiv.dataset.category = category;
                            cardDiv.classList.add(cardIndex % 2 === 0 ? 'card-left' : 'card-right');
                            cardIndex++;
                            const titleEl = cardDiv.querySelector('h3');
                            if (titleEl) titleEl.textContent = article.title || UI.articles.defaultTitle;
                            const contentEl = cardDiv.querySelector('.card-content');
                            if (contentEl) {
                                const displayContent = article.content || UI.articles.defaultContent;
                                // 先剥离贴纸标记再渲染：贴纸是为详情页正文流设计的，卡片预览中会撑破布局
                                const clean = StickerRenderer.stripMarkers(displayContent);
                                const rendered = MarkdownUtils.toHTML(clean);
                                // 截断为 350 字：短文保留富文本，长文降级为纯文本预览
                                contentEl.innerHTML = truncateHtml(rendered, 350);
                            }
                            const metaEl = cardDiv.querySelector('.card-meta');
                            if (metaEl) {
                                metaEl.textContent = `${UI.articles.cardMetaPrefix}${article.updateTime || UI.articles.unknownTime}`;
                            }
                            const hintEl = cardDiv.querySelector('.card-click-hint');
                            if (hintEl) hintEl.textContent = UI.articles.cardHint;
                        }
                        const tempDiv2 = document.createElement('div');
                        tempDiv2.appendChild(cardClone);
                        html += tempDiv2.innerHTML;
                    } else {
                        html += this._fallbackCard(article, category, cardIndex);
                        cardIndex++;
                    }
                }
                groupIndex++;
            }
        }

        container.innerHTML = html;
        this._bindCardEvents();
    },

    // 按分类分组
    _groupArticles: function (articles) {
        const groups = {};
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            const category = article.categoryName || article.category || UI.articles.defaultCategory;
            if (!groups[category]) groups[category] = [];
            groups[category].push(article);
        }
        return groups;
    },

    // 绑定卡片点击
    _bindCardEvents: function () {
        const container = this.container;
        if (!container) return;
        container.querySelectorAll('.card').forEach(function (card) {
            card.addEventListener('click', function () {
                const articleId = parseInt(this.dataset.articleId);
                UIDetail.openDetail(articleId);
            });
        });
    },

    // 兜底分组表头（模板缺失时）
    _fallbackGroupHeader: function (category, groupIndex) {
        const level = UIHelpers.getCategoryLevel(category);
        const levelClass = 'level-' + Math.min(level, 6);
        const icon = level === 1 ? '📁' : level === 2 ? '📂' : '📄';
        return (
            '<div class="group-header" data-group-index="' +
            groupIndex +
            '"><div class="folder-title ' +
            levelClass +
            '"><span class="folder-icon">' +
            icon +
            '</span>' +
            Utils.escapeHtml(category) +
            '</div></div>'
        );
    },

    // 兜底卡片（模板缺失时）
    _fallbackCard: function (article, category, cardIndex) {
        const cardId = UIHelpers.generateCardId(article.id);
        const side = cardIndex % 2 === 0 ? 'card-left' : 'card-right';
        const title = article.title || UI.articles.defaultTitle;
        const content = article.content || UI.articles.defaultContent;
        // 与模板分支保持一致：先剥离贴纸标记再渲染、截断
        const clean = StickerRenderer.stripMarkers(content);
        const rendered = MarkdownUtils.toHTML(clean);
        const displayContent = truncateHtml(rendered, 350);
        const updateTime = article.updateTime || article.createTime || UI.articles.unknownTime;
        return (
            '<div class="card ' + side + '" id="' +
            cardId +
            '" data-article-id="' +
            article.id +
            '" data-category="' +
            Utils.escapeHtml(category) +
            '">' +
            '<h3>' +
            Utils.escapeHtml(title) +
            '</h3>' +
            '<div class="card-content">' +
            displayContent +
            '</div>' +
            '<div class="card-meta">' +
            UI.articles.cardMetaPrefix +
            updateTime +
            '</div>' +
            '<div class="card-click-hint">' +
            UI.articles.cardHint +
            '</div>' +
            '</div>'
        );
    },

    // 绑定滚动监听（无限加载）
    // 搜索模式下不加载更多：过滤结果一次性给出，再分页会让命中列表不完整
    bindScrollListener: function () {
        const self = this;
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
        }
        this.scrollHandler = function () {
            if (ArticleListStore.getIsSearchMode()) return;

            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const windowHeight = window.innerHeight;
            const documentHeight = document.documentElement.scrollHeight;
            const distanceToBottom = documentHeight - (scrollTop + windowHeight);

            // 距底部 300px 即预加载：留出提前量，滚动到底时新卡片已就位
            if (distanceToBottom < 300 && ArticleListStore.getHasMore() && !ArticleListStore.getIsLoadingMore()) {
                ArticleListStore.loadMore();
            }
        };
        window.addEventListener('scroll', this.scrollHandler);
    },

    // 保留接口（已废弃）
    initInfiniteScroll: function () {
        console.warn('[UIArticles] initInfiniteScroll 已废弃，由 ArticleListStore 自动管理');
    },

    // 保留接口（已废弃）
    resetInfiniteScroll: function () {
        console.warn('[UIArticles] resetInfiniteScroll 已废弃，由 ArticleListStore 自动管理');
    },

    // 解绑订阅与监听
    destroy: function () {
        if (this._storeUnsubscribe) {
            EventBus.off(EVENTS.ARTICLES_LIST_UPDATED, this._storeUnsubscribe);
            this._storeUnsubscribe = null;
        }
        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler);
            this.scrollHandler = null;
        }
    }
};

