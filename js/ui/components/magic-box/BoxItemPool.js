// ！魔法箱物品池
// 物品数据统一存放在 UI.magicBox.items（js/utils/ui-strings.js），本模块只提供随机抽取与读取。
import { UI } from '../../../utils/ui-strings.js';
const ITEMS = UI.magicBox.items;

// 随机抽取物品
// 池内多于一项时排除上一次的 id，避免连续两次弹同一条；仅一项时无从排除，直接返回
export function pickItem(lastItemId) {
  const candidates = ITEMS.length === 1
    ? ITEMS
    : ITEMS.filter(item => item.id !== lastItemId);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// 读取全部物品副本
export function getAllItems() { return ITEMS.slice(); }
export { ITEMS };
