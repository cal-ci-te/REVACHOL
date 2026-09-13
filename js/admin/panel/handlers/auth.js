// ！退出登录处理
// 面板内退出按钮的处理器，转发到 AdminAuth。
import { AdminAuth } from '../../auth.js';
import { Utils } from '../../../utils.js';

export function logout() {
  // 模块可能尚未加载完成，此时给出提示而非静默失败
  if (AdminAuth && AdminAuth.logout) {
    AdminAuth.logout();
  } else {
    Utils.showToast('退出失败，请刷新页面', true);
  }
}
