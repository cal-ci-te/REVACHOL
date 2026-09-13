// ！贴图编辑位置处理
// 面板内「确认/取消编辑贴图位置」的处理器，转发到 DecoShelf 的编辑态方法。
import { DecoShelf } from '../../../services/deco.js';
import { Utils } from '../../../utils.js';

// 确认编辑：提交当前贴图位置
export function confirmEditPos() {
  if (DecoShelf && DecoShelf.confirmEditing) {
    DecoShelf.confirmEditing();
  } else {
    Utils.showToast('模块未加载', true);
  }
}

// 取消编辑：放弃本次位置调整并退出编辑态
export function cancelEditPos() {
  if (DecoShelf && DecoShelf.cancelEditing) {
    DecoShelf.cancelEditing();
  } else {
    Utils.showToast('模块未加载', true);
  }
}
