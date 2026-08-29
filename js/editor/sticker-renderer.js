/**
 * 文章贴纸渲染器 — 在文章阅读/编辑视图中渲染贴纸。
 *
 * 职责：
 *   1. 将文章正文中的贴纸占位标记替换为实际的贴纸 DOM 元素
 *   2. 在编辑模式的覆盖层中渲染贴纸
 *   3. 清理和管理贴纸 DOM
 *
 * 贴纸在文章中的占位标记格式：<!-- sticker:{id} x={x} y={y} w={width} h={height} align={align} -->
 * 渲染后替换为 <div class="article-sticker" data-deco-id="decoId"> ... </div>
 *
 * 依赖：StickerShape（形状生成）、DecoShelf（贴纸数据）、DecoEdit（交互）
 */

import { StickerShape } from './sticker-shape.js';
import { DecoShelf } from '../services/deco.js';
import { AnchorManager } from './anchor-manager.js';
import { StickerFacade } from '../business/sticker/index.js';

/** 统一贴纸门面（单一解析/序列化/渲染核心，M4 收敛）。 */
const _stickerFacade = new StickerFacade();

/**
 * 从 DOM 注释 nodeValue 中剥离 "sticker:" 前缀。
 * 不使用正则，避免与 no-inline-sticker-regexp 规则冲突。
 * @param {string|undefined} text
 * @returns {string}
 */
function stripStickerPrefix(text) {
  let raw = (text || '').trim();
  if (raw.startsWith('sticker:')) {
    raw = raw.slice('sticker:'.length).trim();
  }
  return raw;
}

