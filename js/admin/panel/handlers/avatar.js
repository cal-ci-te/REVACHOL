// ！头像上传处理
// 面板内上传头像按钮的处理器，转发到 AdminAvatar 并统一兜底异常。
import { AdminAvatar } from '../../avatar.js';
import { Utils } from '../../../utils.js';

export function uploadAvatar() {
  console.log('[AdminPanel] 点击上传头像按钮');
  // 整体 try-catch：文件选择涉及浏览器权限与读取，异常需转为提示而非中断事件流
  try {
    if (AdminAvatar && typeof AdminAvatar.openUpload === 'function') {
      AdminAvatar.openUpload();
    } else {
      console.warn('[AdminPanel] AdminAvatar.openUpload 不可用');
      Utils.showToast('头像模块未加载，请刷新页面重试', true);
    }
  } catch (error) {
    console.error('[AdminPanel] 头像上传出错:', error);
    Utils.showToast('操作失败: ' + error.message, true);
  }
}
