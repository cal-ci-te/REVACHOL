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
   * 构建保存用的内容：将 contentEditable 中已渲染的贴纸 div 就地替换为标记注释。
   * 替换后的标记出现在原贴纸 div 的位置，阅读视图 TreeWalker 在此位置渲染贴纸。
   * @param {HTMLElement} contentEl
   * @param {object} article - 文章对象（含 stickers 数组）
   * @returns {string}
   */
  buildSaveContent(contentEl, article) {
    var html = this.getContentHTML(contentEl);

    // 构造 decoId → sticker 查找表
    var stickerMap = {};
    var stickers = article ? (article.stickers || []) : [];
    stickers.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    // 先将 .article-sticker div 就地替换为贴纸标记注释
    // 使用函数回调逐个匹配：提取 data-deco-id → 查表 → 生成 marker
    var replacedCount = 0;
    html = html.replace(/<div[^>]*class="[^"]*article-sticker[^"]*"[^>]*>[\s\S]*?<\/div>/gi, function (match, offset) {
      var decoIdMatch = match.match(/data-deco-id="([^"]+)"/);
      if (!decoIdMatch) return '';
      var decoId = decoIdMatch[1];
      var sticker = stickerMap[decoId];
      if (!sticker) return '';
      replacedCount++;
      // 标记注释放在贴纸原位置，pos 记录字符偏移量
      return '\n' + StickerRenderer.createMarker(decoId, {
        x: sticker.x, y: sticker.y,
        w: sticker.w || sticker.width, h: sticker.h || sticker.height,
        align: sticker.align, margin: sticker.margin,
        pos: offset,
      }) + '\n';
    });

    // 移除 .sticker-clearfix div
    html = html.replace(/<div[^>]*class="[^"]*sticker-clearfix[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // 移除残留的旧贴纸标记（避免重复）
    html = StickerRenderer.stripMarkers(html);

    console.log('[EditorContent.buildSaveContent] 就地替换 ' + replacedCount + ' 张贴纸 | 输出 len=' + html.length +
                ' | head80=' + JSON.stringify(html.substring(0, 80)));
    return html.trim();
  },

  /**
   * 从文章内容中解析贴纸标记（用于页面刷新后恢复贴纸数据）。
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
      var fields = StickerRenderer._parseMarkerContent(match[1]);
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
