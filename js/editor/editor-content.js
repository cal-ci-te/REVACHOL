/**
 * 编辑器内容层 — 文章渲染、contentEditable 编辑、内容读写、脏状态检测。
 *
 * 所有方法通过参数接收 DOM 引用和状态，不依赖主控模块，避免循环引用。
 *
 * @module editor-content
 */

import { MarkdownUtils } from '../utils/markdown-utils.js';
import { Utils } from '../utils.js';
import { StickerRenderer } from './sticker-renderer.js';
import { StickerShape } from './sticker-shape.js';
import { AnchorManager } from './anchor-manager.js';
import { ContentBuilder } from './content-builder.js';

export const EditorContent = {

  // =========================================================================
  //  文章渲染
  // =========================================================================

  /**
   * 渲染文章标题和内容到指定容器。
   * @param {object} article - 文章对象
   * @param {HTMLElement} container - 父容器（articleContainer）
   * @returns {{ titleEl: HTMLElement, contentEl: HTMLElement }}
   */
  render(article, container) {
    // 标题（只读展示，匹配阅读视图；编辑通过工具栏输入框）
    var titleEl = document.createElement('h1');
    titleEl.id = 'article-editor-title';
    titleEl.style.cssText = [
      'color:var(--color-text-heading, #e8c88a)',
      'font-size:28px', 'margin:0 0 8px', 'padding-bottom:16px',
      'border-bottom:1px solid var(--color-border, #5a3e2b)',
      'font-family:var(--font-family-serif, Georgia, serif)',
      'outline:none',
    ].join(';');
    titleEl.textContent = article.title || '未命名文章';
    container.appendChild(titleEl);

    // 内容
    var contentEl = document.createElement('div');
    contentEl.className = 'detail-body';
    contentEl.innerHTML = this.renderContent(article.content || '');
    contentEl.style.outline = 'none';
    container.appendChild(contentEl);

    return { titleEl: titleEl, contentEl: contentEl };
  },

  /**
   * 智能渲染：自动检测内容是 Markdown 还是 HTML。
   * - HTML 内容（以 < 开头且含 HTML 标签）跳过 escapeHtml 直接使用
   * - Markdown 内容走完整的 Markdown→HTML 转换
   * @param {string} text
   * @returns {string} HTML
   */
  renderContent(text) {
    if (!text) return '<p style="color:var(--color-text-muted);">（空内容）</p>';

    // 如果内容已经是 HTML（之前编辑过），直接使用
    if (this._isHtmlContent(text)) {
      return text;
    }

    // Markdown → HTML（委托给公共工具，避免两个编辑器重复实现）
    return MarkdownUtils.toHTML(text);
  },

  /**
   * 判断内容是否已经是 HTML 格式。
   * 检测特征：以 < 开头且包含 HTML 标签。
   */
  _isHtmlContent(text) {
    var trimmed = text.trim();
    return /^<(\w+)[^>]*>/.test(trimmed) && /<\/\w+>/.test(trimmed);
  },

  // =========================================================================
  //  编辑能力
  // =========================================================================

  /**
   * 启用 contentEditable 编辑，绑定输入和粘贴事件。
   * @param {HTMLElement} titleEl
   * @param {HTMLElement} contentEl
   * @param {function} onDirty - 标记脏状态回调
   * @returns {{ inputHandler: function, pasteHandler: function }} 事件处理器引用（供 cleanup 使用）
   */
  enableEditing(titleEl, contentEl, onDirty) {
    // 标题保持只读（编辑通过工具栏输入框）
    // 内容可编辑
    contentEl.contentEditable = 'true';
    contentEl.setAttribute('role', 'textbox');
    contentEl.setAttribute('aria-label', '文章内容');
    contentEl.style.cursor = 'text';

    contentEl.classList.add('editing');

    // 输入事件 → 标记脏状态
    var inputHandler = function () {
      if (onDirty) onDirty();
    };
    titleEl.addEventListener('input', inputHandler);
    contentEl.addEventListener('input', inputHandler);

    // 粘贴事件 → 清理格式（只保留纯文本 + 基本结构）
    var pasteHandler = function (e) {
      e.preventDefault();
      var text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;

      // 将纯文本转为带换行的 HTML
      var html = Utils.escapeHtml(text)
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, '<br>');
      html = '<p>' + html + '</p>';

      // 插入到光标位置
      var sel = window.getSelection();
      if (sel.rangeCount && sel.getRangeAt(0).intersectsNode(contentEl)) {
        var range = sel.getRangeAt(0);
        range.deleteContents();
        var fragment = range.createContextualFragment(html);
        range.insertNode(fragment);
        range.collapse(false);
      }
      if (onDirty) onDirty();
    };
    contentEl.addEventListener('paste', pasteHandler);

    console.log('[EditorContent] 编辑能力已启用');

    return { inputHandler: inputHandler, pasteHandler: pasteHandler };
  },

  /**
   * 清理编辑事件监听。
   */
  cleanupEditing(titleEl, contentEl, inputHandler, pasteHandler) {
    if (titleEl && inputHandler) {
      titleEl.removeEventListener('input', inputHandler);
    }
    if (contentEl && inputHandler) {
      contentEl.removeEventListener('input', inputHandler);
    }
    if (contentEl && pasteHandler) {
      contentEl.removeEventListener('paste', pasteHandler);
    }
  },

  // =========================================================================
  //  内容读写
  // =========================================================================

  /**
   * 获取当前标题。
   * @param {HTMLElement} titleEl
   * @returns {string}
   */
  getTitle(titleEl) {
    if (!titleEl) return '';
    return titleEl.textContent.trim();
  },

  /**
   * 设置标题（更新 DOM + 标记脏状态 + 更新工具栏）。
   * @param {HTMLElement} titleEl
   * @param {string} val
   * @param {object} toolbar - 工具栏对象
   * @param {object} article - 文章对象
   * @param {function} onDirty
   */
  setTitle(titleEl, val, toolbar, article, onDirty) {
    if (titleEl) {
      titleEl.textContent = val || '未命名文章';
    }
    if (onDirty) onDirty();
    if (toolbar) {
      toolbar.updateInfo(val, article ? (article.category || '未分类') : '');
    }
  },

  /**
   * 获取当前编辑后的内容（HTML 格式）。
   * @param {HTMLElement} contentEl
   * @returns {string}
   */
  getContentHTML(contentEl) {
    if (!contentEl) return '';
    var html = contentEl.innerHTML;

    // 移除占位符段落
    html = html.replace(/<p[^>]*>\s*（空内容）\s*<\/p>/g, '');
    html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

    return html.trim();
  },

  /**
   * 构建保存用的内容：数据驱动架构——收集贴纸锚点信息，构建带标记的内容。
   *
   * 流程：
   *   1. 从 DOM 收集贴纸数据（含锚点信息）
   *   2. 获取纯内容（剥离贴纸 div）
   *   3. 使用 ContentBuilder 在正确位置插入标记注释
   *
   * @param {HTMLElement} contentEl
   * @param {object} article - 文章对象（含 stickers 数组）
   * @returns {string}
   */
  buildSaveContent(contentEl, article) {
    if (!contentEl) return '';

    // 1. 从 DOM 收集贴纸数据（含锚点信息）——在剥离贴纸 div 之前执行
    var stickersWithAnchor = this.collectStickersWithAnchor(contentEl, article);
    console.log('[EditorContent.buildSaveContent] 收集到 ' + stickersWithAnchor.length +
                ' 张贴纸（含锚点）| decoIds=' + stickersWithAnchor.map(function(s){return s.decoId;}).join(','));

    // 2. 获取纯内容（剥离贴纸 div 和 clearfix）
    var html = this.getContentHTML(contentEl);
    html = StickerRenderer.stripStickerDivs(html);
    html = StickerRenderer.stripMarkers(html);

    // 3. 使用数据驱动构建：在正确锚点位置插入标记注释
    var result = ContentBuilder.build(html, stickersWithAnchor);

    console.log('[EditorContent.buildSaveContent] 构建完成 | stickers=' + stickersWithAnchor.length +
                ' | 输出 len=' + result.length +
                ' | head80=' + JSON.stringify(result.substring(0, 80)));
    return result.trim();
  },

  /**
   * 从 DOM 中收集贴纸数据（含锚点信息）。
   * 必须在剥离贴纸 div 之前调用，以确保锚点计算基于完整 DOM 结构。
   *
   * @param {HTMLElement} container - 文章内容容器
   * @param {object} article - 文章对象（含 stickers 数组，用于补充已有属性）
   * @returns {Array<object>} 贴纸数据数组 [{ decoId, width, height, align, margin, anchor }]
   */
  collectStickersWithAnchor: function (container, article) {
    if (!container) return [];
    var result = [];
    var els = container.querySelectorAll('.article-sticker');
    if (!els.length) return result;

    // 构建 decoId → 已有 sticker 数据的查找表
    var stickerMap = {};
    var existing = article ? (article.stickers || []) : [];
    existing.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    els.forEach(function (el) {
      var decoId = el.dataset.decoId;
      if (!decoId) return;

      // 优先从已有 sticker 数据获取属性，回退到 DOM 计算
      var existingData = stickerMap[decoId] || {};

      // 锚点：优先使用贴纸编辑器保存时计算的锚点（基于覆盖层正确位置）；
      // 若无已有锚点（如首次打开未进贴纸编辑器），从主编辑器 DOM 计算
      var anchor = existingData.anchor;
      var anchorSource = 'none';
      if (!anchor || AnchorManager.isDefaultAnchor(anchor)) {
        anchor = AnchorManager.computeAnchor(el, container);
        anchorSource = 'DOM';
      } else {
        anchorSource = 'existingData';
      }
      console.log('[collectStickersWithAnchor] decoId=' + decoId +
                  ' | source=' + anchorSource +
                  ' | existingAnchor=' + JSON.stringify(existingData.anchor) +
                  ' | finalAnchor=' + JSON.stringify(anchor));

      var width = parseFloat(el.style.width) ||
                  existingData.width || existingData.w ||
                  StickerShape.DEFAULT_SIZE;
      var height = parseFloat(el.style.height) ||
                   existingData.height || existingData.h ||
                   StickerShape.DEFAULT_SIZE;
      var align = existingData.align || 'left';
      var margin = existingData.margin !== undefined
                   ? existingData.margin
                   : StickerShape.DEFAULT_MARGIN;

      // 从 DOM 补充 align（如果现有数据中不存在）
      var floatVal = el.style.float;
      if (!existingData.align && floatVal) {
        align = floatVal;
      }

      result.push({
        decoId: decoId,
        x: existingData.x !== undefined ? existingData.x : StickerShape.DEFAULT_X,
        y: existingData.y !== undefined ? existingData.y : StickerShape.DEFAULT_Y,
        width: width,
        height: height,
        w: width,
        h: height,
        align: align,
        margin: margin,
        anchor: anchor,
      });
    });

    return result;
  },

  /**
   * 从文章内容中解析贴纸标记（用于页面刷新后恢复贴纸数据）。
   * 使用 AnchorManager.parseFromMarker 统一解析字段（含 anchor 信息），字段顺序无关。
   * @param {string} content - 文章内容（可能含 HTML 注释标记）
   * @returns {Array} 贴纸数据数组
   */
  parseStickersFromContent(content) {
    var stickers = [];
    if (!content) return stickers;
    var regex = StickerRenderer._MARKER_REGEX;
    regex.lastIndex = 0; // 重置全局正则状态（共享实例可能被其他模块使用后残留 lastIndex）
    var match;
    while ((match = regex.exec(content)) !== null) {
      // 使用 AnchorManager 统一解析（支持 anchor 字段 + 向后兼容旧格式）
      var fields = AnchorManager.parseFromMarker(match[1]);
      stickers.push({
        decoId: fields.decoId,
        x: fields.x ? parseInt(fields.x) : StickerShape.DEFAULT_X,
        y: fields.y ? parseInt(fields.y) : StickerShape.DEFAULT_Y + stickers.length * StickerShape.DEFAULT_GAP,
        width: parseInt(fields.w) || StickerShape.DEFAULT_SIZE,
        height: parseInt(fields.h) || StickerShape.DEFAULT_SIZE,
        w: parseInt(fields.w) || StickerShape.DEFAULT_SIZE,
        h: parseInt(fields.h) || StickerShape.DEFAULT_SIZE,
        align: fields.align || 'left',
        margin: fields.margin !== undefined ? parseInt(fields.margin) : StickerShape.DEFAULT_MARGIN,
        pos: fields.pos !== undefined ? parseInt(fields.pos) : -1,
        // 锚点信息：向后兼容旧标记（无 anchor 字段时默认末尾）
        anchor: fields.anchor || { type: 'end', index: -1 },
      });
    }
    console.log('[EditorContent.parseStickersFromContent] 解析到 ' + stickers.length + ' 张贴纸 | decoIds=' + stickers.map(function(s){return s.decoId;}).join(','));
    return stickers;
  },

  /**
   * 检测是否有实际修改（对比快照）。
   * 注意：_snapshot.content 可能含贴纸标记，getContentHTML 不含，比较前需剥离。
   * @param {object} snapshot - { title, content, stickers }
   * @param {HTMLElement} titleEl
   * @param {HTMLElement} contentEl
   * @param {object} article - 文章对象（含 stickers）
   * @param {boolean} dirty - 原始 _dirty 标记
   * @returns {boolean}
   */
  hasChanges(snapshot, titleEl, contentEl, article, dirty) {
    if (!snapshot) return dirty;

    var currentTitle = this.getTitle(titleEl);
    var currentContent = this.getContentHTML(contentEl);
    var currentStickers = article ? (article.stickers || []) : [];

    // 剥离贴纸标记后比较内容（快照 content 可能含标记）
    var snapshotContent = StickerRenderer.stripMarkers(snapshot.content || '');
    var cleanContent = StickerRenderer.stripMarkers(currentContent || '');

    return currentTitle !== snapshot.title ||
           cleanContent !== snapshotContent ||
           JSON.stringify(currentStickers) !== JSON.stringify(snapshot.stickers || []);
  },
};
