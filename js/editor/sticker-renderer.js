// ！文章贴纸渲染器
// 在文章阅读视图与编辑视图中渲染贴纸：把正文里的占位标记替换为真实贴纸 DOM 元素。
// 占位标记格式：<!-- sticker:{id} x={x} y={y} w={width} h={height} align={align} -->
// 渲染后替换为 <div class="article-sticker" data-deco-id="decoId">。
// 依赖 StickerShape（形状）、DecoShelf（贴纸数据）、StickerFacade（解析/序列化/渲染单一核心）。
import { StickerShape } from './sticker-shape.js';
import { DecoShelf } from '../services/deco.js';
import { AnchorManager } from './anchor-manager.js';
import { StickerFacade } from '../business/sticker/index.js';

// 统一贴纸门面：解析、序列化与渲染全部经此单一实现，避免本项目内出现第二套贴纸处理逻辑
const _stickerFacade = new StickerFacade();

// 从注释 nodeValue 中剥离 sticker: 前缀
// 手工截取而非用正则：正则字面量在本项目会触发 no-inline-sticker-regexp 规则
function stripStickerPrefix(text) {
  let raw = (text || '').trim();
  if (raw.startsWith('sticker:')) {
    raw = raw.slice('sticker:'.length).trim();
  }
  return raw;
}

