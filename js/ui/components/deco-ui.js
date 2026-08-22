import { DecoShelf } from '../../services/deco.js';
import { DecoEdit } from '../../services/deco-edit.js';
import { Utils } from '../../utils.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { UI } from '../../utils/ui-strings.js';

export const DecoShelfUI = {
  _container: null,
  _initialized: false,

  init: function (container) {
    if (!container) {
      console.error('[DecoShelfUI] 容器元素不存在，初始化失败');
      return;
    }

    if (this._initialized) {
      console.log('[DecoShelfUI] 更新容器引用');
      this._container = container;
      this._container.style.minHeight = '60px';
      this._container.style.display = 'block';
      this.render();
      return;
    }

    this._container = container;
    this._container.style.minHeight = '60px';
    this._container.style.display = 'block';
    this._initialized = true;

    EventBus.on(EVENTS.DECO_LIBRARY_CHANGED, () => {
      console.log('[DecoShelfUI] 收到贴图库变更事件，自动刷新列表');
      this.render();
    });

    console.log('[DecoShelfUI] 初始化完成');
    this.render();
  },

  render: function () {
    if (!this._container) {
      console.warn('[DecoShelfUI] 容器未初始化，无法渲染');
      return;
    }

    this._container.style.display = 'block';
    this._container.style.minHeight = '60px';

    if (typeof DecoShelf.getAll !== 'function') {
      this._container.innerHTML =
        `<div class="deco-ui-loading">${UI.common.loading}</div>`;
      return;
    }

    const items = DecoShelf.getAll();
    console.log('[DecoShelfUI] 当前贴图库数据:', items);

    if (!items || items.length === 0) {
      this._container.innerHTML = `
                <div class="deco-ui-empty">
                    ${UI.admin.decoEmpty}<br>
                    <span class="deco-ui-empty-hint">${UI.admin.decoEmptyHint}</span>
                </div>
            `;
      return;
    }

    let html = '';
    items.forEach((item) => {
      const isPlaced = !!(item.position && (item.position.top || item.position.left || item.position.bottom || item.position.right));
      const preview = item.dataUrl ? `url(${item.dataUrl})` : 'none';
      const styleLabel = item.style === 'fixed' ? UI.admin.decoStyleFixed : UI.admin.decoStyleAbsolute;
      const escapedName = Utils.escapeHtml(item.name);
      const escapedId = Utils.escapeHtml(item.id);

      html += `
                <div class="asset-item asset-item-wrapper" data-id="${escapedId}">
                    <div class="asset-item-row">
                        <div class="asset-preview-box" data-preview="${preview}"></div>
                        <span class="asset-name" title="${escapedName}">${escapedName}</span>
                        <span class="asset-status ${isPlaced ? 'is-placed' : ''}">${isPlaced ? '●已放置' : '○未放置'}</span>
                        <button class="asset-style-btn" data-id="${escapedId}" title="切换样式（${styleLabel}）">🔄</button>
                    </div>
                    <div class="asset-actions-row">
                        <button class="asset-duplicate-btn asset-action-btn" data-id="${escapedId}" title="${UI.admin.decoDuplicate}">📋</button>
                        <button class="asset-rename-btn asset-action-btn" data-id="${escapedId}" title="${UI.admin.decoRename}">✏️</button>
                        <button class="asset-deco-edit-btn asset-action-btn" data-id="${escapedId}" title="${UI.decoEdit.menuLabel}">📐</button>
                        <button class="asset-download-btn asset-action-btn" data-id="${escapedId}" title="${UI.admin.decoDownload}">⬇️</button>
                        <button class="asset-delete-btn asset-action-btn" data-id="${escapedId}" title="${UI.admin.decoDelete}">🗑️</button>
                    </div>
                </div>
            `;
    });

    this._container.innerHTML = html;

    // 动态预览图：模板中不再写内联 style，渲染后从 data-preview 应用背景图
    this._container.querySelectorAll('.asset-preview-box[data-preview]').forEach((el) => {
      el.style.backgroundImage = el.dataset.preview;
    });

    console.log('[DecoShelfUI] 列表渲染完成，共', items.length, '项');
    this._bindEvents();
  },

  _bindEvents: function () {
    const container = this._container;
    if (!container) return;

    container.querySelectorAll('.asset-style-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = DecoShelf.get(id);
        if (!item) return;
        const newStyle = item.style === 'fixed' ? 'absolute' : 'fixed';
        DecoShelf.setStyle(id, newStyle);
        Utils.showToast(UI.deco.styleSwitched, false);
      });
    });

    container.querySelectorAll('.asset-duplicate-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const newItem = DecoShelf.duplicate(id);
        if (newItem) {
          Utils.showToast(UI.deco.duplicateSuccess(newItem.name), false);
        }
      });
    });

    container.querySelectorAll('.asset-rename-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = DecoShelf.get(id);
        if (!item) return;
        const newName = prompt(UI.deco.renamePrompt, item.name);
        if (newName !== null && newName.trim() !== '') {
          DecoShelf.rename(id, newName.trim());
        }
      });
    });

    container.querySelectorAll('.asset-deco-edit-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (DecoEdit.isActive()) {
            if (DecoEdit.getActiveDecoId() === id) return;
            DecoEdit.exitEditMode(false);
        }
        DecoEdit.enterEditMode(id);
      });
    });

    container.querySelectorAll('.asset-download-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        DecoShelf.download(id);
      });
    });

    container.querySelectorAll('.asset-delete-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const item = DecoShelf.get(id);
        if (!item) return;
        if (confirm(UI.deco.deleteConfirm(item.name))) {
          DecoShelf.deleteFromLibrary(id);
          Utils.showToast(UI.deco.deleteSuccess(item.name), false);
        }
      });
    });
  },

  destroy: function () {
    if (!this._initialized) return;
    if (this._container) {
      const newContainer = this._container.cloneNode(false);
      this._container.parentNode.replaceChild(newContainer, this._container);
      this._container = newContainer;
    }
    EventBus.off(EVENTS.DECO_LIBRARY_CHANGED);
    this._initialized = false;
    console.log('[DecoShelfUI] 已销毁');
  },
};
