/**
 * 贴纸编辑器悬浮工具栏 — 取消/确认按钮，复用 .deco-edit-toolbar CSS。
 *
 * @module sticker-editor/toolbar
 */

import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';

export const Toolbar = {

  /**
   * 创建底部悬浮工具栏。
   * @param {object} ctx - { close }
   * @returns {HTMLElement}
   */
  create(ctx) {
    const toolbar = document.createElement('div');
    toolbar.className = 'deco-edit-toolbar';
    toolbar.id = 'sticker-edit-toolbar';
    toolbar.innerHTML = [
      '<button id="stickerEditCancel" class="toolbar-btn danger">',
        UI.stickerEditor.cancelBtn || '❌ 取消',
      '</button>',
      '<span>' + (UI.stickerEditor.toolbarTitle || '贴纸编辑') + '</span>',
      '<button id="stickerEditConfirm" class="toolbar-btn primary">',
        UI.stickerEditor.confirmBtn || '✅ 确认',
      '</button>',
    ].join('');
    document.body.appendChild(toolbar);

    document.getElementById('stickerEditCancel').addEventListener('click', function (e) {
      e.stopPropagation();
      ctx.close(false);
      Utils.showToast(UI.stickerEditor.cancelledToast || '已放弃贴纸更改', false);
    });
    document.getElementById('stickerEditConfirm').addEventListener('click', function (e) {
      e.stopPropagation();
      ctx.close(true);
      Utils.showToast(UI.stickerEditor.savedToast || '贴纸位置已保存', false);
    });

    return toolbar;
  },

  destroy(toolbar) {
    if (toolbar) toolbar.remove();
  },
};
