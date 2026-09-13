// ！超现实箱子自定义处理
// 管理面板中箱子外观的定制：箱盖图、箱体图与单个物件图的替换与移除。
// 三类图片流程一致（校验类型 → 读为 dataUrl → 交给箱子实例），仅落点不同。
import { getMagicBox } from '../../../ui/components/magic-box/index.js';
import { ITEMS } from '../../../ui/components/magic-box/BoxItemPool.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';

// 提示文案取 handleLidImage 的短别名：本文件提示密集，逐处写全路径会显著拉长代码
const T = UI.magicBox.toast;

// 打开箱盖图选择框
// 先清空 input 值：否则连续选择同一文件不会触发 change 事件
export function uploadLidImage() {
  const input = document.getElementById('boxLidImageFileInput');
  if (!input) { Utils.showToast(T.uploadNotReady, true); return; }
  input.value = '';
  input.click();
}

// 读取并应用箱盖图
// 先按 MIME 前缀校验再读取：非图片文件读成 dataUrl 会得到无法渲染的长字符串
export function handleLidImageFile(file) {
  if (!file || !file.type.startsWith('image/')) { Utils.showToast(T.imageFormatOnly, true); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const box = getMagicBox();
    if (box) { box.setCustomLidImage(e.target.result); Utils.showToast(T.lidImageUpdated, false); }
  };
  reader.onerror = function () { Utils.showToast(T.imageReadFailed, true); };
  reader.readAsDataURL(file);
}

// 移除箱盖图，恢复默认外观
export function removeLidImage() {
  const box = getMagicBox();
  if (box) { box.setCustomLidImage(null); Utils.showToast(T.lidImageRemoved, false); }
}

// 打开箱体图选择框
export function uploadBodyImage() {
  const input = document.getElementById('boxBodyImageFileInput');
  if (!input) { Utils.showToast(T.uploadNotReady, true); return; }
  input.value = '';
  input.click();
}

// 读取并应用箱体图
export function handleBodyImageFile(file) {
  if (!file || !file.type.startsWith('image/')) { Utils.showToast(T.imageFormatOnly, true); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const box = getMagicBox();
    if (box) { box.setCustomBodyImage(e.target.result); Utils.showToast(T.bodyImageUpdated, false); }
  };
  reader.onerror = function () { Utils.showToast(T.imageReadFailed, true); };
  reader.readAsDataURL(file);
}

// 移除箱体图，恢复默认外观
export function removeBodyImage() {
  const box = getMagicBox();
  if (box) { box.setCustomBodyImage(null); Utils.showToast(T.bodyImageRemoved, false); }
}

// 打开物件图选择框
// 需先选中物件：图片要挂到具体物件上，未选则无从落点
export function uploadItemImage() {
  const select = document.getElementById('boxItemSelect');
  const input = document.getElementById('boxItemImageFileInput');
  if (!select || !input) { Utils.showToast(T.uploadNotReady, true); return; }
  if (!select.value) { Utils.showToast(T.selectItemFirst, true); return; }
  input.value = '';
  input.click();
}

// 读取并应用指定物件的图片
// 提示文案带上物件名称：该操作针对下拉框中选中的那一项，需让用户确认改对了目标
export function handleItemImageFile(file) {
  if (!file || !file.type.startsWith('image/')) { Utils.showToast(T.imageFormatOnly, true); return; }
  const select = document.getElementById('boxItemSelect');
  const itemId = select ? select.value : null;
  if (!itemId) { Utils.showToast(T.selectItem, true); return; }
  const reader = new FileReader();
  reader.onload = function (e) {
    const box = getMagicBox();
    if (box) {
      box.setItemImage(itemId, e.target.result);
      const item = ITEMS.find(function (i) { return i.id === itemId; });
      Utils.showToast(T.itemImageUpdated(item ? item.label : itemId), false);
    }
  };
  reader.onerror = function () { Utils.showToast(T.imageReadFailed, true); };
  reader.readAsDataURL(file);
}

// 移除指定物件的图片，回落到默认图形
export function removeItemImage() {
  const select = document.getElementById('boxItemSelect');
  const itemId = select ? select.value : null;
  if (!itemId) { Utils.showToast(T.selectItem, true); return; }
  const box = getMagicBox();
  if (box) {
    box.setItemImage(itemId, null);
    const item = ITEMS.find(function (i) { return i.id === itemId; });
    Utils.showToast(T.itemImageRemoved(item ? item.label : itemId), false);
  }
}
