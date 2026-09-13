// ！移动端触摸拖拽
// 为目录树容器启用触摸拖拽排序：创建跟随手指的克隆体，实时高亮放置目标，抬手后回调 onDrop。
// 与桌面 HTML5 拖拽并存，故独立实现一套触摸事件；容器与克隆体状态置于模块级，
// 同一时刻只允许一个拖拽会话，重复启用会覆盖上一个会话的状态。
import { Utils } from '../utils.js';
import { ArticleService } from '../services/article-service.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { UI } from '../utils/ui-strings.js';

let touchDragData = null;
let touchClone = null;
let dragContainer = null;

// 启用移动端触摸拖拽
// 事件全部用 passive:false 注册：起始与移动阶段需 preventDefault 才能阻止页面滚动
// 返回清理函数，供调用方在容器销毁时解绑事件与视觉残留
export function enableTouchDrag(container, onDrop, updateTreeFn) {
    if (!container) {
        console.warn('[TouchDrag] 容器不存在');
        return () => {};
    }

    dragContainer = container;

    const onTouchStart = function (e) {
        // 按钮、输入框、可见性开关等交互元素优先响应自身，不进入拖拽
        if (e.target.closest('button') || e.target.closest('input')) return;
        if (e.target.closest('.visibility-toggle') || e.target.closest('.toggle-icon')) return;

        const target = e.target.closest('.tree-node');
        if (!target) return;

        const isAdmin = window.__REVACHOL__.AppState?.get('isLoggedIn') || false;
        if (!isAdmin) {
            Utils.showToast(UI.toast.touchAdminRequiredDrag, true);
            return;
        }

        const touch = e.touches[0];
        if (!touch) return;

        const type = target.dataset.type;
        // 文件夹与文章的标识字段不同：文件夹用 name、文章用 articleId
        const id = type === 'folder' ? target.dataset.name : target.dataset.articleId;
        if (!id) return;

        // 快照拖拽初始状态：拖拽期间源节点可能被重渲染，脱离 DOM 引用后仍要能还原出完整信息
        touchDragData = {
            type: type,
            id: id,
            node: target,
            name: target.dataset.name || '',
            articleId: type === 'article' ? parseInt(target.dataset.articleId) : null,
            parent: target.parentNode,
            startX: touch.clientX,
            startY: touch.clientY,
        };

        // 克隆体固定在视口并禁用指针事件：直接用 fixed 定位而非 transform，避免与滚动位置耦合
        touchClone = target.cloneNode(true);
        touchClone.style.cssText = `
            position: fixed;
            opacity: 0.85;
            pointer-events: none;
            z-index: 99999;
            background: var(--color-danger);
            border: 2px solid var(--color-accent);
            border-radius: 6px;
            padding: 6px 14px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.6);
            transform: scale(1.05);
            transition: none;
            max-width: 200px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            color: var(--color-text-accent);
            font-size: 13px;
        `;
        // 只保留标题文本：克隆整行会让按钮等子元素一起跟手，视觉噪音大
        const titleSpan = touchClone.querySelector('.node-title');
        if (titleSpan) {
            touchClone.innerHTML = titleSpan.textContent;
        }
        // 偏移量让克隆体落在手指上方：避免手指遮住内容，也更接近触屏原生拖拽手感
        touchClone.style.left = (touch.clientX - 40) + 'px';
        touchClone.style.top = (touch.clientY - 20) + 'px';
        document.body.appendChild(touchClone);

        target.classList.add('dragging');
        e.preventDefault();
        e.stopPropagation();
    };

    const onTouchMove = function (e) {
        if (!touchDragData || !touchClone) return;

        const touch = e.touches[0];
        if (!touch) return;

        touchClone.style.left = (touch.clientX - 40) + 'px';
        touchClone.style.top = (touch.clientY - 20) + 'px';

        // 每帧先清空上一次高亮再重算：避免快速划过多节点时残留旧高亮
        container.querySelectorAll('.drag-over, .dropzone-sibling-highlight').forEach(el => {
            el.classList.remove('drag-over', 'dropzone-sibling-highlight');
            if (el.classList.contains('dropzone-background')) {
                el.style.borderColor = '';
                el.style.background = '';
            }
            if (el.classList.contains('tree-node')) {
                el.style.outline = '';
            }
        });

        // elementFromPoint 而非 event.target：克隆体占据指针位置且 pointer-events:none，需探到其下方真实节点
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target) {
            const node = target.closest('.tree-node, .dropzone-background');
            if (node) {
                if (node.classList.contains('tree-node')) {
                    // 落在文件夹下半区视为「平级放置」，上半区视为「放入该文件夹」
                    const rect = node.getBoundingClientRect();
                    const y = touch.clientY;
                    const isLowerHalf = (y - rect.top) > (rect.height / 2);
                    if (isLowerHalf && node.dataset.type === 'folder') {
                        node.classList.add('dropzone-sibling-highlight');
                        node.style.outline = '2px dashed #c47a44';
                        node.style.outlineOffset = '-2px';
                    } else {
                        node.classList.add('drag-over');
                    }
                } else if (node.classList.contains('dropzone-background')) {
                    node.classList.add('drag-over');
                    node.style.borderColor = '#c47a44';
                    node.style.background = 'rgba(196, 122, 68, 0.15)';
                }
            }
        }

        e.preventDefault();
    };

    const onTouchEnd = async function (e) {
        if (!touchDragData) {
            cleanup();
            return;
        }

        // 用 changedTouches 而非 touches：touchend 时手指已离开 touches 列表
        const touch = e.changedTouches[0];
        if (!touch) {
            cleanup();
            touchDragData = null;
            return;
        }

        const target = document.elementFromPoint(touch.clientX, touch.clientY);

        // 先清理视觉元素再判定落点：克隆体仍占位会让 elementFromPoint 探到自己
        cleanup();

        if (!target) {
            touchDragData = null;
            return;
        }

        const dropTarget = target.closest('.tree-node, .dropzone-background');
        if (!dropTarget) {
            touchDragData = null;
            Utils.showToast(UI.toast.touchDragToValidTarget, true);
            return;
        }

        // 目标信息解析为 { targetFolderId, isSibling }：把落点形态收敛成下游统一契约
        let targetFolderId = null;
        let isSibling = false;

        if (dropTarget.classList.contains('dropzone-background')) {
            isSibling = true;
        } else if (dropTarget.classList.contains('tree-node')) {
            const targetType = dropTarget.dataset.type;
            if (targetType === 'folder') {
                const rect = dropTarget.getBoundingClientRect();
                const y = touch.clientY;
                isSibling = (y - rect.top) > (rect.height / 2);
                if (isSibling) {
                    // 平级放置需落到该文件夹的父级，而非文件夹自身
                    const cat = ArticleService.findCategoryById(dropTarget.dataset.name);
                    targetFolderId = cat?.parent || null;
                } else {
                    targetFolderId = dropTarget.dataset.name;
                }
            } else if (targetType === 'article') {
                // 落在文章上按文章所属分类放置，并强制非平级
                const articleId = parseInt(dropTarget.dataset.articleId);
                const articles = ArticleService.getAllArticles() || [];
                const article = articles.find(a => a.id === articleId);
                targetFolderId = article?.category || '未分类';
                isSibling = false;
            }
        }

        // catch 只做提示而不提前 return：onDrop 失败后也必须复位 touchDragData，否则下次拖拽会被旧会话挡住
        if (onDrop && typeof onDrop === 'function') {
            try {
                await onDrop(touchDragData, {
                    targetFolderId: targetFolderId || null,
                    isSibling: isSibling,
                });
                if (updateTreeFn) updateTreeFn();
            } catch (err) {
                console.error('[TouchDrag] 拖拽失败:', err);
                Utils.showToast(UI.toast.touchMoveFailed(err.message), true);
            }
        } else {
            console.warn('[TouchDrag] onDrop 回调未提供');
        }

        touchDragData = null;
    };

    const onTouchCancel = function () {
        cleanup();
        touchDragData = null;
    };

    // 清理拖拽残留的克隆体与高亮类
    // 幂等：重复调用安全，便于成功、取消、异常多条路径共用
    const cleanup = function () {
        if (touchClone) {
            touchClone.remove();
            touchClone = null;
        }
        container.querySelectorAll('.dragging, .drag-over, .dropzone-sibling-highlight').forEach(el => {
            el.classList.remove('dragging', 'drag-over', 'dropzone-sibling-highlight');
            if (el.classList.contains('dropzone-background')) {
                el.style.borderColor = '';
                el.style.background = '';
            }
            if (el.classList.contains('tree-node')) {
                el.style.outline = '';
            }
        });
    };

    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    container.addEventListener('touchend', onTouchEnd, { passive: false });
    container.addEventListener('touchcancel', onTouchCancel, { passive: false });

    console.log('[TouchDrag] 移动端触摸拖拽已启用');

    return function disableTouchDrag() {
        container.removeEventListener('touchstart', onTouchStart);
        container.removeEventListener('touchmove', onTouchMove);
        container.removeEventListener('touchend', onTouchEnd);
        container.removeEventListener('touchcancel', onTouchCancel);
        cleanup();
        console.log('[TouchDrag] 移动端触摸拖拽已禁用');
    };
}
