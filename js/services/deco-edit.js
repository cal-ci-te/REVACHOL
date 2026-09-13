// ！贴纸位置编辑
// 统一的「移动 + 缩放」编辑器：高亮边框 + 右下角控制点 + 底部工具栏（确认/重置/取消）。
// 未放置的贴纸进入编辑时自动创建元素到屏幕正中，确认后才真正落位。
// 移动与缩放共用一套拖拽流程，避免两套坐标换算逻辑互相覆盖。

import { DecoShelf } from './deco.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

// 初始化：监听贴纸库变更，自动退出已删除贴纸的编辑模式
// 贴纸在别处被删除后编辑态会悬空，此处兜底回收，避免操作到已不存在的实例
EventBus.on(EVENTS.DECO_LIBRARY_CHANGED, () => {
    if (!DecoEdit._activeDecoId) return;
    const item = DecoShelf.get(DecoEdit._activeDecoId);
    if (!item) {
        console.log('[DecoEdit] 贴纸已删除，自动退出编辑模式');
        DecoEdit.exitEditMode(false);
    }
});

export const DecoEdit = {
    CONFIG: {
        // 关闭时直接改写 width/height：编辑结果即真实占位，与未缩放贴纸的布局表现一致
        useTransform: false,
        minSize: 40,
        maxSizeRatio: 0.8,
    },

    _activeDecoId: null,
    _activeElement: null,
    // 缩放控制点 DOM
    _handle: null,
    // 底部工具栏 DOM
    _toolbar: null,
    // 编辑前状态快照，字段为 top/left/width/height/scaleX/scaleY/transform/transformOrigin/position
    _snapshot: null,
    // 贴纸原本未放置（enterEditMode 时动态创建了 DOM）
    _wasUnplaced: false,
    _rafId: null,
    // 缩放待更新值
    _pendingResize: null,

    _resizeStartX: 0,
    _resizeStartY: 0,
    _resizeStartWidth: 0,
    _resizeStartHeight: 0,
    _originalWidth: 0,
    _originalHeight: 0,
    _resizeMoveHandler: null,
    _resizeUpHandler: null,
    _handleDownHandler: null,
    _handleTouchHandler: null,

    _isDragging: false,
    _dragStartX: 0,
    _dragStartY: 0,
    _dragStartLeft: 0,
    _dragStartTop: 0,
    _decoDownHandler: null,

    _escHandler: null,

    // 进入编辑模式
    enterEditMode(decoId) {
        // 移动端不支持拖拽编辑
        if (window.innerWidth <= 768 || ('ontouchstart' in window)) {
            Utils.showToast(UI.toast.decoMobileNotSupported, true);
            return;
        }

        // 同一时刻只允许一个贴纸处于编辑态，否则控制点与工具栏会互相抢占
        if (this._activeDecoId && this._activeDecoId !== decoId) {
            this.exitEditMode(false);
            console.log('[DecoEdit] 强制退出上一个贴纸编辑:', this._activeDecoId);
        }

        // 重复进入同一贴纸直接返回
        if (this._activeDecoId === decoId) return;

        const item = DecoShelf.get(decoId);
        if (!item) { Utils.showToast('贴纸数据不存在', true); return; }

        let el = document.getElementById('deco-' + decoId);

        if (!el) {
            // 未放置 → 动态创建元素到屏幕正中
            el = this._createDecoElement(decoId, item);
            this._wasUnplaced = true;
        } else {
            this._wasUnplaced = false;
        }

        // 拍摄快照（原本未放置则 position 记 null，取消时才能正确还原）
        this._snapshot = this._captureSnapshot(el, item);

        this._activeDecoId = decoId;
        this._activeElement = el;

        const currentW = parseFloat(el.style.width) || el.offsetWidth || 100;
        const currentH = parseFloat(el.style.height) || el.offsetHeight || 100;
        this._originalWidth = isNaN(currentW) ? 100 : currentW;
        this._originalHeight = isNaN(currentH) ? 100 : currentH;

        el.classList.add('deco-editing');
        el.style.cursor = 'grab';

        this._createHandle(el);

        this._bindResizeDrag(el);

        this._bindDecoDrag(el);

        this._showToolbar();

        this._bindEscKey();

        EventBus.emit('deco:edit-mode-started', { decoId });
        console.log('[DecoEdit] 进入编辑模式，贴纸:', decoId, this._wasUnplaced ? '(原未放置，已创建)' : '');
    },

    // 退出编辑模式
    exitEditMode(save = true) {
        if (!this._activeDecoId) return;

        const el = this._activeElement || document.getElementById('deco-' + this._activeDecoId);
        if (!el || !DecoShelf.get(this._activeDecoId)) {
            console.log('[DecoEdit] 贴纸已不存在，跳过保存直接清理');
            this._cleanup();
            return;
        }

        const decoId = this._activeDecoId;

        if (save) {
            this._saveChanges();
        } else if (this._wasUnplaced) {
            // 取消且原本未放置 → 移除元素并把 position 复位为 null
            el.remove();
            DecoShelf.setPosition(decoId, null);
        } else {
            this._applySnapshot(el);
        }

        this._cleanup();

        EventBus.emit('deco:edit-mode-ended', { decoId });
        console.log('[DecoEdit] 退出编辑模式，save:', save);
    },

    // 重置到快照（保持编辑态，便于继续调整）
    resetToSnapshot() {
        const el = this._activeElement || document.getElementById('deco-' + this._activeDecoId);
        if (!el || !this._snapshot) return;

        this._applySnapshot(el);
        this._syncHandle(el);
        Utils.showToast(UI.decoEdit.resetToast, false);
        console.log('[DecoEdit] 已重置到快照');
    },

    // 是否处于编辑模式
    isActive() {
        return !!this._activeDecoId;
    },

    // 获取当前激活的贴纸 ID
    getActiveDecoId() {
        return this._activeDecoId;
    },

    // 创建未放置贴纸的元素
    _createDecoElement(id, item) {
        const el = document.createElement('div');
        el.id = 'deco-' + id;
        el.style.position = 'fixed';
        el.style.top = (window.innerHeight / 2 - 50) + 'px';
        el.style.left = (window.innerWidth / 2 - 50) + 'px';
        el.style.width = '100px';
        el.style.height = '100px';
        const imgSrc = item.dataUrl || item.url;
        el.style.backgroundImage = imgSrc ? 'url(' + imgSrc + ')' : 'none';
        el.style.backgroundSize = 'contain';
        el.style.backgroundRepeat = 'no-repeat';
        el.style.backgroundPosition = 'center';
        el.style.zIndex = '99';
        el.style.pointerEvents = 'auto';
        el.dataset.decoId = id;
        el.title = item.name + ' (fixed)';
        if (document.body) {
            document.body.appendChild(el);
        } else {
            document.addEventListener('DOMContentLoaded', () => document.body.appendChild(el));
        }
        return el;
    },

    // 拍摄快照
    // 同时记录 style 与 position 两处状态：取消编辑需把两者都还原才行
    _captureSnapshot(el, item) {
        return {
            top: el.style.top || '',
            left: el.style.left || '',
            width: el.style.width || '',
            height: el.style.height || '',
            transform: el.style.transform || '',
            transformOrigin: el.style.transformOrigin || '',
            position: item.position ? { ...item.position } : null,
            scaleX: el._scaleX,
            scaleY: el._scaleY,
        };
    },

    // 应用快照
    _applySnapshot(el) {
        if (!this._snapshot) return;
        el.style.top = this._snapshot.top;
        el.style.left = this._snapshot.left;
        el.style.width = this._snapshot.width;
        el.style.height = this._snapshot.height;
        el.style.transform = this._snapshot.transform;
        el.style.transformOrigin = this._snapshot.transformOrigin || '';
        if (this._snapshot.scaleX !== undefined) el._scaleX = this._snapshot.scaleX;
        else delete el._scaleX;
        if (this._snapshot.scaleY !== undefined) el._scaleY = this._snapshot.scaleY;
        else delete el._scaleY;
    },

    // 创建右下角缩放控制点
    _createHandle(el) {
        this._removeHandle();
        const handle = document.createElement('div');
        handle.className = 'deco-edit-handle';
        handle.style.cssText = `
            position: absolute;
            bottom: -10px;
            right: -10px;
            width: 20px;
            height: 20px;
            cursor: nwse-resize;
            background: var(--color-accent, #c47a44);
            border: 2px solid var(--color-bg-primary, #1a1612);
            border-radius: 50%;
            z-index: 101;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        handle.innerHTML = '<span style="font-size:10px;color:var(--color-bg-primary,#1a1612);line-height:1;">◢</span>';
        el.appendChild(handle);
        this._handle = handle;
    },

    // 移除控制点
    _removeHandle() {
        this._removeHandleListeners();
        if (this._handle) {
            this._handle.remove();
            this._handle = null;
        }
    },

    // 补齐控制点
    // 重置快照时控制点可能已被移除，此处按需重建，避免拖拽失效
    _syncHandle(el) {
        if (!this._handle && el) this._createHandle(el);
    },

    // 绑定缩放拖拽
    _bindResizeDrag(el) {
        const self = this;
        this._resizeStartWidth = parseFloat(el.style.width) || el.offsetWidth || 100;
        this._resizeStartHeight = parseFloat(el.style.height) || el.offsetHeight || 100;

        const onDown = (e) => {
            if (e.target !== self._handle && !self._handle.contains(e.target)) return;
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();

            self._resizeStartX = e.clientX;
            self._resizeStartY = e.clientY;
            self._resizeStartWidth = parseFloat(el.style.width) || el.offsetWidth || 100;
            self._resizeStartHeight = parseFloat(el.style.height) || el.offsetHeight || 100;

            self._resizeMoveHandler = (ev) => self._onResizeMove(ev, el);
            self._resizeUpHandler = () => self._onResizeUp(el);

            document.addEventListener('mousemove', self._resizeMoveHandler);
            document.addEventListener('mouseup', self._resizeUpHandler);
            document.addEventListener('touchmove', self._resizeMoveHandler, { passive: false });
            document.addEventListener('touchend', self._resizeUpHandler);
        };

        this._handleDownHandler = onDown;
        this._handleTouchHandler = onDown;
        this._handle.addEventListener('mousedown', onDown);
        this._handle.addEventListener('touchstart', onDown, { passive: false });
    },

    // 解绑控制点监听
    _removeHandleListeners() {
        if (!this._handle) return;
        if (this._handleDownHandler) {
            this._handle.removeEventListener('mousedown', this._handleDownHandler);
            this._handle.removeEventListener('touchstart', this._handleTouchHandler);
            this._handleDownHandler = null;
            this._handleTouchHandler = null;
        }
    },

    // 缩放移动
    // 尺寸写回走 requestAnimationFrame：mousemove 高频触发，逐帧写入即可，避免同步布局抖动
    _onResizeMove(e, el) {
        const clientX = (e.touches && e.touches.length) ? e.touches[0].clientX : e.clientX;
        const clientY = (e.touches && e.touches.length) ? e.touches[0].clientY : e.clientY;

        const dx = clientX - this._resizeStartX;
        const dy = clientY - this._resizeStartY;

        let newWidth = Math.max(this.CONFIG.minSize, this._resizeStartWidth + dx);
        let newHeight = Math.max(this.CONFIG.minSize, this._resizeStartHeight + dy);

        // 按住 Shift 等比缩放：避免贴纸被拉变形
        if (e.shiftKey) {
            const ratio = this._resizeStartWidth / this._resizeStartHeight;
            newHeight = newWidth / ratio;
        }

        const currentLeft = parseFloat(el.style.left) || 0;
        const currentTop = parseFloat(el.style.top) || 0;
        const HANDLE_MARGIN = 10;
        const maxW = Math.max(this.CONFIG.minSize, window.innerWidth - currentLeft - HANDLE_MARGIN);
        const maxH = Math.max(this.CONFIG.minSize, window.innerHeight - currentTop - HANDLE_MARGIN);
        newWidth = Math.min(newWidth, maxW);
        newHeight = Math.min(newHeight, maxH);

        this._pendingResize = { width: newWidth, height: newHeight };

        if (!this._rafId) {
            this._rafId = requestAnimationFrame(() => {
                if (this._pendingResize && this._activeDecoId) {
                    this._applySize(el, this._pendingResize.width, this._pendingResize.height);
                    this._pendingResize = null;
                }
                this._rafId = null;
            });
        }
    },

    // 缩放结束
    // 先取消排队帧再补写最后一次待处理尺寸：否则末次移动会丢失，尺寸停在倒数第二帧
    _onResizeUp(el) {
        if (this._resizeMoveHandler) {
            document.removeEventListener('mousemove', this._resizeMoveHandler);
            document.removeEventListener('touchmove', this._resizeMoveHandler);
        }
        if (this._resizeUpHandler) {
            document.removeEventListener('mouseup', this._resizeUpHandler);
            document.removeEventListener('touchend', this._resizeUpHandler);
        }
        this._resizeMoveHandler = null;
        this._resizeUpHandler = null;

        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        if (this._pendingResize && this._activeDecoId) {
            this._applySize(el, this._pendingResize.width, this._pendingResize.height);
            this._pendingResize = null;
        }
    },

    // 应用尺寸
    // transform 模式下基于 _originalWidth 换算比例，故被缩放的贴纸 width/height 始终保持原始值
    _applySize(el, width, height) {
        if (this.CONFIG.useTransform) {
            const scaleX = this._originalWidth > 0 ? width / this._originalWidth : 1;
            const scaleY = this._originalHeight > 0 ? height / this._originalHeight : 1;
            el.style.width = this._originalWidth + 'px';
            el.style.height = this._originalHeight + 'px';
            el.style.transform = `scale(${scaleX}, ${scaleY})`;
            el.style.transformOrigin = 'top left';
            el._scaleX = scaleX;
            el._scaleY = scaleY;
        } else {
            el.style.width = width + 'px';
            el.style.height = height + 'px';
            el.style.transform = '';
        }
    },

    // 绑定位置拖拽
    _bindDecoDrag(el) {
        const self = this;

        const onDown = (e) => {
            if (e.target === self._handle || (self._handle && self._handle.contains(e.target))) return;
            if (e.button !== undefined && e.button !== 0) return;
            e.preventDefault();

            self._isDragging = true;
            self._dragStartX = e.clientX;
            self._dragStartY = e.clientY;
            // left/top 为空串时回退 getBoundingClientRect：元素可能刚创建尚未写内联坐标
            self._dragStartLeft = parseFloat(el.style.left) || el.getBoundingClientRect().left;
            self._dragStartTop = parseFloat(el.style.top) || el.getBoundingClientRect().top;
            el.style.cursor = 'grabbing';

            const onMove = (ev) => {
                if (!self._isDragging) return;
                ev.preventDefault();
                const dx = ev.clientX - self._dragStartX;
                const dy = ev.clientY - self._dragStartY;
                let newLeft = self._dragStartLeft + dx;
                let newTop = self._dragStartTop + dy;

                const MARGIN_H = 10;
                const TOP_MIN = 36;
                const BOTTOM_MAX = 50000;
                const maxLeft = window.innerWidth - el.offsetWidth - MARGIN_H;
                newLeft = Math.max(MARGIN_H, Math.min(newLeft, maxLeft));
                newTop = Math.max(TOP_MIN, Math.min(newTop, BOTTOM_MAX));

                el.style.left = newLeft + 'px';
                el.style.top = newTop + 'px';
                el.style.right = 'auto';
                el.style.bottom = 'auto';
            };

            const onUp = () => {
                self._isDragging = false;
                el.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
                document.removeEventListener('touchmove', onMove);
                document.removeEventListener('touchend', onUp);
            };

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            document.addEventListener('touchmove', onMove, { passive: false });
            document.addEventListener('touchend', onUp);
        };

        el.addEventListener('mousedown', onDown);
        el.addEventListener('touchstart', onDown, { passive: false });
        this._decoDownHandler = onDown;
    },

    // 解绑位置拖拽
    _unbindDecoDrag(el) {
        if (this._decoDownHandler && el) {
            el.removeEventListener('mousedown', this._decoDownHandler);
            el.removeEventListener('touchstart', this._decoDownHandler);
            this._decoDownHandler = null;
        }
    },

    // 保存编辑结果
    // transform 模式把缩放折算回真实宽高再入库：否则刷新后 transform 丢失，贴纸会回到原始尺寸
    _saveChanges() {
        const el = this._activeElement || document.getElementById('deco-' + this._activeDecoId);
        const item = DecoShelf.get(this._activeDecoId);
        if (!el || !item) return;

        let width, height, scaleX, scaleY;
        if (this.CONFIG.useTransform) {
            scaleX = parseFloat(el._scaleX || 1);
            scaleY = parseFloat(el._scaleY || 1);
            width = this._originalWidth * scaleX;
            height = this._originalHeight * scaleY;
        } else {
            width = parseFloat(el.style.width) || el.offsetWidth || this._originalWidth;
            height = parseFloat(el.style.height) || el.offsetHeight || this._originalHeight;
        }

        width = Math.round(width);
        height = Math.round(height);

        const currentLeft = parseFloat(el.style.left) || 0;
        const currentTop = parseFloat(el.style.top) || 0;

        const MARGIN_H = 10;
        const TOP_MIN = 36;
        const BOTTOM_MAX = 50000;
        const maxX = Math.max(0, window.innerWidth - width);
        const clampedLeft = Math.max(MARGIN_H, Math.min(currentLeft, maxX));
        const clampedTop = Math.max(TOP_MIN, Math.min(currentTop, BOTTOM_MAX));

        if (clampedLeft !== currentLeft) el.style.left = clampedLeft + 'px';
        if (clampedTop !== currentTop) el.style.top = clampedTop + 'px';

        const newPos = {
            ...(item.position || {}),
            top: clampedTop + 'px',
            left: clampedLeft + 'px',
            width: width,
            height: height,
        };

        if (this.CONFIG.useTransform) {
            newPos.scaleX = Math.round(scaleX * 100) / 100;
            newPos.scaleY = Math.round(scaleY * 100) / 100;
        } else {
            // 关闭 transform 后遗留的 scale 字段需清掉，否则渲染仍会按旧比例缩放
            delete newPos.scaleX;
            delete newPos.scaleY;
        }

        DecoShelf.setPosition(this._activeDecoId, newPos);
    },

    // 清理编辑态
    // 集中在此解绑全部全局监听：拖拽监听挂在 document 上，漏解会使下次编辑叠加多份回调
    _cleanup() {
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }
        this._pendingResize = null;

        if (this._resizeMoveHandler) {
            document.removeEventListener('mousemove', this._resizeMoveHandler);
            document.removeEventListener('touchmove', this._resizeMoveHandler);
            this._resizeMoveHandler = null;
        }
        if (this._resizeUpHandler) {
            document.removeEventListener('mouseup', this._resizeUpHandler);
            document.removeEventListener('touchend', this._resizeUpHandler);
            this._resizeUpHandler = null;
        }

        this._removeHandle();

        if (this._activeElement) {
            this._unbindDecoDrag(this._activeElement);
            this._activeElement.classList.remove('deco-editing');
            this._activeElement.style.cursor = '';
        }

        this._hideToolbar();
        this._unbindEscKey();

        this._activeDecoId = null;
        this._activeElement = null;
        this._snapshot = null;
        this._wasUnplaced = false;
    },

    // 显示工具栏
    _showToolbar() {
        this._hideToolbar();

        const self = this;
        const container = document.createElement('div');
        container.className = 'deco-edit-toolbar';
        container.innerHTML = `
            <span>${UI.decoEdit.toolbarTitle}</span>
            <button id="decoEditConfirm" class="toolbar-btn primary">${UI.decoEdit.confirmBtn}</button>
            <button id="decoEditReset" class="toolbar-btn secondary">${UI.decoEdit.resetBtn}</button>
            <button id="decoEditCancel" class="toolbar-btn danger">${UI.decoEdit.cancelBtn}</button>
        `;
        document.body.appendChild(container);
        this._toolbar = container;

        container.querySelector('#decoEditConfirm').addEventListener('click', (e) => {
            e.stopPropagation();
            self._saveChanges();
            self.exitEditMode(true);
            Utils.showToast(UI.decoEdit.confirmToast, false);
        });

        container.querySelector('#decoEditReset').addEventListener('click', (e) => {
            e.stopPropagation();
            self.resetToSnapshot();
        });

        container.querySelector('#decoEditCancel').addEventListener('click', (e) => {
            e.stopPropagation();
            self.exitEditMode(false);
            Utils.showToast(UI.decoEdit.cancelToast, false);
        });
    },

    // 隐藏工具栏
    // 同时清掉旧版遗留的 .deco-resize-control，避免升级后残留元素挡在页面上
    _hideToolbar() {
        if (this._toolbar) {
            this._toolbar.remove();
            this._toolbar = null;
        }
        document.querySelectorAll('.deco-edit-toolbar').forEach(el => el.remove());
        document.querySelectorAll('.deco-resize-control').forEach(el => el.remove());
    },

    // 绑定 ESC 键
    _bindEscKey() {
        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                this.exitEditMode(false);
                Utils.showToast(UI.decoEdit.cancelToast, false);
            }
        };
        document.addEventListener('keydown', this._escHandler);
    },

    // 解绑 ESC 键
    _unbindEscKey() {
        if (this._escHandler) {
            document.removeEventListener('keydown', this._escHandler);
            this._escHandler = null;
        }
    },
};
