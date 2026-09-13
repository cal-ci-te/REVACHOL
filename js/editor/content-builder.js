// ！贴纸标记构建
// 根据纯文本内容与贴纸数据，重建带贴纸标记注释的内容，供保存回后端。
// 与解析侧（sticker-parser / anchor-manager）互为逆操作，两者的索引计数口径必须严格一致。
import { StickerRenderer } from './sticker-renderer.js';
import { AnchorManager } from './anchor-manager.js';

export const ContentBuilder = {

  // 构建带标记的内容
  // 贴纸按锚点降序（从后往前）插入：每插入一个注释都会改变子节点位置，逆序可让已算出的前置锚点不受影响
  build: function (content, stickers) {
    if (!content) content = '';
    if (!stickers || !stickers.length) {
      return content;
    }

    const sorted = stickers.slice().sort(function (a, b) {
      return AnchorManager.compareAnchors(b.anchor, a.anchor);
    });

    // 用临时容器解析内容并按「直接子元素」计数，与 AnchorManager 的口径一致
    // 不用正则扫描块级标签：正则无法正确处理嵌套列表与既有注释，会与真实 DOM 结构产生偏差
    const container = document.createElement('div');
    container.innerHTML = content;

    for (let i = 0; i < sorted.length; i++) {
      const sticker = sorted[i];
      const anchor = sticker.anchor || { type: 'end', index: -1 };
      const markerStr = this._createMarker(sticker);
      // 转成注释节点：直接插入标记字符串会被 innerHTML 当作文本转义
      const commentNode = document.createComment(
        markerStr.replace(/^<!--\s*/, '').replace(/\s*-->$/, '')
      );
      this._insertCommentAtAnchor(container, commentNode, anchor);
    }

    return container.innerHTML;
  },

  // 创建贴纸标记字符串
  _createMarker: function (sticker) {
    const opts = {
      x: sticker.x || 50,
      y: sticker.y || 50,
      w: sticker.width || 120,
      h: sticker.height || 120,
      align: sticker.align || 'left',
      margin: sticker.margin !== undefined ? sticker.margin : 20,
    };
    // 仅非默认锚点才写入：默认末尾锚点省去该字段，可缩短标记且与旧数据语义等价
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

  // 把标记注释插入到内容 DOM 的指定锚点位置
  // 计数规则与 AnchorManager.computeAnchorFromY 完全一致：遍历直接子元素，跳过 .article-sticker 与
  // .sticker-clearfix，以剩余内容元素为索引依据；只统计元素节点（nodeType 1），文本节点不占索引
  _insertCommentAtAnchor: function (container, commentNode, anchor) {
    const type = anchor.type || 'end';
    const index = anchor.index;

    if (type === 'begin') {
      container.insertBefore(commentNode, container.firstChild);
      return;
    }

    const contentChildren = [];
    for (let i = 0; i < container.childNodes.length; i++) {
      const node = container.childNodes[i];
      if (node.nodeType !== 1) continue;
      if (node.classList && (
        node.classList.contains('article-sticker') ||
        node.classList.contains('sticker-clearfix')
      )) continue;
      contentChildren.push(node);
    }

    // end 或索引无效时一律追加到末尾：宁可落到末尾也不要因越界而丢弃贴纸
    if (type === 'end' || index === undefined || index < 0) {
      container.appendChild(commentNode);
      return;
    }

    const target = contentChildren[index];
    if (!target) {
      container.appendChild(commentNode);
      return;
    }

    // 方向默认 before：该值在解析侧未显式给出时的回退行为同样为 before
    const direction = anchor.direction || 'before';
    if (direction === 'after') {
      container.insertBefore(commentNode, target.nextSibling);
    } else if (direction === 'inside') {
      target.insertBefore(commentNode, target.firstChild);
    } else {
      container.insertBefore(commentNode, target);
    }
  },
};
