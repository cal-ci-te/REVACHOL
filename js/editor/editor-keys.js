/**
 * 编辑器键盘快捷键 — ESC / Ctrl+S / Ctrl+Enter 处理。
 *
 * 通过 bind(ctx) 注入上下文对象，不依赖主控模块，避免循环引用。
 *
 * @module editor-keys
 */

import { UI } from '../utils/ui-strings.js';

export const EditorKeys = {

  /**
   * 注册键盘事件监听（document keydown）。
   * @param {object} ctx - 上下文对象
   * @param {function(): boolean} ctx.hasChanges - 是否有未保存修改
   * @param {function(): Promise} ctx.saveDraft - 保存草稿
   * @param {function(): Promise} ctx.saveAndPublish - 发布文章
   * @param {function(boolean)} ctx.close - 关闭编辑器
   * @param {function(e): boolean} [ctx.isContentEditing] - 判断焦点是否在编辑区域
   * @returns {function} 注销函数（调用后移除监听）
   */
  bind(ctx) {
    var self = this;

    function handler(e) {
      // 跳过在 contentEditable 中的常规输入
      var target = e.target;
      var isEditing = target && (target.contentEditable === 'true' ||
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA'));

      if (e.key === 'Escape') {
        e.preventDefault();
        if (ctx._dirty || ctx.hasChanges()) {
          var discard = confirm(UI.editor.unsavedConfirm || '有未保存的更改，确定要退出吗？');
          if (discard) {
            ctx.close(false);
          }
        } else {
          ctx.close(false);
        }
        return;
      }

      // Ctrl+S/Ctrl+Enter 在 contentEditable 中不触发（防止输入时误操作）
      if (isEditing && (e.ctrlKey || e.metaKey)) return;

      // Ctrl+S → 保存草稿
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        ctx.saveDraft();
      }

      // Ctrl+Enter → 发布
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        ctx.saveAndPublish();
      }
    }

    document.addEventListener('keydown', handler);
    console.log('[EditorKeys] 快捷键已绑定');

    // 返回注销函数
    return function unbind() {
      document.removeEventListener('keydown', handler);
      console.log('[EditorKeys] 快捷键已解绑');
    };
  },
};
