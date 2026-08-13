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
    var sorted = stickers.slice().sort(function (a, b) {
      return AnchorManager.compareAnchors(b.anchor, a.anchor);
    });

    var result = content;

    for (var i = 0; i < sorted.length; i++) {
      var sticker = sorted[i];
      var anchor = sticker.anchor || { type: 'end', index: -1 };
      var marker = this._createMarker(sticker);

      // 根据锚点类型决定插入位置
      if (anchor.type === 'begin') {
        result = marker + '\n' + result;
      } else if (anchor.type === 'end' || anchor.index < 0) {
        result = result + '\n' + marker;
      } else {
        // 在指定段落位置插入
        result = this._insertAtBlockElement(result, marker, anchor);
      }
    }

    return result.trim();
  },

  /**
   * 创建贴纸标记字符串。
   */
  _createMarker: function (sticker) {
    var opts = {
      x: sticker.x || 50,
      y: sticker.y || 50,
      w: sticker.width || 120,
      h: sticker.height || 120,
      align: sticker.align || 'left',
      margin: sticker.margin !== undefined ? sticker.margin : 20,
    };
    // 如果有有效的锚点信息（非默认末尾），添加到标记中
    var hasValidAnchor = sticker.anchor && !AnchorManager.isDefaultAnchor(sticker.anchor);
    if (hasValidAnchor) {
      opts.anchor = sticker.anchor;
    }
    console.log('[ContentBuilder._createMarker] decoId=' + sticker.decoId +
                ' | hasAnchor=' + !!sticker.anchor +
                ' | isDefault=' + (sticker.anchor ? AnchorManager.isDefaultAnchor(sticker.anchor) : 'N/A') +
                ' | willWrite=' + hasValidAnchor +
                ' | anchor=' + JSON.stringify(sticker.anchor) +
                ' | opts.anchor=' + JSON.stringify(opts.anchor));
    var marker = StickerRenderer.createMarker(sticker.decoId, opts);
    console.log('[ContentBuilder._createMarker] 结果: ' + marker);
    return marker;
  },

  /**
   * 在内容字符串中，于第 anchor.index 个块级元素附近插入标记。
   * 支持 <p>、<h1>-<h6>、<blockquote>、<ul>、<ol>、<pre>、<div> 等块级元素。
   * 按锚点 direction 决定插入位置：
   *   'before' → 在目标元素之前
   *   'after'  → 在目标元素之后
   *   'inside' → 在目标元素的开始标签之后
   *
   * @param {string} content - HTML 内容
   * @param {string} marker - 贴纸标记字符串
   * @param {object} anchor - 锚点 { index, direction }
   * @returns {string}
   */
  _insertAtBlockElement: function (content, marker, anchor) {
    var targetIndex = anchor.index || 0;
    var direction = anchor.direction || 'before';

    // 匹配块级元素开始标签（含自闭合属性的完整开始标签）
    var blockTagRe = /<(p|h[1-6]|blockquote|ul|ol|pre|div|table|section|article|li|dd|dt|figcaption|figure|header|footer|main|nav|aside)(\s[^>]*)?>/gi;

    // 如果目标索引为 0 且方向为 before，直接在开头插入
    if (targetIndex === 0 && direction === 'before') {
      return marker + '\n' + content;
    }

    // 扫描所有块级元素，找到第 targetIndex 个
    var count = 0;
    var lastIndex = 0;
    var match;
    var re = new RegExp(blockTagRe.source, 'gi');

    while ((match = re.exec(content)) !== null) {
      if (count === targetIndex) {
        // 找到了目标元素
        if (direction === 'before') {
          // 在目标元素之前插入
          return content.substring(0, match.index) + marker + '\n' + content.substring(match.index);
        } else if (direction === 'inside') {
          // 在目标元素的开始标签之后插入
          var tagEnd = match.index + match[0].length;
          return content.substring(0, tagEnd) + marker + content.substring(tagEnd);
        } else {
          // 'after' — 需要找到该元素的结束标签之后再插入
          // 简化处理：在下一个块级元素之前插入，或在末尾
          var afterPos = this._findBlockEnd(content, match.index, match[1]);
          return content.substring(0, afterPos) + '\n' + marker + '\n' + content.substring(afterPos);
        }
      }
      count++;
      lastIndex = match.index;
    }

    // 未找到足够多的块级元素 → 追加到末尾
    return content + '\n' + marker;
  },

  /**
   * 找到块级元素的结束位置。
   * 使用简单的标签计数法找到匹配的闭合标签。
   *
   * @param {string} html - HTML 内容
   * @param {number} startIndex - 开始标签的位置
   * @param {string} tagName - 标签名
   * @returns {number} 结束位置（闭合标签之后）
   */
  _findBlockEnd: function (html, startIndex, tagName) {
    // 找到开始标签结束位置
    var tagStart = html.indexOf('>', startIndex);
    if (tagStart === -1) return startIndex;
    tagStart++; // 跳过 >

    // 检查是否为自闭合标签
    var tagContent = html.substring(startIndex, tagStart);
    if (/\/\s*>$/.test(tagContent)) {
      return tagStart;
    }

    // 使用简单的栈计数匹配闭合标签
    var openRe = new RegExp('<' + tagName + '(\\s[^>]*)?>', 'gi');
    var closeRe = new RegExp('<\\/' + tagName + '\\s*>', 'gi');
    var depth = 1;
    var pos = tagStart;

    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;

    while (depth > 0) {
      var nextOpen = openRe.exec(html);
      var nextClose = closeRe.exec(html);

      var openPos = nextOpen ? nextOpen.index : Infinity;
      var closePos = nextClose ? nextClose.index : Infinity;

      if (closePos === Infinity) {
        // 无匹配闭合标签 → 返回末尾
        return html.length;
      }

      if (closePos < openPos) {
        depth--;
        pos = closePos + nextClose[0].length;
        openRe.lastIndex = pos;
        closeRe.lastIndex = pos;
      } else {
        depth++;
        pos = openPos + nextOpen[0].length;
        openRe.lastIndex = pos;
        closeRe.lastIndex = pos;
      }
    }

    return pos;
  },
};
