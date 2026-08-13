/**
 * 锚点管理器 — 计算、解析、定位贴纸在内容中的位置。
 *
 * 职责：
 *   1. computeAnchor(el, container) — 从 DOM 元素计算锚点信息
 *   2. locateAnchor(container, anchor) — 根据锚点信息定位 DOM 位置
 *   3. compareAnchors(a, b) — 比较两个锚点的顺序
 *   4. serialize(anchor) / deserialize(data) — 序列化/反序列化
 *
 * @module anchor-manager
 */

export const AnchorManager = {

  /**
   * 计算一个 DOM 元素在容器中的锚点信息。
   * 遍历容器的直接子节点（跳过贴纸和 clearfix 元素），
   * 找到贴纸相对于段落的位置（before/after/inside）。
   *
   * @param {HTMLElement} el - 贴纸 DOM 元素
   * @param {HTMLElement} container - 文章内容容器
   * @returns {object} anchor 对象 { type, index, paragraphId?, direction }
   */
  computeAnchor: function (el, container) {
    if (!el || !container) return { type: 'end', index: -1 };

    var children = container.children;
    if (!children || !children.length) {
      return { type: 'begin', index: 0 };
    }

    var elRect = el.getBoundingClientRect();
    var elCenterY = elRect.top + elRect.height / 2;

    // 收集非贴纸子节点的信息（跳过 .article-sticker 和 .sticker-clearfix）
    var blockIndex = 0;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];

      // 跳过贴纸和 clearfix 元素——它们不是内容段落
      if (child.classList && (
        child.classList.contains('article-sticker') ||
        child.classList.contains('sticker-clearfix')
      )) {
        continue;
      }

      // 如果贴纸在这个子节点内部
      if (child.contains(el)) {
        return {
          type: 'paragraph',
          index: blockIndex,
          paragraphId: child.id || 'p_' + blockIndex,
          direction: 'inside',
        };
      }

      // 检查贴纸是否在这个子节点之前（按垂直中心点比较）
      var childRect = child.getBoundingClientRect();
      if (elCenterY < childRect.top + childRect.height / 2) {
        return {
          type: 'paragraph',
          index: blockIndex,
          paragraphId: child.id || 'p_' + blockIndex,
          direction: 'before',
        };
      }

      blockIndex++;
    }

    // 贴纸在所有内容子节点之后
    return {
      type: 'end',
      index: blockIndex > 0 ? blockIndex - 1 : 0,
      paragraphId: null,
      direction: 'after',
    };
  },

  /**
   * 基于 y 坐标（相对于容器顶部）计算锚点信息。
   * 用于贴纸编辑器保存时，根据覆盖层中的绝对定位坐标推断贴纸所属段落。
   * 跳过 .article-sticker 和 .sticker-clearfix 元素。
   *
   * @param {number} y - 贴纸在容器坐标系中的 y 坐标（px）
   * @param {HTMLElement} container - 文章内容容器
   * @returns {object} anchor 对象 { type, index, paragraphId?, direction }
   */
  computeAnchorFromY: function (y, container) {
    if (!container) return { type: 'end', index: -1 };

    var children = container.children;
    if (!children || !children.length) {
      return { type: 'begin', index: 0 };
    }

    // 获取容器在视口中的偏移
    var containerRect = container.getBoundingClientRect();
    var absoluteY = y + containerRect.top;

    var blockIndex = 0;
    for (var i = 0; i < children.length; i++) {
      var child = children[i];

      // 跳过贴纸和 clearfix 元素
      if (child.classList && (
        child.classList.contains('article-sticker') ||
        child.classList.contains('sticker-clearfix')
      )) {
        continue;
      }

      var childRect = child.getBoundingClientRect();
      if (absoluteY < childRect.top + childRect.height / 2) {
        return {
          type: 'paragraph',
          index: blockIndex,
          paragraphId: child.id || 'p_' + blockIndex,
          direction: 'before',
        };
      }
      blockIndex++;
    }

    return {
      type: 'end',
      index: blockIndex > 0 ? blockIndex - 1 : 0,
      paragraphId: null,
      direction: 'after',
    };
  },

  /**
   * 根据锚点信息在容器中定位目标位置元素。
   * 跳过 .article-sticker 和 .sticker-clearfix 元素进行索引匹配。
   *
   * @param {HTMLElement} container - 文章内容容器
   * @param {object} anchor - 锚点信息
   * @returns {HTMLElement|null} 目标位置元素
   */
  locateAnchor: function (container, anchor) {
    if (!container || !anchor) return null;

    var children = container.children;
    var contentChildren = [];
    for (var i = 0; i < children.length; i++) {
      var child = children[i];
      if (child.classList && (
        child.classList.contains('article-sticker') ||
        child.classList.contains('sticker-clearfix')
      )) {
        continue;
      }
      contentChildren.push(child);
    }

    switch (anchor.type) {
      case 'begin':
        return contentChildren[0] || container;

      case 'end':
        return contentChildren[contentChildren.length - 1] || container;

      case 'paragraph':
        var target = null;
        // 优先使用 paragraphId
        if (anchor.paragraphId) {
          target = container.querySelector('#' + anchor.paragraphId);
        }
        // 回退到 index
        if (!target && anchor.index !== undefined && anchor.index >= 0 && anchor.index < contentChildren.length) {
          target = contentChildren[anchor.index];
        }
        return target;

      default:
        return null;
    }
  },

  /**
   * 比较两个锚点的顺序。
   * @param {object} a - 锚点 A
   * @param {object} b - 锚点 B
   * @returns {number} -1: a < b, 0: 相等, 1: a > b
   */
  compareAnchors: function (a, b) {
    var getOrder = function (anchor) {
      if (!anchor || anchor.type === 'begin') return -999;
      if (anchor.type === 'end') return 999;
      return anchor.index || 0;
    };
    return getOrder(a) - getOrder(b);
  },

  /**
   * 序列化锚点对象为 URL 安全的压缩字符串（存储用）。
   * 格式：type:index[:paraId:dir]，如 "p:2:p_2:before" 或 "end:-1"
   */
  serialize: function (anchor) {
    if (!anchor) return '';
    var parts = [
      (anchor.type || 'end').charAt(0),
      anchor.index !== undefined ? anchor.index : -1,
    ];
    if (anchor.paragraphId) parts.push(anchor.paragraphId);
    if (anchor.direction) parts.push(anchor.direction);
    return parts.join(':');
  },

  /**
   * 反序列化锚点字符串。
   * 支持新旧两种格式：旧 JSON 格式（向后兼容）和新冒号分隔格式。
   */
  deserialize: function (data) {
    if (!data) return { type: 'end', index: -1 };
    // 尝试解析旧 JSON 格式
    if (data.charAt(0) === '{') {
      try {
        var parsed = JSON.parse(data);
        return {
          type: parsed.type || 'end',
          index: parsed.index !== undefined ? parsed.index : -1,
          paragraphId: parsed.paragraphId || null,
          direction: parsed.direction || null,
        };
      } catch (e) { /* 回退 */ }
    }
    // 新格式：type:index[:paraId:dir]
    var parts = data.split(':');
    var typeMap = { p: 'paragraph', h: 'heading', b: 'begin', e: 'end' };
    return {
      type: typeMap[parts[0]] || 'end',
      index: parts[1] !== undefined ? parseInt(parts[1]) : -1,
      paragraphId: parts[2] || null,
      direction: parts[3] || null,
    };
  },

  /**
   * 从标记注释内容中解析字段（含 anchor 字段）。
   * 两步法：先提取 decoId，再按 key=value 解析剩余字段，字段顺序无关。
   *
   * @param {string} raw - 注释内部文本，如 "deco_abc align=left w=120 h=120 anchor=p:2:p_2:before"
   * @returns {object} { decoId, ...fields, anchor }
   */
  parseFromMarker: function (raw) {
    var parts = raw.trim().split(/\s+/);
    var result = { anchor: { type: 'end', index: -1 } };
    if (parts.length > 0) result.decoId = parts[0];

    for (var i = 1; i < parts.length; i++) {
      var eqIndex = parts[i].indexOf('=');
      if (eqIndex === -1) continue;
      var key = parts[i].substring(0, eqIndex);
      var value = parts[i].substring(eqIndex + 1);
      if (key === 'anchor') {
        result.anchor = this.deserialize(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  },

  /**
   * 生成锚点的标记字段字符串。默认锚点（type=end, index=-1）不写入。
   * @returns {string} 如 "anchor=p:2:p_2:before" 或 ""
   */
  toMarkerField: function (anchor) {
    if (!anchor) return '';
    // 默认锚点：末尾，无特殊位置信息 → 不需要写入标记
    if (anchor.type === 'end' && (anchor.index === -1 || anchor.index === undefined)) {
      return '';
    }
    return 'anchor=' + this.serialize(anchor);
  },

  /**
   * 判断锚点是否为默认值（末尾、无位置信息）。
   * 用于决定是否需要在标记中写入 anchor 字段。
   */
  isDefaultAnchor: function (anchor) {
    return !anchor || anchor.type === 'end';
  },
};
