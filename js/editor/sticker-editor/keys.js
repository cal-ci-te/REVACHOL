/**
 * 贴纸编辑器键盘快捷键 — 双击 ESC 放弃、Ctrl+Enter 确认。
 *
 * @module sticker-editor/keys
 */

import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';

export const Keys = {

  /**
   * 注册 keyboard 事件监听。
   * @param {object} ctx - { close, removeContextMenu }
   * @returns {function} 注销函数
   */
  bind(ctx) {
    var pressCount = 0;
    var pressTimer = null;

    function handler(e) {
      if (e.key === 'Escape') {
        ctx.removeContextMenu();
        ctx.removeContextMenu();
        pressCount++;
        if (pressCount >= 2) {
          clearTimeout(pressTimer);
          pressCount = 0;
          ctx.close(false);
          Utils.showToast(UI.stickerEditor.cancelledToast || '已放弃贴纸更改', false);
        } else {
          Utils.showToast(UI.stickerEditor.escHint || '再按一次 ESC 放弃更改', false);
          pressTimer = setTimeout(function () {
            pressCount = 0;
          }, 1500);
        }
      }

      // Ctrl+Enter 确认
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        ctx.close(true);
        Utils.showToast(UI.stickerEditor.savedToast || '贴纸位置已保存', false);
      }
    }

    document.addEventListener('keydown', handler);

    return function unbind() {
      if (pressTimer) clearTimeout(pressTimer);
      document.removeEventListener('keydown', handler);
    };
  },
};
