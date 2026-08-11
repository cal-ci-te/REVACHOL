/**
 * 贴纸编辑器保存层 — 收集 DOM 坐标 → 写入 article 对象 → 发布事件。
 *
 * @module sticker-editor/save
 */

import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { StickerRenderer } from '../sticker-renderer.js';
import { StickerShape } from '../sticker-shape.js';

export const Save = {

  /**
   * 收集贴纸数据并写入 article 对象。
   * @param {object} article - 文章对象（会被修改）
   * @param {HTMLElement} stickerLayer
   * @param {Array} stickerData - 当前贴纸数据（含 align/margin 等非 DOM 属性）
   */
  save(article, stickerLayer, stickerData) {
    if (!article) return;

    // 从 DOM 收集最终位置写入 stickerData
    var collected = this.collect(stickerLayer, stickerData);

    article.stickers = JSON.parse(JSON.stringify(collected));

    // 将贴纸标记写入文章内容
    var content = article.content || '';
    content = StickerRenderer.stripStickerDivs(content);
    content = StickerRenderer.stripMarkers(content);
    collected.forEach(function (s) {
      content += '\n' + StickerRenderer.createMarker(s.decoId, s);
    });
    article.content = content.trim();

    EventBus.emit(EVENTS.STICKER_EDITOR_SAVED, {
      articleId: article.id,
      stickers: collected,
    });
  },

  /**
   * 从 DOM 中收集当前贴纸位置。
   * @param {HTMLElement} stickerLayer
   * @param {Array} stickerData - 用于恢复 align/margin/shape/vertices 等非 DOM 属性
   * @returns {Array}
   */
  collect(stickerLayer, stickerData) {
    if (!stickerLayer) return [];
    var result = [];
    var dataMap = {};
    if (stickerData) {
      stickerData.forEach(function (d) { if (d && d.decoId) dataMap[d.decoId] = d; });
    }
    var els = stickerLayer.querySelectorAll('.article-sticker-editing');
    els.forEach(function (el) {
      var decoId = el.dataset.decoId;
      var orig = dataMap[decoId] || {};
      result.push({
        decoId: decoId,
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
        width: parseFloat(el.style.width) || StickerShape.DEFAULT_SIZE,
        height: parseFloat(el.style.height) || StickerShape.DEFAULT_SIZE,
        align: orig.align || 'left',
        margin: orig.margin || StickerShape.DEFAULT_MARGIN,
      });
    });
    return result;
  },
};
