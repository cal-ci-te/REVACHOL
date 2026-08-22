// 超现实箱子状态管理 — 位置、打开计数、上次物品 ID、自定义图片（箱盖/箱体双部件）。
// 持久化到 localStorage（键名 rv_box_data），变更后自动保存。
const STORAGE_KEY = 'rv_box_data';

/** 默认配置（第一次使用时的初始值） */
const DEFAULTS = {
  defaultX: null,
  defaultY: null,
  positionStyle: 'fixed',   // 'fixed'（贴纸模式/视口固定）| 'absolute'（悬浮窗/随页面滚动）
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

  // ---- 持久化 ----

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    } catch (e) {
      console.warn('[MagicBox:State] 保存失败:', e);
    }
  }

  /** 从 localStorage 加载状态并合并默认值（兼容旧版 customImage 字段迁移） */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // v1.16 → v1.16.1 迁移：旧 customImage 字段转存为 customBodyImage
        if (parsed.customImage && !parsed.customBodyImage) {
          parsed.customBodyImage = parsed.customImage;
        }
        delete parsed.customImage;
        this._data = { ...DEFAULTS, ...parsed };
      } else {
        this._data = { ...DEFAULTS };
      }
    } catch (e) {
      console.warn('[MagicBox:State] 读取失败，使用默认值:', e);
      this._data = { ...DEFAULTS };
    }
    this._loaded = true;
    return this._data;
  }

  /** 导出当前状态快照 */
  exportState() {
    return { ...this._data };
  }

  // ---- 位置 ----

  getDefaultX() { return this._data.defaultX; }
  getDefaultY() { return this._data.defaultY; }

  setDefaultPosition(x, y) {
    this._data.defaultX = x;
    this._data.defaultY = y;
    this._save();
  }

  /** 清除自定义位置，恢复 CSS 默认 */
  clearPosition() {
    this._data.defaultX = null;
    this._data.defaultY = null;
    this._save();
  }

  /** 是否有用户（管理员）设定的默认位置 */
  hasCustomPosition() {
    return this._data.defaultX !== null && this._data.defaultY !== null;
  }

  // ---- 定位样式（fixed / absolute）----

  getPositionStyle() { return this._data.positionStyle || 'fixed'; }

  setPositionStyle(style) {
    this._data.positionStyle = style === 'absolute' ? 'absolute' : 'fixed';
    this._save();
  }

  // ---- 计数器 ----

  getCount() { return this._data.count; }

  incrementCount() {
    this._data.count++;
    this._save();
  }

  resetCount() {
    this._data.count = 0;
    this._save();
  }

  // ---- 物品去重 ----

  getLastItemId() { return this._data.lastItemId; }

  setLastItemId(id) {
    this._data.lastItemId = id;
    this._save();
  }

  // ---- 箱盖/箱体自定义贴图 ----

  getCustomLidImage()  { return this._external.lid || this._data.customLidImage; }
  getCustomBodyImage() { return this._external.body || this._data.customBodyImage; }

  /** 图标包外部覆盖：不写 localStorage，url 为空时回退旧自定义图 */
  setExternalLidImage(url) {
    this._external.lid = url || null;
  }

  /** 图标包外部覆盖：不写 localStorage，url 为空时回退旧自定义图 */
  setExternalBodyImage(url) {
    this._external.body = url || null;
  }

  setCustomLidImage(dataUrl) {
    this._data.customLidImage = dataUrl || null;
    this._save();
  }

  setCustomBodyImage(dataUrl) {
    this._data.customBodyImage = dataUrl || null;
    this._save();
  }

  clearCustomLidImage() {
    this._data.customLidImage = null;
    this._save();
  }

  clearCustomBodyImage() {
    this._data.customBodyImage = null;
    this._save();
  }

  /** 是否有任何自定义箱体外观（含图标包外部覆盖） */
  hasCustomAppearance() {
    return !!(this._external.lid || this._external.body || this._data.customLidImage || this._data.customBodyImage);
  }

  // ---- 物品自定义贴图 ----

  /** 获取指定物品的自定义贴图（图标包外部覆盖优先），无则返回 null */
  getItemImage(itemId) {
    return this._external.items[itemId] || this._data.itemImages[itemId] || null;
  }

  /** 图标包外部覆盖：不写 localStorage，url 为空时回退旧自定义图 */
  setExternalItemImage(itemId, url) {
    if (url) {
      this._external.items[itemId] = url;
    } else {
      delete this._external.items[itemId];
    }
  }

  /** 设置指定物品的自定义贴图 */
  setItemImage(itemId, dataUrl) {
    if (dataUrl) {
      this._data.itemImages[itemId] = dataUrl;
    } else {
      delete this._data.itemImages[itemId];
    }
    this._save();
  }

  /** 清除所有物品自定义贴图 */
  clearAllItemImages() {
    this._data.itemImages = {};
    this._save();
  }
}
