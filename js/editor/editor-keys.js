// ！编辑器快捷键
// 处理 ESC / Ctrl+S / Ctrl+Enter 三个编辑期快捷键。
// 经 bind(ctx) 注入上下文对象，不依赖主控模块，避免循环引用。
import { UI } from '../utils/ui-strings.js';

export const EditorKeys = {

  // 注册键盘监听，返回注销函数
  // ESC 不做「是否在编辑中」判断：它是唯一能退出编辑器的入口，被屏蔽会导致用户无法退出
  // Ctrl+S / Ctrl+Enter 则相反，在可编辑区内直接放行，否则会抢走浏览器与输入法的组合键
  bind(ctx) {
    const self = this;

    function handler(e) {
      const target = e.target;
      const isEditing = target && (target.contentEditable === 'true' ||
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'));

      if (e.key === 'Escape') {
        e.preventDefault();
        if (ctx._dirty || ctx.hasChanges()) {
          const discard = confirm(UI.editor.unsavedConfirm || '有未保存的更改，确定要退出吗？');
          if (discard) {
            ctx.close(false);
          }
        } else {
          ctx.close(false);
        }
        return;
      }

      if (isEditing && (e.ctrlKey || e.metaKey)) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        ctx.saveDraft();
      }

      // Meta 与 Ctrl 一并支持：兼顾 macOS 的 Command 键
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        ctx.saveAndPublish();
      }
    }

    document.addEventListener('keydown', handler);
    console.log('[EditorKeys] 快捷键已绑定');

    return function unbind() {
      document.removeEventListener('keydown', handler);
      console.log('[EditorKeys] 快捷键已解绑');
    };
  },
};