export const StickerRenderer = {

  /** 统一贴纸门面。 */
  _facade: _stickerFacade,

  /**
   * 贴纸占位标记正则（统一数据源，复用 facade.markerRegex）。
   * 匹配任意 <!-- sticker:{content} --> 注释块，不依赖字段顺序。
   * 捕获组 1 = 注释内容（不含 <!-- sticker: 和 -->）。
   */
  _MARKER_REGEX: _stickerFacade.markerRegex,

  /**
   * 从内容中剥离所有贴纸标记及其周围的空白行。
   * 标记以 HTML 注释形式嵌入：\n<!-- sticker:xxx -->\n
   * 单纯剥离标记会留下 \n 残留导致卡片/详情页末尾出现空行占位，
   * 此函数同时清理标记前后的空白。
   *
   * @param {string} content - 文章内容
   * @returns {string} 剥离标记并清理空白后的内容
   */
  stripMarkers: function (content) {
    if (!content) return '';
    // 移除标记连同其前面的换行符（标记总是以 \n + <!-- 形式写入，复用 facade.markerRegex 单一源）
    const source = this._facade.markerRegex.source;
    const stripRegex = new RegExp('\\n?' + source, 'g');
    let cleaned = content.replace(stripRegex, '');
    // 压缩 3 个以上连续换行为双换行（最多保留一个段落间距）
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  },

  /**
   * 从内容中剥离已渲染的贴纸 div（.article-sticker 和 .sticker-clearfix）。
   * 这些 div 是 EditorStickers.render() 在 contentEditable 中替换注释节点后产生的，
   * 保存时应仅保留纯标记注释，不保留渲染后的 DOM。
   *
   * @param {string} content - HTML 内容
   * @returns {string} 剥离贴纸 div 后的内容
   */
  stripStickerDivs: function (content) {
    if (!content) return '';
    // 用 DOM 解析精确移除贴纸 div，避免正则匹配嵌套标签导致截断（P1-4）
    if (typeof DOMParser === 'undefined') return content;
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const targets = doc.querySelectorAll('.article-sticker, .sticker-clearfix');
    targets.forEach((el) => el.remove());
    return doc.body.innerHTML;
  },

  /**
   * 从标记注释内容中解析字段（字段顺序无关，兼容新旧格式，含 anchor 字段）。
   * 基础字段委托给 sticker-parser 统一解析；anchor 继续由 AnchorManager 解析为对象。
   * @param {string} raw - 注释内部文本，如 "deco_abc align=left w=120 h=120 anchor=p:2:p_2:before"
   * @returns {object} { decoId, x, y, w, h, align, margin, pos, anchor }
   */
  _parseMarkerContent: function (raw) {
    const f = this._facade.parseMarkerFields(raw);
    const n = this._facade.normalizeMarkerFields(f);
    const parsed = AnchorManager.parseFromMarker(raw);
    return {
      decoId: n.id,
      x: Number.isFinite(n.x) ? n.x : StickerShape.DEFAULT_X,
      y: Number.isFinite(n.y) ? n.y : StickerShape.DEFAULT_Y,
      w: n.width,
      h: n.height,
      width: n.width,
      height: n.height,
      align: n.align,
      margin: n.margin,
      pos: f.pos !== undefined ? parseInt(f.pos, 10) : -1,
      anchor: parsed.anchor || { type: 'end', index: -1 },
    };
  },

  /** 已创建的贴纸元素集合（用于清理） */
  _elements: [],

  /**
   * 解析文章内容中的贴纸标记，返回 { cleanContent, stickers }。
   * 贴纸标记会被移除（由渲染阶段替换为 DOM 元素）。
   *
   * @param {string} content - 文章 Markdown/HTML 内容
   * @returns {{ cleanContent: string, stickers: Array<{decoId:string, align:string, w:number, h:number}> }}
   */
  parseMarkers(content) {
    const stickers = [];
    const regex = this._MARKER_REGEX;
    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(content)) !== null) {
      const fields = this._parseMarkerContent(match[1]);
      stickers.push({
        decoId: fields.decoId,
        x: fields.x ? parseInt(fields.x) : StickerShape.DEFAULT_X,
        y: fields.y ? parseInt(fields.y) : StickerShape.DEFAULT_Y + stickers.length * StickerShape.DEFAULT_GAP,
        w: parseInt(fields.w) || StickerShape.DEFAULT_SIZE,
        h: parseInt(fields.h) || StickerShape.DEFAULT_SIZE,
        width: parseInt(fields.w) || StickerShape.DEFAULT_SIZE,
        height: parseInt(fields.h) || StickerShape.DEFAULT_SIZE,
        align: fields.align || 'left',
        margin: fields.margin !== undefined ? parseInt(fields.margin) : StickerShape.DEFAULT_MARGIN,
        pos: fields.pos !== undefined ? parseInt(fields.pos) : -1,
        index: match.index,
        // 锚点信息：向后兼容旧标记（无 anchor 字段时默认末尾）
        anchor: fields.anchor || { type: 'end', index: -1 },
      });
    }

    // 移除所有标记（复用 stripMarkers 清理空白）
    regex.lastIndex = 0;
    const cleanContent = this.stripMarkers(content);

    return { cleanContent: cleanContent, stickers: stickers };
  },

  /**
   * 生成贴纸占位标记字符串（插入文章内容中）。
   * 支持 anchor 字段（数据驱动位置架构），默认锚点不写入标记。
   *
   * @param {string} decoId - 贴纸 ID
   * @param {object} opts - { align, w, h, x?, y?, margin?, pos?, anchor? }
   * @returns {string} 如 "<!-- sticker:deco_abc x=50 y=50 w=120 h=120 align=left anchor=p:2:p_2:before -->"
   */
  createMarker(decoId, opts) {
    opts = opts || {};

    // 数据驱动锚点：仅非默认锚点写入标记字段
    const anchorReceived = !!opts.anchor;
    const isDefault = opts.anchor ? AnchorManager.isDefaultAnchor(opts.anchor) : true;
    const willWrite = anchorReceived && !isDefault;

    // 基础标记委托给 facade.serializeOne（M4 单一序列化）
    let marker = this._facade.serializeOne({
      id: decoId,
      x: opts.x,
      y: opts.y,
      width: opts.w || opts.width,
      height: opts.h || opts.height,
      align: opts.align,
      margin: opts.margin,
      anchor: willWrite ? AnchorManager.serialize(opts.anchor) : undefined,
    });

    // 保留 pos 字段向后兼容（旧格式使用字符偏移量）
    if (opts.pos !== undefined && opts.pos !== 'end') {
      marker = marker.replace(/ -->$/, ' pos=' + opts.pos + ' -->');
    }
    return marker;
  },

  /**
   * 在文章容器中根据贴纸数据渲染贴纸。贴纸以浮动元素插入到文章内容中，
   * 使用 shape-outside 实现文字绕排。
   *
   * 使用 TreeWalker 遍历 DOM 注释节点，找到贴纸标记（<!-- sticker:xxx -->），
   * 在标记原始位置替换为贴纸浮动元素，而非全部插入到容器开头。
   *
   * @param {HTMLElement} container - 文章内容容器（已渲染内容含标记注释）
   * @param {Array<object>} stickers - 贴纸数据列表 [{ decoId, align, w, h, ... }]
   * @param {{ containerWidth?: number }} [options] - 可选：显式容器宽度（缺省时读取 container.clientWidth）
   */
  renderInArticle(container, stickers, options = {}) {
    if (!container || !stickers || !stickers.length) {
      console.warn('[StickerRenderer.renderInArticle] 跳过：container=' + !!container + ' stickers=' + (stickers ? stickers.length : 0));
      return;
    }
    console.log('[StickerRenderer.renderInArticle] 开始：stickers.length=' + stickers.length);
    this.clearElements();

    // 容器设为 position:relative，使贴纸 absolute 定位相对容器（方案：阅读页 absolute 定位）
    container.style.position = 'relative';

    // 读取真实容器宽度，避免 containerWidth=0 导致 clamp 失效（排查文档 L5）
    const rect = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null;
    const containerWidth =
      options.containerWidth || container.clientWidth || (rect && rect.width) || 0;

    // 构建 decoId → sticker 快速查找表
    const stickerMap = {};
    const facade = this._facade;
    stickers.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    // TreeWalker 遍历所有注释节点，收集贴纸标记
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_COMMENT,
      {
        acceptNode: function (c) {
          if (c.nodeValue && c.nodeValue.trim().startsWith('sticker:')) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_REJECT;
        },
      }
    );

    // 先收集再替换（遍历中修改 DOM 会破坏迭代器）
    const comments = [];
    let node;
    while ((node = walker.nextNode())) {
      comments.push(node);
    }
    console.log('[StickerRenderer.renderInArticle] TreeWalker 找到 ' + comments.length + ' 个注释节点 | stickerMap keys=' + Object.keys(stickerMap).join(','));
    console.log('[StickerRenderer.renderInArticle] 注释节点 DOM 顺序: ' + comments.map(function (c) {
      const f = facade.parseMarkerFields(stripStickerPrefix(c.nodeValue));
      const a = f.id && stickerMap[f.id] ? stickerMap[f.id].anchor : null;
      return (f.id || '?') + '@idx' + (a ? a.index : '?');
    }).join(', '));

    const self = this;
    comments.forEach(function (comment) {
      const f = facade.parseMarkerFields(stripStickerPrefix(comment.nodeValue));
      if (!f.id) {
        console.warn('[StickerRenderer.renderInArticle] 注释无法解析 decoId: ' + String(comment.nodeValue).substring(0, 40));
        return;
      }
      const decoId = f.id;
      const sticker = stickerMap[decoId];
      if (!sticker) {
        console.warn('[StickerRenderer.renderInArticle] stickerMap 中无 decoId=' + decoId + ' | 可用: ' + Object.keys(stickerMap).join(','));
        return;
      }

      const deco = DecoShelf.get(decoId);
      if (!deco) {
        console.warn('[StickerRenderer.renderInArticle] DecoShelf.get(' + decoId + ') 返回 null/undefined');
        return;
      }
      console.log('[StickerRenderer.renderInArticle] deco=' + decoId +
                  ' | name=' + (deco.name || '?') +
                  ' | hasDataUrl=' + !!deco.dataUrl +
                  ' | hasUrl=' + !!deco.url +
                  ' | sticker.keys=' + Object.keys(sticker).join(','));

      const el = self._createStickerElement(sticker, deco, { containerWidth, mode: 'absolute' });
      const imgSrc = deco.dataUrl || deco.url || '';
      console.log('[StickerRenderer.renderInArticle] 创建元素: tagName=' + el.tagName +
                  ' | className=' + el.className +
                  ' | imgSrc前40=' + (imgSrc ? imgSrc.substring(0, 40) : '(empty)') +
                  ' | deco.dataUrl前40=' + (deco.dataUrl ? deco.dataUrl.substring(0, 40) : '(empty)') +
                  ' | deco.url=' + deco.url);
      // 替换前验证注释节点仍挂载；失败时回退 appendChild，避免贴纸静默丢失（排查文档 L4）
      if (!comment.parentNode || !container.contains(comment)) {
        console.warn('[StickerRenderer.renderInArticle] 注释节点已不在容器中，回退 appendChild: ' + decoId);
        container.appendChild(el);
      } else {
        comment.parentNode.replaceChild(el, comment);
      }
      // 强制浏览器重排，确保浮动元素尺寸被正确计算
      void el.offsetHeight;
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      console.log('[StickerRenderer.renderInArticle] replaceChild 完成: parentNode=' + (el.parentNode ? el.parentNode.tagName + '.' + el.parentNode.className : 'null') +
                  ' | offsetWidth=' + el.offsetWidth + ' offsetHeight=' + el.offsetHeight +
                  ' | compWidth=' + cs.width + ' compHeight=' + cs.height +
                  ' | compFloat=' + cs.float + ' compDisplay=' + cs.display +
                  ' | compBackground=' + cs.backgroundImage.substring(0, 50) +
                  ' | rect.top=' + rect.top.toFixed(0) + ' rect.left=' + rect.left.toFixed(0) +
                  ' | anchor=' + JSON.stringify(sticker.anchor));
      self._elements.push(el);
    });

    // 追加 clearfix 防止浮动贴纸导致高度塌陷
    this._ensureClearfix(container);
    // 容器 resize 后重新 clamp（M4）
    this.observeResize(container);
  },

  /**
   * 确保容器末尾有 clearfix 元素（防止 float 贴纸导致容器高度塌陷）。
   * 先移除旧 clearfix 避免累积，再添加新 clearfix。
   */
  _ensureClearfix(container) {
    // 移除旧的避免累积
    const old = container.querySelectorAll('.sticker-clearfix');
    old.forEach(function (el) { el.remove(); });
    // 添加新的
    const cf = document.createElement('div');
    cf.className = 'sticker-clearfix';
    cf.style.cssText = 'clear:both;height:0;overflow:hidden;';
    container.appendChild(cf);
  },

  /**
   * 对容器内所有已渲染贴纸重新执行 clamp（M4：resize 后调用）。
   * @param {HTMLElement} container
   */
  reclampAll(container) {
    if (!container) return;
    const els = container.querySelectorAll('.article-sticker');
    const containerWidth = container.clientWidth || 0;
    const containerHeight = container.clientHeight || 0;
    els.forEach((el) => {
      const sticker = el._sticker;
      if (!sticker) return;
      const w = sticker.width || 120;
      const h = sticker.height || 120;
      // absolute 定位：clamp left/top，确保贴纸不越界（方案：阅读页 absolute 定位）
      const x = sticker.x !== undefined && sticker.x !== null ? Number(sticker.x) : 0;
      const y = sticker.y !== undefined && sticker.y !== null ? Number(sticker.y) : 0;
      const maxLeft = containerWidth > 0 ? Math.max(0, containerWidth - w) : 0;
      const maxTop = containerHeight > 0 ? Math.max(0, containerHeight - h) : 0;
      el.style.left = (Number.isFinite(x) ? Math.min(Math.max(x, 0), maxLeft) : 0) + 'px';
      el.style.top = (Number.isFinite(y) ? Math.min(Math.max(y, 0), maxTop) : 0) + 'px';
    });
  },

  /**
   * 监听容器尺寸变化，resize 后自动重新 clamp（M4）。
   * 优先使用 ResizeObserver，缺失时回退 window resize。
   * @param {HTMLElement} container
   */
  observeResize(container) {
    if (!container || container.__stickerResizeObserved) return;
    container.__stickerResizeObserved = true;

    const self = this;
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => {
        self.reclampAll(container);
      });
      ro.observe(container);
      container.__stickerResizeObserver = ro;
    } else {
      container.__stickerResizeHandler = function () {
        self.reclampAll(container);
      };
      window.addEventListener('resize', container.__stickerResizeHandler);
    }
  },

  /**
   * 为贴纸编辑模式渲染贴纸（绝对定位，覆盖在文章内容之上）
   *
   * @param {HTMLElement} parentContainer - 覆盖层的文章容器
   * @param {Array<object>} stickerData - 完整贴纸数据（含 x, y）
   */
  renderForEditor(parentContainer, stickerData) {
    if (!parentContainer || !stickerData || !stickerData.length) return;
    this.clearElements();

    const self = this;

    stickerData.forEach(function (data) {
      const deco = DecoShelf.get(data.decoId);
      if (!deco) return;

      const el = self._createEditorStickerElement(data, deco);
      parentContainer.appendChild(el);
      self._elements.push(el);
    });
  },

  /**
   * 创建单个贴纸浮动元素（用于文章阅读视图）。
   * @param {object} sticker - 贴纸数据
   * @param {object} deco - 贴纸资源数据（含 dataUrl/url）
   * @param {{ containerWidth?: number, mode?: 'absolute'|'float' }} [options]
   */
  _createStickerElement(sticker, deco, options = {}) {
    const imgSrc = deco.dataUrl || deco.url || '';
    let el = null;

    // 单一渲染核心：委托 StickerFacade.renderSticker（含 escapeCssUrl 安全转义）
    if (imgSrc) {
      try {
        el = this._facade.renderSticker(
          { ...sticker, src: imgSrc },
          {
            mode: options.mode || 'absolute',
            containerWidth: options.containerWidth || 0,
          }
        );
      } catch (err) {
        console.warn('[StickerRenderer] renderSticker 回退到旧渲染: ' + (err && err.message));
        el = null;
      }
    }

    // 无 src 或安全断言失败时回退到旧实现，保证既有数据可渲染
    if (!el) {
      el = document.createElement('div');
      el.className = 'article-sticker';
      el.dataset.decoId = sticker.decoId;
      el.style.cssText = StickerShape.buildInlineStyle(sticker, imgSrc);
    }
    el.dataset.decoId = sticker.decoId;
    // 附加贴纸数据供 resize 重新 clamp 使用
    el._sticker = sticker;

    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    return el;
  },

  /**
   * 创建编辑器模式下的贴纸元素（绝对定位，可拖拽）。
   * M4：委托 StickerFacade.renderSticker（mode:'absolute'）单一渲染核心。
   */
  _createEditorStickerElement(data, deco) {
    const imgSrc = deco.dataUrl || deco.url || '';
    const w = data.width || data.w || StickerShape.DEFAULT_SIZE;
    const h = data.height || data.h || StickerShape.DEFAULT_SIZE;

    let el = null;
    if (imgSrc) {
      try {
        el = this._facade.renderSticker(
          {
            id: data.decoId,
            x: data.x || 0,
            y: data.y || 0,
            width: w,
            height: h,
            src: imgSrc,
            align: data.align || 'left',
          },
          { mode: 'absolute' }
        );
        el.classList.add('article-sticker-editing');
      } catch (err) {
        console.warn('[StickerRenderer] renderSticker(absolute) 回退到旧渲染: ' + (err && err.message));
        el = null;
      }
    }

    if (!el) {
      el = document.createElement('div');
      el.className = 'article-sticker article-sticker-editing';
      el.style.cssText = [
        'position:absolute',
        'left:' + (data.x || 0) + 'px',
        'top:' + (data.y || 0) + 'px',
        'width:' + w + 'px',
        'height:' + h + 'px',
        'background-image:url(' + imgSrc + ')',
        'background-size:contain',
        'background-repeat:no-repeat',
        'background-position:center',
        'pointer-events:auto',
        'z-index:10',
        'cursor:grab',
      ].join(';');
    }
    el.id = 'article-sticker-' + data.decoId;
    el.dataset.decoId = data.decoId;

    return el;
  },

  /**
   * 更新贴纸的浮动方向
   * @param {HTMLElement} el - 贴纸 DOM 元素
   * @param {string} align - 'left' | 'right'
   */
  toggleAlign(el, align) {
    if (!el) return;
    el.style.float = align;
  },

  /**
   * 清除所有已渲染的贴纸元素
   */
  clearElements() {
    this._elements.forEach(function (el) {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    this._elements = [];
  },

  /**
   * 从文章容器中获取当前贴纸状态（用于保存）
   * @param {HTMLElement} container
   * @returns {Array<object>}
   */
  collectStickerData(container) {
    if (!container) return [];
    const result = [];
    const els = container.querySelectorAll('.article-sticker-editing');
    els.forEach(function (el) {
      result.push({
        decoId: el.dataset.decoId,
        x: parseFloat(el.style.left) || 0,
        y: parseFloat(el.style.top) || 0,
        width: parseFloat(el.style.width) || StickerShape.DEFAULT_SIZE,
        height: parseFloat(el.style.height) || StickerShape.DEFAULT_SIZE,
        align: el.dataset.align || 'left',
        margin: parseInt(el.dataset.margin) || StickerShape.DEFAULT_MARGIN,
      });
    });
    return result;
  },
};

export default StickerRenderer;
