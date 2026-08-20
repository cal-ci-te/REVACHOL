/**
 * 内容构建器 — 根据数据模型构建带标记的内容。
 *
 * 职责：
 *   1. build(content, stickers) — 根据纯内容和贴纸数据构建带标记注释的内容
 *   2. 按锚点排序，从后往前插入标记，避免位置偏移
 *
 * @module content-builder
 */

import { StickerRenderer } from './sticker-renderer.js';
import { AnchorManager } from './anchor-manager.js';

export const ContentBuilder = {

  /**
   * 根据文章纯内容和贴纸数据，构建带标记的内容。
   * 贴纸按锚点排序后从后往前插入，保证前面的插入不会影响后续锚点位置。
   *
   * @param {string} content - 纯内容（不含贴纸标记、不含贴纸 div）
   * @param {Array} stickers - 贴纸数据数组（含 anchor 信息）
   * @returns {string} 带贴纸标记的内容
   */
  build: function (content, stickers) {
    if (!content) content = '';
    if (!stickers || !stickers.length) {
      return content;
    }

    // 按锚点降序排序（从后往前插入，避免位置偏移）
    const sorted = stickers.slice().sort(function (a, b) {
      return AnchorManager.compareAnchors(b.anchor, a.anchor);
    });

    // 用临时容器把内容解析为 DOM，按「直接子元素」计数（与 AnchorManager.computeAnchorFromY
    // 的计数逻辑一致），避免用正则扫描块级标签时与真实 DOM 结构（嵌套列表、注释等）产生偏差。
    const container = document.createElement('div');
    container.innerHTML = content;

    for (let i = 0; i < sorted.length; i++) {
      const sticker = sorted[i];
      const anchor = sticker.anchor || { type: 'end', index: -1 };
      const markerStr = this._createMarker(sticker);
      const commentNode = document.createComment(
        markerStr.replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
      );
      this._insertCommentAtAnchor(container, commentNode, anchor);
    }

    return container.innerHTML;
  },

  /**
   * 创建贴纸标记字符串。
   */
  _createMarker: function (sticker) {
    const opts = {
      x: sticker.x || 50,
      y: sticker.y || 50,
      w: sticker.width || 120,
      h: sticker.height || 120,
      align: sticker.align || 'left',
      margin: sticker.margin !== undefined ? sticker.margin : 20,
    };
    // 如果有有效的锚点信息（非默认末尾），添加到标记中
    const hasValidAnchor = sticker.anchor && !AnchorManager.isDefaultAnchor(sticker.anchor);
    if (hasValidAnchor) {
      opts.anchor = sticker.anchor;
    }
    console.log('[ContentBuilder._createMarker] decoId=' + sticker.decoId +
                ' | hasAnchor=' + !!sticker.anchor +
                ' | isDefault=' + (sticker.anchor ? AnchorManager.isDefaultAnchor(sticker.anchor) : 'N/A') +
                ' | willWrite=' + hasValidAnchor +
                ' | anchor=' + JSON.stringify(sticker.anchor) +
                ' | opts.anchor=' + JSON.stringify(opts.anchor));
    const marker = StickerRenderer.createMarker(sticker.decoId, opts);
    console.log('[ContentBuilder._createMarker] 结果: ' + marker);
    return marker;
  },

  /**
   * 将贴纸标记注释插入到内容 DOM 的指定锚点位置。
   *
   * 计数逻辑与 AnchorManager.computeAnchorFromY 完全一致：遍历容器的直接子元素，
   * 跳过 .article-sticker 与 .sticker-clearfix，用剩下的内容元素作为索引依据。
   * 相比旧的正则扫描块级标签，此方法能正确处理嵌套列表、注释等结构。
   *
   * @param {HTMLElement} container - 内容容器（临时 DOM）
   * @param {Comment} commentNode - 贴纸标记注释节点
   * @param {object} anchor - 锚点 { type, index, direction }
   */
  _insertCommentAtAnchor: function (container, commentNode, anchor) {
    const type = anchor.type || 'end';
    const index = anchor.index;

    // begin：插入到容器最前面
    if (type === 'begin') {
      container.insertBefore(commentNode, container.firstChild);
      return;
    }

    // 收集直接子「内容」元素（跳过贴纸/clearfix），与 computeAnchorFromY 计数一致
    const contentChildren = [];
    for (let i = 0; i < container.childNodes.length; i++) {
      const node = container.childNodes[i];
      if (node.nodeType !== 1) continue; // 仅元素节点
      if (node.classList && (
        node.classList.contains('article-sticker') ||
        node.classList.contains('sticker-clearfix')
      )) continue;
      contentChildren.push(node);
    }

    // end 或无效 index：追加到末尾
    if (type === 'end' || index === undefined || index < 0) {
      container.appendChild(commentNode);
      return;
    }

    const target = contentChildren[index];
    if (!target) {
      container.appendChild(commentNode);
      return;
    }

    const direction = anchor.direction || 'before';
    if (direction === 'after') {
      container.insertBefore(commentNode, target.nextSibling);
    } else if (direction === 'inside') {
      target.insertBefore(commentNode, target.firstChild);
    } else {
      // before（默认）
      container.insertBefore(commentNode, target);
    }
  },
};
