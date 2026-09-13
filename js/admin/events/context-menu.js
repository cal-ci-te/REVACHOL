// ！贴图右键菜单
// 贴图（deco）的管理操作菜单：复制、粘贴、重命名、编辑、切换定位样式、移出页面、从库中删除。
// 菜单只对管理员开放，非管理员触发右键时不展示。
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

  // 把 "emoji 文本" 拆为独立的 emoji 节点加其余文本
  // 拆开是为了让图标包能按 .ctx-item-emoji 类精确替换 emoji，而不影响后面的文字
  _emojiItemLabel(label) {
    const idx = String(label || '').indexOf(' ');
    if (idx === -1) return `<span class="ctx-item-emoji">${label}</span>`;
    return `<span class="ctx-item-emoji">${label.slice(0, idx)}</span>${label.slice(idx)}`;
  },

  // 创建菜单 DOM 并注册交互
  // 以 _menu 是否已存在做幂等守卫：右键菜单是全局单例，重复 init 会残留多份菜单
  init: function () {
    if (this._menu) return;

    const menu = document.createElement('div');
    menu.id = 'deco-context-menu';
    menu.style.cssText =
      'position:fixed;display:none;background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:4px;padding:4px 0;z-index:99999;min-width:150px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';
    // 菜单项固定，变更项的文案在 show 时按当前贴图重写
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

    // 菜单项本身即最终节点，一次性绑定即可，不必每次显示都重绑
    menu.querySelectorAll('.ctx-item').forEach(function (item) {
      item.addEventListener('click', function () {
        const action = this.dataset.action;
        ContextMenu._handleAction(action);
        ContextMenu.hide();
      });
    });

    // 点击菜单外任意处关闭：closest 判定可避免点菜单自身时被误关
    document.addEventListener('click', function (e) {
      if (ContextMenu._visible && !e.target.closest('#deco-context-menu')) {
        ContextMenu.hide();
      }
    });

    // 贴图右键事件入口，仅管理员响应
    EventBus.on(EVENTS.DECO_CONTEXT_MENU, function (data) {
      if (!window.__REVACHOL__.AppState || !window.__REVACHOL__.AppState.get('isLoggedIn')) return;
      ContextMenu.show(data.decoId, data.x, data.y);
    });

    console.log('[ContextMenu] 初始化完成');
  },

  // 在指定坐标显示菜单
  // 坐标先夹到视口内再减菜单尺寸：菜单贴右下角边缘时向内收，避免被裁掉
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

    // 切换样式项需按当前样式显示目标样式名，故每次显示重写
    const toggleItem = menu.querySelector('[data-action="toggle-style"]');
    if (toggleItem) {
      toggleItem.innerHTML = this._emojiItemLabel(UI.deco.toggleStyleLabel(item.style));
    }

    // 粘贴依赖剪贴板是否有内容，无内容时置灰并禁用点击
    const pasteItem = menu.querySelector('[data-action="paste"]');
    if (pasteItem) {
      pasteItem.style.opacity = DecoShelf._clipboardId ? '1' : '0.4';
      pasteItem.style.pointerEvents = DecoShelf._clipboardId ? 'auto' : 'none';
    }
  },

  // 隐藏菜单并清空目标
  // 必须清 _targetDecoId：否则下次误触发会作用到上一次的贴图
  hide: function () {
    if (this._menu) {
      this._menu.style.display = 'none';
    }
    this._visible = false;
    this._targetDecoId = null;
  },

  // 按菜单项动作分发
  // 目标 id 取自 _targetDecoId（show 时记录），并再次校验贴图仍存在
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

      // 粘贴：复制剪贴板中的贴图，并落到当前贴图右下方 20px 处
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
        // 区分「取消」（null）与「清空」，故只判 null 而不判空串
        const newName = prompt(UI.deco.renamePrompt, item.name);
        if (newName !== null) {
          DecoShelf.rename(id, newName);
        }
        break;
      }

      case 'deco-edit':
        // 已在编辑同一贴图则直接返回，避免无谓的退出再进入造成闪烁
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
        // 从库中删除不可撤销，故二次确认
        if (confirm(UI.deco.deleteConfirm(item.name))) {
          DecoShelf.deleteFromLibrary(id);
          Utils.showToast(UI.notification.decoDeleteSuccess, false);
        }
        break;
    }
  },
};
