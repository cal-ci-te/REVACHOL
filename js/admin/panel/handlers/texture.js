// ！纹理处理
// 面板内纹理的上传、应用、移除与透明度调节。
import { Texture } from '../../../services/texture.js';
import { Utils } from '../../../utils.js';

// 上传纹理文件
// 处理完即清空 input 值：否则再次选择同一文件不会触发 change 事件
export function textureUpload(event) {
  const file = event.target.files[0];
  if (file) {
    if (Texture && Texture.uploadTexture) {
      Texture.uploadTexture(file);
    } else {
      Utils.showToast('纹理模块未加载', true);
    }
    event.target.value = '';
  }
}

// 应用纹理并提示产物大小
// 未上传却点应用时明确提示，避免保存空配置
export function applyTexture() {
  if (!Texture) {
    Utils.showToast('纹理模块未加载', true);
    return;
  }
  if (!Texture.textureConfig || !Texture.textureConfig.dataUrl) {
    Utils.showToast('请先上传纹理图片', true);
    return;
  }
  if (Texture.saveConfig) {
    Texture.saveConfig();
    // dataUrl 长度近似字节数，除以 1024 得到 KB 供用户判断体积
    const size = (Texture.textureConfig.dataUrl.length / 1024).toFixed(1);
    Utils.showToast(`纹理已应用（WebP格式，${size}KB）`, false);
  }
}

export function resetTexture() {
  if (Texture && Texture.removeTexture) {
    Texture.removeTexture();
    Utils.showToast('纹理已移除', false);
  } else {
    Utils.showToast('纹理模块未加载', true);
  }
}

// 调节纹理透明度：先更新数值显示再写入服务，保证滑块反馈即时
export function textureOpacity(event) {
  const val = parseFloat(event.target.value);
  const valueDisplay = document.getElementById('textureOpacityValue');
  if (valueDisplay) valueDisplay.innerText = val.toFixed(2);
  if (Texture && Texture.setOpacity) {
    Texture.setOpacity(val);
  }
}
