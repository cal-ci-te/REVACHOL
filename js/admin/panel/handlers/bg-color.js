// ！背景颜色处理
// 面板内背景色的应用与重置，颜色值取自页面取色器控件。
import { Texture } from '../../../services/texture.js';
import { Utils } from '../../../utils.js';

// 应用取色器当前颜色，并同步预览与本地存储
// 落存储是为了刷新后保持：背景色属用户偏好而非会话态
export function applyBgColor() {
  const picker = document.getElementById('bgColorPicker');
  if (!picker) return;
  const color = picker.value;
  if (Texture && Texture.setBgColor) {
    Texture.setBgColor(color);
    const preview = document.getElementById('bgColorPreview');
    if (preview) preview.style.backgroundColor = color;
    Utils.showToast('背景颜色已应用', false);
    Utils.storage.set('bg_color', color);
  } else {
    Utils.showToast('纹理模块未加载', true);
  }
}

// 重置为默认背景色
// 取色器与预览需写具体 hex 而非 CSS 变量：color picker 只接受 hex 值
export function resetBgColor() {
  if (Texture && Texture.resetBgColor) {
    Texture.resetBgColor();
    const picker = document.getElementById('bgColorPicker');
    const preview = document.getElementById('bgColorPreview');
    if (picker) picker.value = '#1a1612';
    if (preview) preview.style.backgroundColor = '#1a1612';
    Utils.showToast('背景颜色已重置', false);
  } else {
    Utils.showToast('纹理模块未加载', true);
  }
}
