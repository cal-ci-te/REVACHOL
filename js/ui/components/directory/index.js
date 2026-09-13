// ！目录树主控
// 目录树的外观层入口：把渲染、交互、拖放、位置模式、移动端控件装配在一起。
// 对外只暴露 init / updateTree / setActiveNode / destroy：调用方无需感知内部分工。
import { renderTree } from './render.js';
import { setActiveNode } from './events.js';
import { showContextMenu } from './context-menu.js';
import { enableDragDrop, applyDragDropVisuals } from './drag-drop.js';
import {
    createMobileControls,
    showMobileControls,
    hideMobileControls,
    destroyMobileControls,
    recreateMobileControls,
} from './mobile-controls.js';
import { createPositionManager } from './position-manager.js';
import { createPendingMovesManager } from './directory-pending-moves.js';
import { handleDirectoryDrop } from './directory-drop-handler.js';
import { bindDirectoryInteractions } from './directory-interactions-binder.js';
import { Utils } from '../../../utils.js';
import { AppState } from '../../../core/app-state.js';
import { EventBus } from '../../../core/event-bus.js';
import { EVENTS } from '../../../core/event-constants.js';
import { ArticleListStore } from '../../../stores/article-list-store.js';
import { isMobile, enableTouchDrag, enableTouchContext } from '../../../mobile/index.js';

