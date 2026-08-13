/**
 * 贴纸编辑器保存层 — 收集 DOM 坐标 → 写入 article 对象 → 发布事件。
 *
 * @module sticker-editor/save
 */

import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { StickerShape } from '../sticker-shape.js';
import { AnchorManager } from '../anchor-manager.js';

export const Save = {

  /**
   * 收集贴纸数据并写入 article 对象。
   * 仅更新 article.stickers，不修改 article.content。
   * content 的标记构建由主编辑器的 _buildSaveContent() 通过数据驱动锚点架构统一处理。
   *
   * @param {object} article - 文章对象（会被修改 stickers 字段）
   * @param {HTMLElement} stickerLayer
   * @param {Array} stickerData - 当前贴纸数据（含 align/margin 等非 DOM 属性）
   */
  save(article, stickerLayer, stickerData) {
    if (!article) return;

    // 从 DOM 收集最终位置写入 stickerData
    var collected = this.collect(stickerLayer, stickerData);

    article.stickers = JSON.parse(JSON.stringify(collected));

    EventBus.emit(EVENTS.STICKER_EDITOR_SAVED, {
      articleId: article.id,
      stickers: collected,
    });
  },

  /**
   * 从 DOM 中收集当前贴纸位置，并在覆盖层 DOM 中计算锚点。
   * 覆盖层中贴纸使用绝对定位处于正确视觉位置，锚点基于此计算。
   *
   * @param {HTMLElement} stickerLayer - 贴纸层（绝对定位容器）
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

    // 贴纸层的父元素是 articleContainer，其中包含内容容器（.detail-body）
    var articleContainer = stickerLayer.parentElement;
    var contentContainer = articleContainer ? articleContainer.querySelector('.detail-body') : null;

    var els = stickerLayer.querySelectorAll('.article-sticker-editing');
    els.forEach(function (el) {
      var decoId = el.dataset.decoId;
      var orig = dataMap[decoId] || {};
      var y = parseFloat(el.style.top) || 0;

      // 校正 y 坐标：贴纸的 top 相对于 articleContainer（stickerLayer 的 parent），
      // 但 computeAnchorFromY 期望 y 相对于 contentContainer。
      // 将 y 从 articleContainer 坐标系转换到 contentContainer 坐标系。
      var anchor = { type: 'end', index: -1 };
      if (contentContainer && articleContainer) {
        var aRect = articleContainer.getBoundingClientRect();
        var cRect = contentContainer.getBoundingClientRect();
        var yInContent = y + aRect.top - cRect.top;
        anchor = AnchorManager.computeAnchorFromY(yInContent, contentContainer);
        console.log('[Save.collect] decoId=' + decoId +
                    ' | y=' + y + ' | yInContent=' + yInContent.toFixed(0) +
                    ' | children=' + contentContainer.children.length +
                    ' | anchor=' + JSON.stringify(anchor));
      } else {
        console.warn('[Save.collect] contentContainer=' + !!contentContainer +
                     ' articleContainer=' + !!articleContainer +
                     ' → 使用默认锚点');
      }

      result.push({
        decoId: decoId,
        x: parseFloat(el.style.left) || 0,
        y: y,
        width: parseFloat(el.style.width) || StickerShape.DEFAULT_SIZE,
        height: parseFloat(el.style.height) || StickerShape.DEFAULT_SIZE,
        align: orig.align || 'left',
        margin: orig.margin || StickerShape.DEFAULT_MARGIN,
        anchor: anchor,
      });
    });
    return result;
  },
};
