//自定义右键菜单（修复切换样式，移除对 AdminAssetEvents 的直接依赖） ==========
import { DecoShelf } from '../../services/deco.js';
import { DecoEdit } from '../../services/deco-edit.js';
import { Utils } from '../../utils.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { UI } from '../../utils/ui-strings.js';

export const ContextMenu = {
  _menu: null,
  _visible: false,
  _targetDecoId: null,

  /** 将 "emoji 文本" 渲染为 <span class="ctx-item-emoji">emoji</span> 文本（供图标包替换） */
  _emojiItemLabel(label) {
    const idx = String(label || '').indexOf(' ');
    if (idx === -1) return `<span class="ctx-item-emoji">${label}</span>`;
    return `<span class="ctx-item-emoji">${label.slice(0, idx)}</span>${label.slice(idx)}`;
  },

  init: function () {
    if (this._menu) return;

    const menu = document.createElement('div');
    menu.id = 'deco-context-menu';
    menu.style.cssText =
      'position:fixed;display:none;background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:4px;padding:4px 0;z-index:99999;min-width:150px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    menu.innerHTML = `
            <div class="ctx-item" data-action="duplicate">${this._emojiItemLabel(UI.deco.menuDuplicate)}</div>
            <div class="ctx-item" data-action="paste">${UI.deco.menuPaste}</div>
            <div class="ctx-item" data-action="rename">${this._emojiItemLabel(UI.deco.menuRename)}</div>
            <div class="ctx-item" data-action="deco-edit">${this._emojiItemLabel(UI.deco.menuEdit)}</div>
            <div class="ctx-item" data-action="toggle-style">${this._emojiItemLabel(UI.deco.menuToggleStyle)}</div>
            <div class="ctx-item" data-action="remove-page">${UI.deco.menuRemovePage}</div>
            <div class="ctx-item" data-action="delete-lib" style="color:var(--color-error);">${this._emojiItemLabel(UI.deco.menuDeleteLib)}</div>
        `;
    document.body.appendChild(menu);
    this._menu = menu;

    menu.querySelectorAll('.ctx-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const action = this.dataset.action;
        ContextMenu._handleAction(action);
        ContextMenu.hide();
      });
    });

    document.addEventListener('click', function (e) {
      if (ContextMenu._visible && !e.target.closest('#deco-context-menu')) {
        ContextMenu.hide();
      }
    });

    // 监听贴图右键事件（仅管理员可用）
    EventBus.on(EVENTS.DECO_CONTEXT_MENU, function (data) {
      if (!window.__REVACHOL__.AppState || !window.__REVACHOL__.AppState.get('isLoggedIn')) return;
      ContextMenu.show(data.decoId, data.x, data.y);
    });

    console.log('[ContextMenu] 初始化完成');
  },

  show: function (decoId, x, y) {
    this._targetDecoId = decoId;
    const item = DecoShelf.get(decoId);
    if (!item) return;

    const menu = this._menu;
    const winW = window.innerWidth,
      winH = window.innerHeight;
    const menuW = 160,
      menuH = 240;
    const left = Math.min(x, winW - menuW);
    const top = Math.min(y, winH - menuH);
    menu.style.left = Math.max(0, left) + 'px';
    menu.style.top = Math.max(0, top) + 'px';
    menu.style.display = 'block';
    this._visible = true;

    const toggleItem = menu.querySelector('[data-action="toggle-style"]');
    if (toggleItem) {
      toggleItem.innerHTML = this._emojiItemLabel(UI.deco.toggleStyleLabel(item.style));
    }

    const pasteItem = menu.querySelector('[data-action="paste"]');
    if (pasteItem) {
      pasteItem.style.opacity = DecoShelf._clipboardId ? '1' : '0.4';
      pasteItem.style.pointerEvents = DecoShelf._clipboardId ? 'auto' : 'none';
    }
  },

  hide: function () {
    if (this._menu) {
      this._menu.style.display = 'none';
    }
    this._visible = false;
    this._targetDecoId = null;
  },

  _handleAction: function (action) {
    const id = this._targetDecoId;
    if (!id) return;

    const item = DecoShelf.get(id);
    if (!item) return;

    switch (action) {
      case 'duplicate': {
        const newItem = DecoShelf.duplicate(id);
        if (newItem) {
          Utils.showToast(UI.deco.duplicateSuccess(newItem.name), false);
        }
        break;
      }

      case 'paste': {
        if (DecoShelf._clipboardId) {
          const source = DecoShelf.get(DecoShelf._clipboardId);
          if (source) {
            const duplicatedItem = DecoShelf.duplicate(source.id);
            if (duplicatedItem) {
              const el = document.getElementById('deco-' + id);
              if (el) {
                const rect = el.getBoundingClientRect();
                const pos = {
                  top: rect.top + 20 + 'px',
                  left: rect.left + 20 + 'px',
                  width: el.offsetWidth + 'px',
                  height: el.offsetHeight + 'px',
                };
                DecoShelf.setPosition(duplicatedItem.id, pos);
              }
              Utils.showToast(UI.deco.pasteSuccess, false);
            }
          }
        } else {
          Utils.showToast(UI.deco.pasteDisabled, true);
        }
        break;
      }

      case 'rename': {
        const newName = prompt(UI.deco.renamePrompt, item.name);
        if (newName !== null) {
          DecoShelf.rename(id, newName);
        }
        break;
      }

      case 'deco-edit':
        if (DecoEdit.isActive()) {
            if (DecoEdit._activeDecoId === id) return;
            DecoEdit.exitEditMode(false);
        }
        DecoEdit.enterEditMode(id);
        break;

      case 'toggle-style': {
        const newStyle = item.style === 'fixed' ? 'absolute' : 'fixed';
        const success = DecoShelf.setStyle(id, newStyle);
        if (success) {
          Utils.showToast(UI.deco.styleSwitched, false);
        }
        break;
      }

      case 'remove-page':
        DecoShelf.removeFromPage(id);
        Utils.showToast(UI.deco.removedFromPage, false);
        break;

      case 'delete-lib':
        if (confirm(UI.deco.deleteConfirm(item.name))) {
          DecoShelf.deleteFromLibrary(id);
          Utils.showToast(UI.notification.decoDeleteSuccess, false);
        }
        break;
    }
  },
};

