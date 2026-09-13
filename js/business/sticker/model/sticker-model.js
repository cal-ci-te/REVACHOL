// ！贴纸数据模型
// 贴纸数据的权威源与状态管理：持有 StickerObject[]、提供 CRUD 与查询、维护 id 唯一性。
// 对外提供 backfillContent（旧数据兼容补齐）与 releaseIds（生命周期清理）；新 id 一律经 id-generator 生成。
// 内部模块，不对外导出：仅供 js/business/sticker 内部使用。

// StickerObject 字段（此处为唯一权威定义，避免各处重复 typedef）
// id 贴纸唯一标识；x/y 相对容器左上角的百分比；width/height 尺寸（px）；
// align left|right 浮动方向；margin 文字间距（px）；src 图片资源地址；anchor 锚点序列化字符串。
import { generateId } from './id-generator.js';

export class StickerModel {
  constructor() {
    this._data = new Map();
  }

  // 获取全部贴纸（按添加顺序）
  getAll() {
    return [...this._data.values()];
  }

  // 获取单个贴纸
  // 查询键统一转字符串：调用方须保证写入时的 id 也是字符串，否则数字 id 会查不到
  get(id) {
    if (!id) return undefined;
    return this._data.get(String(id));
  }

  // 设置（替换）全部贴纸
  // 逐条浅拷贝：避免外部持有的对象引用在之后被修改而污染模型内部数据
  // 丢弃无 id 项而非报错：模型以 id 为唯一键，单条缺 id 不应拖垮整批导入
  setAll(stickers) {
    this._data.clear();
    if (Array.isArray(stickers)) {
      for (const s of stickers) {
        if (s && s.id) this._data.set(s.id, { ...s });
      }
    }
  }

  // 添加贴纸（id 已存在则覆盖）
  // 缺 id 直接抛错：静默丢弃会让调用方误以为添加成功
  add(sticker) {
    if (!sticker || !sticker.id) {
      throw new Error('StickerModel: add 需要带 id 的 StickerObject');
    }
    this._data.set(sticker.id, { ...sticker });
  }

  // 移除贴纸
  remove(id) {
    if (!id) return false;
    return this._data.delete(String(id));
  }

  // 更新贴纸（部分更新，合并到现有数据）
  // 未知 id 返回 false 而非抛错：便于调用方按返回值处理，保持操作幂等
  update(id, patch) {
    if (!id || !patch || typeof patch !== 'object') return false;
    const existing = this._data.get(String(id));
    if (!existing) return false;
    this._data.set(String(id), { ...existing, ...patch });
    return true;
  }

  // 清空所有贴纸
  clear() {
    this._data.clear();
  }

  // 当前贴纸数量
  get size() {
    return this._data.size;
  }

  // 生成不冲突的新 id
  // 以模型内已有 id 作为去重集合，避免与现存贴纸撞号
  generateId(options) {
    return generateId(this._data.keys(), options);
  }

  // 兼容旧数据：补齐缺失字段，返回归一化后的 StickerObject[]
  // 不改动 content，只返回数组；逐项兜底而非整体判空，缺一个字段不应丢弃其余有效字段
  // 兼容旧字段别名：id|decoId、width|w、height|h、src|dataUrl
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

  // 释放 id（生命周期清理）
  // 入参语义：传数组时保留数组内 id、删除其余；传谓词时删除 predicate 返回 true 的 id
  // 传空数组等价于清空全部，调用方须自行确认；非数组非函数一律抛 TypeError，避免误操作静默清库
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
