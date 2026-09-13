// ！贴纸锚点管理
// 计算、解析与定位贴纸在文章内容中的位置，是「贴纸跟随段落」能力的基础。
// 锚点以「第几个内容块 + 相对方向」描述，而非像素坐标：像素坐标在换字号、改窗口宽度后即失效。

export const AnchorManager = {

  // 从 DOM 元素计算锚点
  // 遍历容器的直接子节点（跳过贴纸与 clearfix），按垂直中心点判断贴纸落在哪个内容块之前
  // 优先判定「位于块内部」：贴纸嵌套在段落里时，比按中心线比较更可靠
  computeAnchor: function (el, container) {
    if (!el || !container) return { type: 'end', index: -1 };

    const children = container.children;
    if (!children || !children.length) {
      return { type: 'begin', index: 0 };
    }

    const elRect = el.getBoundingClientRect();
    const elCenterY = elRect.top + elRect.height / 2;

    let blockIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      // 跳过贴纸与 clearfix：它们不是内容段落，计入索引会让锚点错位
      if (child.classList && (
        child.classList.contains('article-sticker') ||
        child.classList.contains('sticker-clearfix')
      )) {
        continue;
      }

      if (child.contains(el)) {
        return {
          type: 'paragraph',
          index: blockIndex,
          paragraphId: child.id || 'p_' + blockIndex,
          direction: 'inside',
        };
      }

      // 按垂直中心点比较：用中心而非顶边，可避免贴纸跨在两段之间时判到错误一侧
      const childRect = child.getBoundingClientRect();
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

  // 按 y 坐标计算锚点
  // 供贴纸编辑器保存时使用：覆盖层中贴纸是绝对定位，只有坐标没有 DOM 归属
  // 需先把容器相对坐标换算为视口绝对坐标，才能与 getBoundingClientRect 比较
  computeAnchorFromY: function (y, container) {
    if (!container) return { type: 'end', index: -1 };

    const children = container.children;
    if (!children || !children.length) {
      return { type: 'begin', index: 0 };
    }

    const containerRect = container.getBoundingClientRect();
    const absoluteY = y + containerRect.top;

    let blockIndex = 0;
    for (let i = 0; i < children.length; i++) {
      const child = children[i];

      if (child.classList && (
        child.classList.contains('article-sticker') ||
        child.classList.contains('sticker-clearfix')
      )) {
        continue;
      }

      const childRect = child.getBoundingClientRect();
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

  // 按锚点定位目标元素
  // 与 computeAnchor 用同一套「跳过贴纸与 clearfix」的过滤规则，两侧索引口径必须一致
  locateAnchor: function (container, anchor) {
    if (!container || !anchor) return null;

    const children = container.children;
    const contentChildren = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
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
        // 优先按 paragraphId 定位：id 比索引稳定，中间插入段落不会使其失效
        if (anchor.paragraphId) {
          target = container.querySelector('#' + anchor.paragraphId);
        }
        // 回退到 index：旧数据或段落 id 被改时仍有定位机会
        if (!target && anchor.index !== undefined && anchor.index >= 0 && anchor.index < contentChildren.length) {
          target = contentChildren[anchor.index];
        }
        return target;

      default:
        return null;
    }
  },

  // 比较两个锚点的先后
  // begin/end 用 ±999 的哨兵值：只需保证它们排在任何段落索引之外，具体数值无意义
  compareAnchors: function (a, b) {
    const getOrder = function (anchor) {
      if (!anchor || anchor.type === 'begin') return -999;
      if (anchor.type === 'end') return 999;
      return anchor.index || 0;
    };
    return getOrder(a) - getOrder(b);
  },

  // 序列化为紧凑字符串
  // 类型只取首字母（p/h/b/e）以缩短标记长度；格式为 type:index[:paraId:dir]
  serialize: function (anchor) {
    if (!anchor) return '';
    const parts = [
      (anchor.type || 'end').charAt(0),
      anchor.index !== undefined ? anchor.index : -1,
    ];
    if (anchor.paragraphId) parts.push(anchor.paragraphId);
    if (anchor.direction) parts.push(anchor.direction);
    return parts.join(':');
  },

  // 反序列化锚点字符串
  // 兼容旧 JSON 格式：历史数据以 { 开头，直接按 JSON 解析，失败才回退冒号格式
  deserialize: function (data) {
    if (!data) return { type: 'end', index: -1 };
    if (data.charAt(0) === '{') {
      try {
        const parsed = JSON.parse(data);
        return {
          type: parsed.type || 'end',
          index: parsed.index !== undefined ? parsed.index : -1,
          paragraphId: parsed.paragraphId || null,
          direction: parsed.direction || null,
        };
      } catch (e) {
        // JSON 损坏，回退下方冒号格式解析
      }
    }
    const parts = data.split(':');
    const typeMap = { p: 'paragraph', h: 'heading', b: 'begin', e: 'end' };
    return {
      type: typeMap[parts[0]] || 'end',
      index: parts[1] !== undefined ? parseInt(parts[1]) : -1,
      paragraphId: parts[2] || null,
      direction: parts[3] || null,
    };
  },

  // 从标记注释文本中解析字段（含 anchor）
  // 首 token 为 decoId，其余按 key=value 解析，不依赖字段顺序
  parseFromMarker: function (raw) {
    const parts = raw.trim().split(/\s+/);
    // 预置默认锚点：标记中缺 anchor 字段时直接使用，省去调用方判空
    const result = { anchor: { type: 'end', index: -1 } };
    if (parts.length > 0) result.decoId = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const eqIndex = parts[i].indexOf('=');
      if (eqIndex === -1) continue;
      const key = parts[i].substring(0, eqIndex);
      const value = parts[i].substring(eqIndex + 1);
      if (key === 'anchor') {
        result.anchor = this.deserialize(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  },

  // 生成锚点的标记字段，默认锚点（末尾）不写入
  // 省去默认值可缩短标记，且旧数据无 anchor 字段时语义等价
  toMarkerField: function (anchor) {
    if (!anchor) return '';
    if (anchor.type === 'end' && (anchor.index === -1 || anchor.index === undefined)) {
      return '';
    }
    return 'anchor=' + this.serialize(anchor);
  },

  // 判断是否为默认锚点（末尾、无位置信息）
  isDefaultAnchor: function (anchor) {
    return !anchor || anchor.type === 'end';
  },
};
