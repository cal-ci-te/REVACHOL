// ！位置模式管理器
// 位置模式下先对文章数据拍快照，取消时整体还原；同时按设备切换鼠标/触摸拖拽。
// 用快照回滚而非逐条撤销：拖拽过程会频繁改动内存分类，快照一次性还原最省事且不会漏改。
import { ArticleService } from '../../../services/article-service.js';
import { ArticleListStore } from '../../../stores/article-list-store.js';
import { EventBus } from '../../../core/event-bus.js';
import { EVENTS } from '../../../core/event-constants.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';
import { isMobile, enableTouchDrag, enableTouchContext } from '../../../mobile/index.js';
import { enableDragDrop, applyDragDropVisuals } from './drag-drop.js';
import { showMobileControls, hideMobileControls } from './mobile-controls.js';

// 创建位置模式管理器
export function createPositionManager(context) {
    let isActive = false;
    let snapshot = null;
    let dragDisableFn = null;
    let touchDragDisableFn = null;

    const {
        container,
        getFilterKeyword,
        updateTree,
        enableDragDrop: enablePCDrag,
        enableTouchDrag: enableTouchDragFn,
        handleDrop,
        onSave,
        onCancel,
    } = context;

    // 拍摄数据快照
    function saveSnapshot() {
        snapshot = ArticleService.saveSnapshot();
        console.log('[PositionManager] 已保存快照，文章数:', snapshot.articles.length);
    }

    // 还原数据快照
    function restoreSnapshot() {
        if (!snapshot) return;
        console.log('[PositionManager] 恢复快照');
        ArticleService.restoreSnapshot(snapshot);
        snapshot = null;
    }

    // 清空快照（确认保存后不再需要回滚点）
    function clearSnapshot() {
        snapshot = null;
    }

    // 停用全部拖拽并复位视觉提示
    function disableAllDrag() {
        if (dragDisableFn) {
            dragDisableFn();
            dragDisableFn = null;
        }
        if (touchDragDisableFn) {
            touchDragDisableFn();
            touchDragDisableFn = null;
        }
        applyDragDropVisuals(container, false);
    }

    // 按当前设备启用拖拽
    // 先无条件停用再启用：设备类型可能在会话中变化，残留的旧监听会与新监听叠加
    function enableDragForCurrentDevice() {
        disableAllDrag();
        if (isMobile()) {
            touchDragDisableFn = enableTouchDragFn(
                container,
                async (sourceData, targetData) => {
                    await handleDrop(sourceData, targetData);
                },
                () => {
                    updateTree(getFilterKeyword());
                }
            );
            showMobileControls();
        } else {
            dragDisableFn = enablePCDrag(container, () => {
                updateTree(getFilterKeyword());
            });
            applyDragDropVisuals(container, true);
        }
    }

    // 进入位置模式
    function enter() {
        if (isActive) return;
        isActive = true;
        saveSnapshot();
        enableDragForCurrentDevice();
        Utils.showToast(UI.toast.positionModeEnter, false);
    }

    // 退出位置模式
    function exit(shouldSave = true) {
        if (!isActive) return;
        isActive = false;

        disableAllDrag();
        hideMobileControls();
        applyDragDropVisuals(container, false);

        if (!shouldSave && snapshot) {
            restoreSnapshot();
            updateTree(getFilterKeyword());
            // 清空待处理移动队列
            if (onCancel) onCancel();
            Utils.showToast(UI.toast.positionModeCancelled, false);
        } else {
            clearSnapshot();
            // 提交待处理移动队列；成功/失败提示由外部负责
            if (onSave) onSave();
        }
    }

    // 是否处于位置模式
    function isActiveMode() {
        return isActive;
    }

    // 读取快照（亦用于判断是否处于位置模式）
    function getSnapshot() {
        return snapshot;
    }

    return {
        enter,
        exit,
        isActiveMode,
        getSnapshot,
        saveSnapshot,
        disableAllDrag,
    };
}