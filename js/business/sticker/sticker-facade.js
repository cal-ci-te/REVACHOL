/**
 * StickerFacade — 贴纸系统唯一对外入口。
 *
 * 内部默认装配真实依赖（parser/model/renderer/security/serializer）；
 * 通过 createStickerFacadeWithMocks 支持依赖注入，便于单元测试隔离。
 */
import {
  parseMarkers,
  parseMarkersFromDom,
  parseMarkerFields,
  normalizeMarkerFields,
  MARKER_REGEX,
} from './parser/sticker-parser.js';
import { serializeOne, serializeAll } from './parser/sticker-serializer.js';
import { StickerModel } from './model/sticker-model.js';
import { renderSticker } from './renderer/sticker-renderer.js';
import {
  validateDataUrlMimeType,
  fetchAndValidateMimeType,
  assertSafeStickerData,
  sanitizeSvg,
  sanitizeSvgDataUrl,
  escapeCssUrl,
} from './security/security-utils.js';

export class StickerFacade {
  /**
   * @param {{ parser?: object, model?: StickerModel, renderer?: object, security?: object, serializer?: object }} [deps]
   */
  constructor(deps = {}) {
    this.parser =
      deps.parser ||
      {
        parseMarkers,
        parseMarkersFromDom,
        parseMarkerFields,
        normalizeMarkerFields,
        MARKER_REGEX,
      };
    this.model = deps.model || new StickerModel();
    this.renderer = deps.renderer || { renderSticker };
    this.security = deps.security || {
      validateDataUrlMimeType,
      fetchAndValidateMimeType,
      assertSafeStickerData,
      sanitizeSvg,
      sanitizeSvgDataUrl,
      escapeCssUrl,
    };
    this.serializer = deps.serializer || { serializeOne, serializeAll };
  }

  /** 解析文章内容中的贴纸标记。 */
  parseMarkers(content) {
    return this.parser.parseMarkers(content);
  }

  /** 从 DOM 容器解析贴纸标记。 */
  parseMarkersFromDom(container) {
    return this.parser.parseMarkersFromDom(container);
  }

  /** 解析单个标记字段串。 */
  parseMarkerFields(raw) {
    return this.parser.parseMarkerFields(raw);
  }

  /** 归一化标记字段。 */
  normalizeMarkerFields(f) {
    return this.parser.normalizeMarkerFields(f);
  }

  /** 统一贴纸标记正则（单一数据源）。 */
  get markerRegex() {
    return this.parser.MARKER_REGEX || MARKER_REGEX;
  }

  /** 序列化单个贴纸。 */
  serializeOne(sticker, options) {
    return this.serializer.serializeOne(sticker, options);
  }

  /** 序列化全部贴纸。 */
  serializeAll(stickers, options) {
    return this.serializer.serializeAll(stickers, options);
  }

  /** 渲染单个贴纸为 DOM 元素（唯一渲染核心，渲染前对 SVG data URI 做安全清洗）。 */
  renderSticker(sticker, options) {
    this.security.assertSafeStickerData(sticker);
    let prepared = sticker;
    if (
      typeof sticker.src === 'string' &&
      /^data:image\/svg\+xml/i.test(sticker.src)
    ) {
      if (typeof this.security.sanitizeSvgDataUrl === 'function') {
        const cleanSrc = this.security.sanitizeSvgDataUrl(sticker.src);
        if (cleanSrc) prepared = { ...sticker, src: cleanSrc };
      }
    }
    return this.renderer.renderSticker(prepared, options);
  }

  /** 旧数据兼容补齐，返回归一化后的 StickerObject[]。 */
  backfillContent(rawStickers) {
    return this.model.backfillContent(rawStickers);
  }

  /** 生成唯一 id。 */
  generateId(options) {
    return this.model.generateId(options);
  }

  /** 获取全部贴纸。 */
  getStickers() {
    return this.model.getAll();
  }

  /** 设置（替换）全部贴纸。 */
  setStickers(stickers) {
    this.model.setAll(stickers);
  }

  /** 添加贴纸。 */
  addSticker(sticker) {
    this.model.add(sticker);
  }

  /** 移除贴纸。 */
  removeSticker(id) {
    return this.model.remove(id);
  }

  /** 更新贴纸。 */
  updateSticker(id, patch) {
    return this.model.update(id, patch);
  }

  /** 释放 id 集合（生命周期清理）。 */
  releaseIds(idsOrPredicate) {
    this.model.releaseIds(idsOrPredicate);
  }
}

/**
 * 测试工厂：注入全部依赖 mock。
 * @param {{ parser?: object, model?: StickerModel, renderer?: object, security?: object, serializer?: object }} mocks
 * @returns {StickerFacade}
 */
export function createStickerFacadeWithMocks(mocks = {}) {
  return new StickerFacade(mocks);
}

export default StickerFacade;
