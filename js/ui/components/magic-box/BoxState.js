// ！魔法箱状态
// 维护箱子的位置、开关计数、上次物品与自定义贴图（箱盖/箱体/各物品），持久化到 localStorage（键 rv_box_data）。
// 外部覆盖（图标包）只存内存不落盘：这样删掉图标包或切主题后能无损回退到用户自传的图。
const STORAGE_KEY = 'rv_box_data';

// 首次使用时的初始值
const DEFAULTS = {
  defaultX: null,
  defaultY: null,
  // fixed 为视口固定（贴纸模式）；absolute 随页面滚动（悬浮窗）
  positionStyle: 'fixed',
  count: 0,
  lastItemId: null,
  customLidImage: null,
  customBodyImage: null,
  itemImages: {},
};

export class BoxState {
  constructor() {
    this._data = { ...DEFAULTS };
    this._loaded = false;
    // 图标包外部覆盖：不参与 _save()，保证旧自定义图不被覆盖
    this._external = { lid: null, body: null, items: {} };
  }

  // 落盘
  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.warn('[MagicBox:State] 保存失败:', e);
    }
  }

  // 读取并合并默认值
  // 合并而非直接赋值：旧版本数据缺少新增字段，直接赋值会让这些字段变成 undefined
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 旧版 customImage 迁移为 customBodyImage（双部件拆分前的单图字段）
        if (parsed.customImage && !parsed.customBodyImage) {
          parsed.customBodyImage = parsed.customImage;
        }
        delete parsed.customImage;
        this._data = { ...DEFAULTS, ...parsed };
      } else {
        this._data = { ...DEFAULTS };
      }
    } catch (e) {
      // 读到损坏数据时回落默认值：宁可丢一次位置，也不能让箱子整体不可用
      console.warn('[MagicBox:State] 读取失败，使用默认值:', e);
      this._data = { ...DEFAULTS };
    }
    this._loaded = true;
    return this._data;
  }

  // 导出状态副本
  exportState() {
    return { ...this._data };
  }

  // 读取默认坐标
  getDefaultX() { return this._data.defaultX; }
  getDefaultY() { return this._data.defaultY; }

  // 保存默认坐标
  setDefaultPosition(x, y) {
    this._data.defaultX = x;
    this._data.defaultY = y;
    this._save();
  }

  // 清除自定义位置（恢复 CSS 默认）
  clearPosition() {
    this._data.defaultX = null;
    this._data.defaultY = null;
    this._save();
  }

  // 是否已设过默认位置
  hasCustomPosition() {
    return this._data.defaultX !== null && this._data.defaultY !== null;
  }

  // 读取定位方式
  getPositionStyle() { return this._data.positionStyle || 'fixed'; }

  // 设置定位方式（非法值一律按 fixed 处理）
  setPositionStyle(style) {
    this._data.positionStyle = style === 'absolute' ? 'absolute' : 'fixed';
    this._save();
  }

  // 读取开启次数
  getCount() { return this._data.count; }

  // 开启次数加一
  incrementCount() {
    this._data.count++;
    this._save();
  }

  // 重置开启次数
  resetCount() {
    this._data.count = 0;
    this._save();
  }

  // 读取上次物品 ID（用于去重）
  getLastItemId() { return this._data.lastItemId; }

  // 记录本次物品 ID
  setLastItemId(id) {
    this._data.lastItemId = id;
    this._save();
  }

  // 读取箱盖/箱体贴图（外部覆盖优先）
  getCustomLidImage()  { return this._external.lid || this._data.customLidImage; }
  getCustomBodyImage() { return this._external.body || this._data.customBodyImage; }

  // 设置箱盖外部覆盖
  setExternalLidImage(url) {
    this._external.lid = url || null;
  }

  // 设置箱体外部覆盖
  setExternalBodyImage(url) {
    this._external.body = url || null;
  }

  // 保存箱盖贴图
  setCustomLidImage(dataUrl) {
    this._data.customLidImage = dataUrl || null;
    this._save();
  }

  // 保存箱体贴图
  setCustomBodyImage(dataUrl) {
    this._data.customBodyImage = dataUrl || null;
    this._save();
  }

  // 清除箱盖贴图
  clearCustomLidImage() {
    this._data.customLidImage = null;
    this._save();
  }

  // 清除箱体贴图
  clearCustomBodyImage() {
    this._data.customBodyImage = null;
    this._save();
  }

  // 是否有任何自定义外观（含外部覆盖）
  hasCustomAppearance() {
    return !!(this._external.lid || this._external.body || this._data.customLidImage || this._data.customBodyImage);
  }

  // 读取指定物品贴图（外部覆盖优先）
  getItemImage(itemId) {
    return this._external.items[itemId] || this._data.itemImages[itemId] || null;
  }

  // 设置物品外部覆盖
  setExternalItemImage(itemId, url) {
    if (url) {
      this._external.items[itemId] = url;
    } else {
      delete this._external.items[itemId];
    }
  }

  // 保存物品贴图
  setItemImage(itemId, dataUrl) {
    if (dataUrl) {
      this._data.itemImages[itemId] = dataUrl;
    } else {
      delete this._data.itemImages[itemId];
    }
    this._save();
  }

  // 清除全部物品贴图
  clearAllItemImages() {
    this._data.itemImages = {};
    this._save();
  }
}