export const UIDirectory = {
    container: null,
    filterKeyword: null,
    _unbindInteractionsFn: null,
    _positionManager: null,
    _touchContextDisableFn: null,
    _mobileControls: null,
    _pendingMovesManager: null,
    _disableDragDrop: null,

    // 清空拖放监听引用
    _cleanupDragDrop() {
        if (this._disableDragDrop) { this._disableDragDrop(); this._disableDragDrop = null; }
    },

    // 初始化
    init(container) {
        console.log('[UIDirectory] 初始化...');
        this.container = container;

        this._pendingMovesManager = createPendingMovesManager();

        this._positionManager = createPositionManager({
            container: this.container,
            getFilterKeyword: () => this.filterKeyword,
            updateTree: (keyword) => this.updateTree(keyword),
            enableDragDrop: (el, cb) => enableDragDrop(el, cb),
            enableTouchDrag: (el, onDrop, onEnd) => enableTouchDrag(el, onDrop, onEnd),
            handleDrop: (sourceData, targetData) => this._handleDrop(sourceData, targetData),
            onSave: () => this._pendingMovesManager.commitMoves(() => this.updateTree(this.filterKeyword)),
            onCancel: () => this._pendingMovesManager.clearMoves(),
        });

        // 移动端控件
        if (isMobile()) {
            this._mobileControls = createMobileControls(container, {
                onSave: () => this._handleMobileSave(),
                onCancel: () => this._handleMobileCancel(),
            });
        }

        EventBus.on(EVENTS.ARTICLE_DATA_LOADED, () => this.updateTree());
        EventBus.on(EVENTS.ADMIN_POSITION_MODE_ENTER, () => this._positionManager.enter());
        // 退出/取消前先解绑拖拽：位置模式结束后拖放监听不应继续存在
        EventBus.on(EVENTS.ADMIN_POSITION_MODE_EXIT, () => { this._cleanupDragDrop(); this._positionManager.exit(true); });
        EventBus.on(EVENTS.ADMIN_POSITION_MODE_CANCEL, () => { this._cleanupDragDrop(); this._positionManager.exit(false); });
        // 登录态变化会改变可见性与管理员控件，需整体重绘
        EventBus.on(EVENTS.AUTH_LOGGED_IN, () => {
            this.updateTree(this.filterKeyword);
        });
        EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => {
            if (this._positionManager.isActiveMode()) {
                this._positionManager.exit(true);
            }
            this.updateTree(this.filterKeyword);
        });

        // 移动端长按支持
        if (isMobile()) {
            this._initMobileSupport();
        }

        console.log('[UIDirectory] 初始化完成');
    },

    // 重建目录树
    updateTree(filterKeyword = null) {
        this.filterKeyword = filterKeyword;
        const articles = ArticleListStore.getVisibleArticles();
        const sortedArticles = [...articles].sort((a, b) => a.id - b.id);

        const treeData = ArticleListStore.buildDirectoryTree(sortedArticles);
        this.container.innerHTML = renderTree(treeData, 0, filterKeyword, '');

        this._bindInteractions();

        // 无过滤时才广播全量文章：过滤态下广播会让其他模块用残缺列表覆盖视图
        if (!filterKeyword) {
            EventBus.emit(EVENTS.ARTICLES_UPDATED, { articles: sortedArticles });
        }

        // 整树 innerHTML 重建会连带清掉控件 DOM，故移动端控件需重建
        if (isMobile()) {
            this._mobileControls = recreateMobileControls(this.container, {
                onSave: () => this._handleMobileSave(),
                onCancel: () => this._handleMobileCancel(),
            });
            if (this._positionManager.isActiveMode()) {
                showMobileControls();
            }
        }

        // 位置模式下 DOM 已重建，拖拽监听需重新挂载
        if (this._positionManager.isActiveMode()) {
            this._positionManager.disableAllDrag();
            if (isMobile()) {
                enableTouchDrag(
                    this.container,
                    async (sourceData, targetData) => {
                        await this._handleDrop(sourceData, targetData);
                    },
                    () => this.updateTree(this.filterKeyword)
                );
                showMobileControls();
            } else {
                // 监听器随 DOM 一起失效，重绑前先解掉旧的，否则会叠加
                if (this._disableDragDrop) this._disableDragDrop();
                this._disableDragDrop = enableDragDrop(this.container, () => this.updateTree(this.filterKeyword));
                applyDragDropVisuals(this.container, true);
            }
        }

        console.log('[UIDirectory] 目录树已更新，文章数:', sortedArticles.length);
    },

    // 绑定目录交互
    _bindInteractions() {
        // 先解旧绑定：容器是同一个，同函数引用重复 add 会被忽略，但不同闭包会叠加
        if (this._unbindInteractionsFn) {
            this._unbindInteractionsFn();
            this._unbindInteractionsFn = null;
        }

        const self = this;
        this._unbindInteractionsFn = bindDirectoryInteractions(this.container, {
            onUpdateTree: () => self.updateTree(self.filterKeyword),
            onSetActiveNode: (nodeId) => self.setActiveNode(nodeId),
            // 可见性切换后 ArticleListStore 自身会广播事件，此处无需额外刷新
            onVisibilityToggleSuccess: () => {},
        });
    },

    // 高亮节点
    setActiveNode(nodeId) {
        setActiveNode(this.container, nodeId);
    },

    // 移动端保存
    _handleMobileSave() {
        console.log('[UIDirectory] 移动端保存位置');
        this._positionManager.exit(true);
        if (this._mobileControls) {
            this._mobileControls.style.display = 'none';
        }
    },

    // 移动端取消
    _handleMobileCancel() {
        console.log('[UIDirectory] 移动端取消位置管理');
        this._positionManager.exit(false);
        if (this._mobileControls) {
            this._mobileControls.style.display = 'none';
        }
    },

    // 启用移动端长按菜单
    _initMobileSupport() {
        // 控件重建后旧监听目标已失效，先解绑再重绑
        if (this._touchContextDisableFn) {
            this._touchContextDisableFn();
        }
        this._touchContextDisableFn = enableTouchContext(
            this.container,
            (x, y, type, name, articleId, nodeLi) => {
                showContextMenu(x, y, type, name, articleId, nodeLi, () => {
                    this.updateTree(this.filterKeyword);
                });
            },
            500
        );
        console.log('[UIDirectory] 移动端长按支持已启用');
    },

    // 转交拖放处理
    async _handleDrop(sourceData, targetData) {
        await handleDirectoryDrop(sourceData, targetData, {
            positionManager: this._positionManager,
            pendingMovesManager: this._pendingMovesManager,
            updateTreeFn: () => this.updateTree(this.filterKeyword),
            isPositionMode: this._positionManager.isActiveMode(),
        });
    },

    // 销毁并解绑全部监听
    destroy() {
        if (this._unbindInteractionsFn) {
            this._unbindInteractionsFn();
            this._unbindInteractionsFn = null;
        }
        if (this._touchContextDisableFn) {
            this._touchContextDisableFn();
            this._touchContextDisableFn = null;
        }
        if (this._positionManager) {
            this._positionManager.disableAllDrag();
        }
        if (this._pendingMovesManager) {
            this._pendingMovesManager.clearMoves();
        }
        destroyMobileControls();
        console.log('[UIDirectory] 已销毁');
    }
};

