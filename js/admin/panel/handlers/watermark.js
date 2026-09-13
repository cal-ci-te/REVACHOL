// ！水印处理
// 面板内水印文本与透明度的应用，取值缺省时回落到内置默认。
import { Watermark } from '../../../services/watermark.js';
import { Utils } from '../../../utils.js';

// 应用水印设置
// 输入框缺失时回落默认文案与透明度，避免因元素未渲染而写入空值
export function applyWatermark() {
  const textInput = document.getElementById('watermarkTextInput');
  const opacitySlider = document.getElementById('watermarkOpacitySlider');
  const newText = textInput ? textInput.value.trim() : 'REVACHOL';
  const newOpacity = opacitySlider ? parseFloat(opacitySlider.value) : 0.08;
  if (Watermark && Watermark.apply) {
    Watermark.apply(newText, newOpacity);
    Utils.showToast('水印设置已应用', false);
  } else {
    Utils.showToast('水印模块未加载', true);
  }
}

// 仅更新透明度数值显示，实际应用由 applyWatermark 统一提交
export function watermarkOpacity(event) {
  const val = parseFloat(event.target.value);
  const valueDisplay = document.getElementById('opacityValue');
  if (valueDisplay) valueDisplay.innerText = val.toFixed(2);
}
