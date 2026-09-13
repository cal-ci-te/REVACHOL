// ！渐变与色卡处理
// 背景模式切换、渐变参数调节，以及把当前配色保存为可复用色卡。
import { Texture } from '../../../services/texture.js';
import { Utils } from '../../../utils.js';
import { AdminPanel } from '../index.js';

// 切换背景模式：选「渐变」才展开渐变控件区，其余模式收起以免干扰
export function bgMode(event) {
  const gradControls = document.getElementById('gradientControls');
  if (event.target.value === 'gradient') {
    if (gradControls) gradControls.style.display = 'block';
  } else {
    if (gradControls) gradControls.style.display = 'none';
  }
}

export function gradDirection(event) {
  Texture.setDirection(event.target.value);
}

// 调节渐变羽化并同步数值显示
export function gradFeather(event) {
  const val = parseInt(event.target.value);
  const valueDisplay = document.getElementById('gradFeatherValue');
  if (valueDisplay) valueDisplay.textContent = val;
  Texture.setFeather(val);
}

// 应用渐变
// 至少需要两种颜色才算渐变，不足时提示而非静默应用
// 第三个取色器仅在可见时计入：它服务于三色渐变，隐藏时应忽略其残留值
export function applyGradient() {
  const colors = [];
  const c1 = document.getElementById('gradColor1');
  const c2 = document.getElementById('gradColor2');
  const c3 = document.getElementById('gradColor3');
  if (c1) colors.push(c1.value);
  if (c2) colors.push(c2.value);
  if (c3 && c3.style.display !== 'none') colors.push(c3.value);
  if (colors.length < 2) {
    Utils.showToast('请至少选择两种颜色', true);
    return;
  }
  const dir = document.getElementById('gradDirection');
  const feather = document.getElementById('gradFeatherSlider');
  if (Texture && Texture.setGradient) {
    Texture.setGradient(
      colors,
      dir ? dir.value : 'to bottom',
      feather ? parseInt(feather.value) : 50
    );
    // 应用渐变后同步切换单选按钮与控件显隐，避免界面状态与实际背景不一致
    const gradientRadio = document.querySelector('input[name="bgMode"][value="gradient"]');
    if (gradientRadio) gradientRadio.checked = true;
    const gradControls = document.getElementById('gradientControls');
    if (gradControls) gradControls.style.display = 'block';
    if (AdminPanel.renderPalettes) AdminPanel.renderPalettes();
  } else {
    Utils.showToast('纹理模块未加载', true);
  }
}

// 把当前配色保存为色卡
// 单色存为纯色色卡、多色存为渐变色卡，据此决定 mode 字段
// 未填名称时按配色自动生成，保证色卡始终有可辨识的标识
export function savePalette() {
  const colors = [];
  const c1 = document.getElementById('gradColor1');
  const c2 = document.getElementById('gradColor2');
  const c3 = document.getElementById('gradColor3');
  if (c1) colors.push(c1.value);
  if (c2) colors.push(c2.value);
  if (c3 && c3.style.display !== 'none') colors.push(c3.value);
  if (colors.length < 1) {
    Utils.showToast('请至少选择一种颜色', true);
    return;
  }
  const mode = colors.length === 1 ? 'solid' : 'gradient';
  const dir = document.getElementById('gradDirection');
  const feather = document.getElementById('gradFeatherSlider');
  const nameInput = document.getElementById('paletteNameInput');
  let name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    name = mode === 'solid' ? `纯色 ${colors[0]}` : `渐变 ${colors.join('-')}`;
  }
  if (Texture && Texture.addPalette) {
    Texture.addPalette(
      name,
      mode,
      colors,
      dir ? dir.value : 'to bottom',
      feather ? parseInt(feather.value) : 50
    );
    // 保存后清空名称输入并刷新色卡列表，便于连续保存多组
    if (nameInput) nameInput.value = '';
    Utils.showToast('色卡已保存', false);
    if (AdminPanel.renderPalettes) AdminPanel.renderPalettes();
  } else {
    Utils.showToast('纹理模块未加载', true);
  }
}
