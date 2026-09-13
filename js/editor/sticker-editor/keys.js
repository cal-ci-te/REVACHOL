// ！贴纸编辑器快捷键
// 双击 ESC 放弃更改，Ctrl+Enter 确认保存。
import { Utils } from '../../utils.js';
import { UI } from '../../utils/ui-strings.js';

export const Keys = {

  // 注册 keyboard 监听，返回注销函数
  // ESC 设计为双击确认而非单击：误触会丢弃全部贴纸调整，双击可有效降低误操作
  // 两次按键须在 1.5 秒内完成，超时则计数归零并重新提示
  bind(ctx) {
    let pressCount = 0;
    let pressTimer = null;

    // 先关闭右键菜单再计数：ESC 同时承担「关菜单」与「退出」两种语义
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

      // Meta 与 Ctrl 一并支持：兼顾 macOS 的 Command 键
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        ctx.close(true);
        Utils.showToast(UI.stickerEditor.savedToast || '贴纸位置已保存', false);
      }
    }

    document.addEventListener('keydown', handler);

    // 注销时清掉待触发的计时器：否则编辑器关闭后计时器仍会改写已复位的计数状态
    return function unbind() {
      if (pressTimer) clearTimeout(pressTimer);
      document.removeEventListener('keydown', handler);
    };
  },
};
