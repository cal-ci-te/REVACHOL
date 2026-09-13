// ！移动端长按菜单
// 为目录树容器启用长按触发上下文菜单，与触摸拖拽共用同一套节点识别约定（.tree-node-content / .tree-node）
// 长按期间移动或抬手立即取消，避免与页面滚动冲突。
import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

// 当前长按计时器与目标
// 置于模块级而非闭包：重复启用时旧计时器会被新值覆盖，避免并发长按重复弹菜单
let longPressTimer = null;
let longPressTarget = null;

// 为容器启用长按触发上下文菜单
// 权限在长按触发时刻校验而非监听时：登录状态可能在页面存续期间变化，且未登录时不应弹出菜单
// 记录 touchstart 时坐标供菜单定位：长按未移动即触发，该坐标就是按住位置
export function enableTouchContext(container, showMenuFn, duration = 500) {
    if (!container) return () => {};

    const onTouchStart = function (e) {
        const target = e.target.closest('.tree-node-content');
        if (!target) return;
        // 按钮与输入框优先响应自身交互，长按不应抢走它们的事件
        if (e.target.closest('button') || e.target.closest('input')) return;

        longPressTarget = target;
        const touch = e.touches[0];
        longPressTimer = setTimeout(() => {
            const nodeLi = target.closest('.tree-node');
            if (!nodeLi) return;
            const isAdmin = window.__REVACHOL__.AppState?.get('isLoggedIn') || false;
            if (!isAdmin) {
                Utils.showToast(UI.toast.touchAdminRequired, true);
                return;
            }
            const type = nodeLi.dataset.type;
            const name = nodeLi.dataset.name;
            const articleId = nodeLi.dataset.articleId ? parseInt(nodeLi.dataset.articleId) : null;
            if (showMenuFn && typeof showMenuFn === 'function') {
                showMenuFn(touch.clientX, touch.clientY, type, name, articleId, nodeLi);
            }
            // 标记已触发长按，阻止后续点击
            container._longPressTriggered = true;
        }, duration);
    };

    const onTouchMove = function () {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressTarget = null;
    };

    const onTouchEnd = function () {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressTarget = null;
    };

    // 长按期间不阻止默认行为，故用 passive 监听：保留页面正常滚动与点击
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });

    return function disableTouchContext() {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        clearTimeout(longPressTimer);
    };
}