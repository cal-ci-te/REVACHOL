/**
 * 贴纸数据模型 — 权威数据源与状态管理。
 *
 * 职责：
 * - 持有贴纸数据（StickerObject[]），提供 CRUD 与查询；
 * - 维护 id 集合，确保 id 唯一性；
 * - 对外提供 backfillContent（旧数据兼容补齐）、releaseIds（生命周期清理）；
 * - 内部使用 id-generator 生成新 id。
 *
 * @internal 仅供 js/business/sticker 内部使用，不对外导出。
 */
import { generateId } from './id-generator.js';

/**
 * @typedef {object} StickerObject
 * @property {string} id - 贴纸唯一标识
 * @property {number} [x] - 左边缘相对容器左侧百分比
 * @property {number} [y] - 上边缘相对容器顶部百分比
 * @property {number} [width] - 宽度（px）
 * @property {number} [height] - 高度（px）
 * @property {'left'|'right'} [align] - 浮动方向
 * @property {number} [margin] - 文字间距（px）
 * @property {string} [src] - 图片资源地址
 * @property {string} [anchor] - 锚点序列化字符串
 */

export class StickerModel {
  constructor() {
    /** @type {Map<string, StickerObject>} */
    this._data = new Map();
  }

  /** 获取全部贴纸（按添加顺序）。 */
  getAll() {
    return [...this._data.values()];
  }

  /** 获取单个贴纸。 */
  get(id) {
    if (!id) return undefined;
    return this._data.get(String(id));
  }

  /** 设置（替换）全部贴纸。 */
  setAll(stickers) {
    this._data.clear();
    if (Array.isArray(stickers)) {
      for (const s of stickers) {
        if (s && s.id) this._data.set(s.id, { ...s });
      }
    }
  }

  /** 添加贴纸（若 id 已存在则覆盖）。 */
  add(sticker) {
    if (!sticker || !sticker.id) {
      throw new Error('StickerModel: add 需要带 id 的 StickerObject');
    }
    this._data.set(sticker.id, { ...sticker });
  }

  /** 移除贴纸。 */
  remove(id) {
    if (!id) return false;
    return this._data.delete(String(id));
  }

  /** 更新贴纸（部分更新，合并到现有数据）。 */
  update(id, patch) {
    if (!id || !patch || typeof patch !== 'object') return false;
    const existing = this._data.get(String(id));
    if (!existing) return false;
    this._data.set(String(id), { ...existing, ...patch });
    return true;
  }

  /** 清空所有贴纸。 */
  clear() {
    this._data.clear();
  }

  /** 当前贴纸数量。 */
  get size() {
    return this._data.size;
  }

  /**
   * 生成唯一 id（基于已有 id 集合确保不冲突）。
   * @param {{ prefix?: string, maxAttempts?: number }} [options]
   * @returns {string}
   */
  generateId(options) {
    return generateId(this._data.keys(), options);
  }

  /**
   * 兼容旧数据：补齐缺失字段，返回归一化后的 StickerObject[]。
   * 不修改 content，只返回归一化后的 stickers 数组。
   * @param {Array<object>} rawStickers - 原始 stickeres 数据（可能来自文章或旧标记解析）
   * @returns {Array<StickerObject>}
   */
  backfillContent(rawStickers) {
    if (!Array.isArray(rawStickers)) return [];
    const generatedIds = new Set();
    const existingIds = new Set(this._data.keys());
    return rawStickers.map((s) => {
      let id = s.id || s.decoId;
      if (!id) {
        id = generateId([...existingIds, ...generatedIds]);
        generatedIds.add(id);
      }
      return {
        id,
        x: s.x !== undefined && s.x !== null ? s.x : 50,
        y: s.y !== undefined && s.y !== null ? s.y : 50,
        width: s.width || s.w || 120,
        height: s.height || s.h || 120,
        align: s.align || 'left',
        margin: s.margin !== undefined && s.margin !== null ? s.margin : 20,
        src: s.src || s.dataUrl || '',
      };
    });
  }

  /**
   * 释放指定 id 集合（生命周期清理）。仅移除不在提供的 ids 或 predicate 不匹配的 id。
   * @param {string[]|Function} idsOrPredicate - id 数组，或 (id) => boolean 谓词
   * @throws {TypeError} 参数类型非法时抛出
   */
  releaseIds(idsOrPredicate) {
    let predicate;
    if (typeof idsOrPredicate === 'function') {
      predicate = idsOrPredicate;
    } else if (Array.isArray(idsOrPredicate)) {
      if (idsOrPredicate.some((id) => typeof id !== 'string')) {
        throw new TypeError('releaseIds: 数组元素必须为字符串');
      }
      predicate = (id) => !idsOrPredicate.includes(id);
    } else {
      throw new TypeError('releaseIds: 参数必须为字符串数组或谓词函数');
    }
    for (const [id] of this._data) {
      if (predicate(id)) this._data.delete(id);
    }
  }
}

export default StickerModel;