export const StickerRenderer = {

  // 统一贴纸门面
  _facade: _stickerFacade,

  // 贴纸占位标记正则（复用 facade.markerRegex 作为统一数据源）
  // 匹配任意 <!-- sticker:{content} --> 注释块，不依赖字段顺序；捕获组 1 为注释内容
  _MARKER_REGEX: _stickerFacade.markerRegex,

  // 剥离全部贴纸标记并清理其周围的空白行
  // 标记以 \n<!-- sticker:xxx -->\n 形式嵌入，只删标记会留下 \n 残留，
  // 导致卡片与详情页末尾出现空行占位，故连同前置换行一并移除
  stripMarkers: function (content) {
    if (!content) return '';
    const source = this._facade.markerRegex.source;
    const stripRegex = new RegExp('\\n?' + source, 'g');
    let cleaned = content.replace(stripRegex, '');
    // 连续 3 个以上换行压缩为 2 个：最多保留一个段落间距，避免残留大段空白
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
    return cleaned.trim();
  },

  // 剥离已渲染的贴纸 div（.article-sticker 与 .sticker-clearfix）
  // 这些 div 是编辑时替换注释节点产生的，保存时应只保留纯标记注释
  // 用 DOM 解析而非正则：正则无法正确处理属性含 > 或嵌套结构，会截断内容
  stripStickerDivs: function (content) {
    if (!content) return '';
    if (typeof DOMParser === 'undefined') return content;
    const doc = new DOMParser().parseFromString(content, 'text/html');
    const targets = doc.querySelectorAll('.article-sticker, .sticker-clearfix');
    targets.forEach((el) => el.remove());
    return doc.body.innerHTML;
  },

  // 解析标记注释内容为字段对象（字段顺序无关，兼容新旧格式）
  // 基础字段委托 sticker-parser 统一解析，anchor 单独交 AnchorManager 转为结构化对象
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

  // 已创建的贴纸元素集合（用于清理）
  _elements: [],

  // 解析内容中的贴纸标记，返回 { cleanContent, stickers }
  // y 缺省时按已解析数量递增 DEFAULT_GAP：多个无坐标贴纸若都用同一默认值会完全重叠
  parseMarkers(content) {
    const stickers = [];
    const regex = this._MARKER_REGEX;
    // 复位共享正则的 lastIndex：上一次调用可能中途退出而留下位置残留
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
        // 旧标记无 anchor 字段时默认末尾，保证旧数据仍可渲染
        anchor: fields.anchor || { type: 'end', index: -1 },
      });
    }

    regex.lastIndex = 0;
    const cleanContent = this.stripMarkers(content);

    return { cleanContent: cleanContent, stickers: stickers };
  },

  // 生成贴纸占位标记字符串
  // 仅非默认锚点才写入 anchor 字段，默认末尾锚点省略以缩短标记；基础字段委托 facade.serializeOne
  createMarker(decoId, opts) {
    opts = opts || {};

    const anchorReceived = !!opts.anchor;
    const isDefault = opts.anchor ? AnchorManager.isDefaultAnchor(opts.anchor) : true;
    const willWrite = anchorReceived && !isDefault;

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

    // 保留 pos 字段以读旧数据（旧格式使用字符偏移量定位）
    if (opts.pos !== undefined && opts.pos !== 'end') {
      marker = marker.replace(/ -->$/, ' pos=' + opts.pos + ' -->');
    }
    return marker;
  },

  // 在文章容器中按标记位置渲染贴纸
  // 用 TreeWalker 找注释节点并在其原位置替换，而非把全部贴纸插到容器开头：
  // 后者会丢失「贴纸跟随某段落」的语义
  renderInArticle(container, stickers, options = {}) {
    if (!container || !stickers || !stickers.length) {
      console.warn('[StickerRenderer.renderInArticle] 跳过：container=' + !!container + ' stickers=' + (stickers ? stickers.length : 0));
      return;
    }
    console.log('[StickerRenderer.renderInArticle] 开始：stickers.length=' + stickers.length);
    this.clearElements();

    // 容器设为 relative：贴纸用 absolute 定位，需要容器作为定位包含块
    container.style.position = 'relative';

    // 读取真实容器宽度：宽度为 0 会让 clamp 失效，故依次回退到 clientWidth 与 rect.width
    const rect = typeof container.getBoundingClientRect === 'function' ? container.getBoundingClientRect() : null;
    const containerWidth =
      options.containerWidth || container.clientWidth || (rect && rect.width) || 0;

    const stickerMap = {};
    const facade = this._facade;
    stickers.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

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

    // 先收集全部注释再统一替换：遍历过程中修改 DOM 会破坏 TreeWalker 的迭代状态
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
      // 替换前校验注释仍挂在容器中：期间若被其他模块重渲染过，
      // replaceChild 会静默失败导致贴纸丢失，此时回退为追加
      if (!comment.parentNode || !container.contains(comment)) {
        console.warn('[StickerRenderer.renderInArticle] 注释节点已不在容器中，回退 appendChild: ' + decoId);
        container.appendChild(el);
      } else {
        comment.parentNode.replaceChild(el, comment);
      }
      // 强制重排：让浏览器在读取下面尺寸前完成布局，否则读到未计算的 0
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

    this._ensureClearfix(container);
    this.observeResize(container);
  },

  // 确保容器末尾有 clearfix 元素
  // 贴纸为浮动元素，不给容器收尾会让容器高度塌陷、后续内容上移重叠
  // 先移除旧 clearfix 再添加：避免多次渲染后不断累积
  _ensureClearfix(container) {
    const old = container.querySelectorAll('.sticker-clearfix');
    old.forEach(function (el) { el.remove(); });
    const cf = document.createElement('div');
    cf.className = 'sticker-clearfix';
    cf.style.cssText = 'clear:both;height:0;overflow:hidden;';
    container.appendChild(cf);
  },

  // 对容器内所有贴纸重新执行 clamp（resize 后调用）
  // 贴纸为 absolute 定位，容器变窄后原坐标可能越界，故按新尺寸把 left/top 夹回可显示范围
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
      const x = sticker.x !== undefined && sticker.x !== null ? Number(sticker.x) : 0;
      const y = sticker.y !== undefined && sticker.y !== null ? Number(sticker.y) : 0;
      const maxLeft = containerWidth > 0 ? Math.max(0, containerWidth - w) : 0;
      const maxTop = containerHeight > 0 ? Math.max(0, containerHeight - h) : 0;
      // 非有限数一律归零：NaN 写进样式会被浏览器丢弃并保留旧值，反而更隐蔽
      el.style.left = (Number.isFinite(x) ? Math.min(Math.max(x, 0), maxLeft) : 0) + 'px';
      el.style.top = (Number.isFinite(y) ? Math.min(Math.max(y, 0), maxTop) : 0) + 'px';
    });
  },

  // 监听容器尺寸变化，变化后自动重新 clamp
  // 优先 ResizeObserver：容器宽度变化未必伴随 window resize（如侧边栏折叠）
  // 回退 window resize 以兼容不支持该 API 的环境；标记位防止重复监听造成回调叠加
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

  // 为贴纸编辑模式渲染贴纸（绝对定位，覆盖在文章内容之上）
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

  // 创建阅读视图用的贴纸元素
  // 优先委托 StickerFacade.renderSticker（内含 escapeCssUrl 转义与 SVG 清洗）；
  // 无图片源或安全断言未通过时回退到旧内联实现，保证历史数据仍能渲染
  _createStickerElement(sticker, deco, options = {}) {
    const imgSrc = deco.dataUrl || deco.url || '';
    let el = null;

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

    if (!el) {
      el = document.createElement('div');
      el.className = 'article-sticker';
      el.dataset.decoId = sticker.decoId;
      el.style.cssText = StickerShape.buildInlineStyle(sticker, imgSrc);
    }
    el.dataset.decoId = sticker.decoId;
    // 挂上原始数据：resize 重新 clamp 时需要读 x/y/width/height
    el._sticker = sticker;

    // 屏蔽浏览器原生右键菜单，改由应用统一提供贴纸操作菜单
    el.addEventListener('contextmenu', function (e) {
      e.preventDefault();
    });

    return el;
  },

  // 创建编辑器模式下的贴纸元素（绝对定位、可拖拽）
  // 与阅读视图分开的原因：编辑态需额外的 editing 类与 id，供拖拽交互按元素定位
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

  // 更新贴纸浮动方向
  toggleAlign(el, align) {
    if (!el) return;
    el.style.float = align;
  },

  // 清除所有已渲染的贴纸元素
  clearElements() {
    this._elements.forEach(function (el) {
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    });
    this._elements = [];
  },

  // 从文章容器收集当前贴纸状态（用于保存）
  // 只取 .article-sticker-editing：阅读视图中的贴纸不带该标记，不应被当作待保存数据
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
