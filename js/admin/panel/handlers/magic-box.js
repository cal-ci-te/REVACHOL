// 管理面板 — 超现实箱子自定义处理器（双部件：箱盖 + 箱体）
import { getMagicBox } from '../../../ui/components/magic-box/index.js';
import { ITEMS } from '../../../ui/components/magic-box/BoxItemPool.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';

const T = UI.magicBox.toast;

export function uploadLidImage() {
  const input = document.getElementById('boxLidImageFileInput');
  if (!input) { Utils.showToast(T.uploadNotReady, true); return; }
  input.value = '';
  input.click();
}

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

export function removeLidImage() {
  const box = getMagicBox();
  if (box) { box.setCustomLidImage(null); Utils.showToast(T.lidImageRemoved, false); }
}

export function uploadBodyImage() {
  const input = document.getElementById('boxBodyImageFileInput');
  if (!input) { Utils.showToast(T.uploadNotReady, true); return; }
  input.value = '';
  input.click();
}

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

export function removeBodyImage() {
  const box = getMagicBox();
  if (box) { box.setCustomBodyImage(null); Utils.showToast(T.bodyImageRemoved, false); }
}

export function uploadItemImage() {
  const select = document.getElementById('boxItemSelect');
  const input = document.getElementById('boxItemImageFileInput');
  if (!select || !input) { Utils.showToast(T.uploadNotReady, true); return; }
  if (!select.value) { Utils.showToast(T.selectItemFirst, true); return; }
  input.value = '';
  input.click();
}

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
