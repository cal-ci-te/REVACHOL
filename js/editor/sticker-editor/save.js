// ！贴纸编辑器保存层
// 从 DOM 收集贴纸最终坐标，写入 article 对象并发布保存事件。
// 只更新 article.stickers，不改 article.content：标记的构建由主编辑器经数据驱动锚点架构统一完成。
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { StickerShape } from '../sticker-shape.js';
import { AnchorManager } from '../anchor-manager.js';

export const Save = {

  // 收集贴纸数据并写回 article
  // 深拷贝后再赋值：article 会被主编辑器长期持有，直接存引用会让后续 DOM 收集改动污染已保存数据
  save(article, stickerLayer, stickerData) {
    if (!article) return;

    const collected = this.collect(stickerLayer, stickerData);

    article.stickers = JSON.parse(JSON.stringify(collected));

    EventBus.emit(EVENTS.STICKER_EDITOR_SAVED, {
      articleId: article.id,
      stickers: collected,
    });
  },

  // 从 DOM 收集贴纸位置并计算锚点
  // 覆盖层中贴纸为绝对定位，此处的坐标就是用户的最终意图，故锚点基于该坐标反推
  // 坐标来自 DOM（最新位置），align/margin 等非 DOM 属性则回取 stickerData
  collect(stickerLayer, stickerData) {
    if (!stickerLayer) return [];
    const result = [];
    const dataMap = {};
    if (stickerData) {
      stickerData.forEach(function (d) { if (d && d.decoId) dataMap[d.decoId] = d; });
    }

    // 贴纸层的父元素即 articleContainer，内容容器为其内的 .detail-body
    const articleContainer = stickerLayer.parentElement;
    const contentContainer = articleContainer ? articleContainer.querySelector('.detail-body') : null;

    const els = stickerLayer.querySelectorAll('.article-sticker-editing');
    els.forEach(function (el) {
      const decoId = el.dataset.decoId;
      const orig = dataMap[decoId] || {};
      const y = parseFloat(el.style.top) || 0;

      // 坐标系换算：贴纸的 top 相对 articleContainer，而 computeAnchorFromY 期望相对 contentContainer
      // 两者相差容器内边距（padding 24px 32px），不换算会让锚点系统性偏移
      let anchor = { type: 'end', index: -1 };
      if (contentContainer && articleContainer) {
        const aRect = articleContainer.getBoundingClientRect();
        const cRect = contentContainer.getBoundingClientRect();
        const yInContent = y + aRect.top - cRect.top;
        anchor = AnchorManager.computeAnchorFromY(yInContent, contentContainer);
        console.log('[Save.collect] decoId=' + decoId +
                    ' | y=' + y + ' | yInContent=' + yInContent.toFixed(0) +
                    ' | children=' + contentContainer.children.length +
                    ' | anchor=' + JSON.stringify(anchor));
      } else {
        // 缺容器时退回默认末尾锚点：贴纸仍会保存，只是位置信息降级
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
