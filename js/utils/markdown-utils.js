/**
 * Markdown → HTML 轻量转换工具。
 * 两个编辑器（ArticleEditorMode / StickerEditorMode）共享此实现。
 *
 * @module markdown-utils
 */

import { Utils } from '../utils.js';

export var MarkdownUtils = {

  /**
   * 检测文本是否已包含 HTML 标签（WYSIWYG 编辑器输出）。
   * 使用启发式检测：匹配常见的块级/行内 HTML 标签。
   * @param {string} text
   * @returns {boolean}
   */
  _isLikelyHtml: function (text) {
    if (!text) return false;
    // 与编辑器 _isHtmlContent 对齐：匹配任意 HTML 标签，而非白名单限制。
    // 白名单（p|div|...）无法覆盖 contentEditable 可能产生的所有标签（如 <s>、<tr>、<td> 等），
    // 导致 WYSIWYG 编辑器保存的合法 HTML 被 escapeHtml 转义为纯文本。
    var trimmed = text.trim();
    if (/^<\w+[^>]*>/.test(trimmed) && /<\/\w+>/.test(trimmed)) return true;
    // 兼容不以标签开头但包含 HTML 标签的内容（如内联 "Hello <strong>World</strong>"）
    if (/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?\s*>/.test(text)) return true;
    // 兼容 contentEditable 中直接键入 HTML 时浏览器自动转义的实体标签
    // 如 &lt;h1&gt;Hello&lt;/h1&gt; — 浏览器将用户键入的 < > 转义为实体
    if (/&lt;\/?\w+[^&]*&gt;/.test(text)) return true;
    return false;
  },

  /** 将浏览器转义的 HTML 实体还原为原始标签（contentEditable 键入转义恢复） */
  _unescapeHtmlEntities: function (text) {
    return text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  },

  /**
   * 将 Markdown 文本转换为 HTML。若内容本身已是 HTML 则直接返回。
   * 支持：标题 h1-h3、粗体/斜体、行内代码/代码块、引用、无序列表、段落。
   *
   * @param {string} text - Markdown 原始文本 或 已渲染的 HTML
   * @returns {string} HTML 字符串
   */
  toHTML: function (text) {
    if (!text) return '<p style="color:var(--color-text-muted);">（空内容）</p>';

    // 如果内容已包含 HTML 标签（WYSIWYG 编辑器输出），跳过 escapeHtml
    // 避免将 <p> 转为 &lt;p&gt; 导致渲染为文本
    var isHtml = this._isLikelyHtml(text);
    console.log('[MarkdownUtils.toHTML] _isLikelyHtml:', isHtml,
                '| len:', text ? text.length : 0,
                '| head80:', JSON.stringify(text ? text.substring(0, 80) : ''));
    if (isHtml) {
      // contentEditable 中用户直接键入 HTML 标签时，浏览器自动转义为 &lt; &gt;
      // 此时需要在渲染前还原，否则 innerHTML 会显示为原始实体文本。
      // 但必须先保护贴纸标记（<!-- sticker:... -->），避免 _unescapeHtmlEntities
      // 的全局替换改变标记周围的段落结构。
      var hasStickerMarkers = /<!--\s*sticker:/.test(text);
      if (/&lt;\/?\w+[^&]*&gt;/.test(text)) {
        // 提取贴纸标记，避免被实体还原影响
        var markerPlaceholders = [];
        var cleanText = text;
        if (hasStickerMarkers) {
          cleanText = text.replace(/<!--\s*sticker:.*?-->/g, function (match) {
            var idx = markerPlaceholders.length;
            markerPlaceholders.push(match);
            return '\x00STICKER_' + idx + '\x00';
          });
        }
        var unescaped = this._unescapeHtmlEntities(cleanText);
        // 重新插入贴纸标记
        if (hasStickerMarkers) {
          unescaped = unescaped.replace(/\x00STICKER_(\d+)\x00/g, function (_, idx) {
            return markerPlaceholders[parseInt(idx)];
          });
        }
        console.log('[MarkdownUtils.toHTML] unescaped browser-escaped HTML entities' +
                    (hasStickerMarkers ? ' (stickers preserved)' : ''));
        return unescaped;
      }
      return text;
    }

    console.log('[MarkdownUtils.toHTML] Processing as Markdown, calling escapeHtml...');
    var html = Utils.escapeHtml(text);

    // 代码块（在 inline code 之前处理）
    html = html.replace(/```([\s\S]*?)```/g, function (match, code) {
      return '<pre><code>' + code + '</code></pre>';
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');
    // 粗体/斜体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 引用
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>');
    // 列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\s*)+/g, function (match) {
      return '<ul>' + match + '</ul>';
    });
    // 段落
    html = html.replace(/\n{2,}/g, '</p><p>');
    html = html.replace(/\n/g, '<br>');
    html = '<p>' + html + '</p>';
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<p><br><\/p>/g, '');
    html = html.replace(/<(h[1-6]|ul|ol|li|blockquote|pre)>/g, function (match) {
      return match.replace('<br>', '');
    });

    return html;
  }
};

export default MarkdownUtils;
