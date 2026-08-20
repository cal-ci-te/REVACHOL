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
    const trimmed = text.trim();
    if (/^<\w+[^>]*>/.test(trimmed) && /<\/\w+>/.test(trimmed)) return true;
    // 兼容不以标签开头但包含 HTML 标签的内容（如内联 "Hello <strong>World</strong>"）
    if (/<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*\/?\s*>/.test(text)) return true;
    // 兼容 contentEditable 中直接键入 HTML 时浏览器自动转义的实体标签
    // 如 &lt;h1&gt;Hello&lt;/h1&gt; — 浏览器将用户键入的 < > 转义为实体
    if (/&lt;\/?\w+[^&]*&gt;/.test(text)) return true;
    // 兼容仅含贴纸标记（无其他 HTML 标签）的内容，避免标记被当作 Markdown 转义
    if (/<!--\s*sticker:/.test(text)) return true;
    return false;
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
    const isHtml = this._isLikelyHtml(text);
    console.log('[MarkdownUtils.toHTML] _isLikelyHtml:', isHtml,
                '| len:', text ? text.length : 0,
                '| head80:', JSON.stringify(text ? text.substring(0, 80) : ''));
    if (isHtml) {
      // 内容已是 HTML（WYSIWYG 编辑器输出），直接返回，保留所有 HTML 注释节点
      // （如 <!-- sticker:xxx -->）。不做任何转义/实体还原，避免标记被移除或损坏。
      console.log('[MarkdownUtils.toHTML] HTML 内容，直接返回，保留注释');
      return text;
    }

    console.log('[MarkdownUtils.toHTML] Processing as Markdown, calling escapeHtml...');
    let html = Utils.escapeHtml(text);

    // 行内格式转换（用于段落/标题/列表/引用内的文本）
    const inline = function (s) {
      return s
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>');
    };

    // 代码块（跨行，先整体处理，避免被段落分割；两侧补空行作为块边界）
    html = html.replace(/```([\s\S]*?)```/g, function (match, code) {
      return '\n\n<pre><code>' + code + '</code></pre>\n\n';
    });

    // 按空行分割为块，逐块转换，避免块级元素被错误包裹进 <p>
    const blocks = html.split(/\n{2,}/);
    const outBlocks = [];
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const trimmed = block.trim();
      if (!trimmed) continue;

      // 代码块（已转换为 <pre>）
      if (/^<pre><code>/.test(trimmed)) {
        outBlocks.push(trimmed);
        continue;
      }

      // 标题 # / ## / ###
      const hMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
      if (hMatch) {
        const level = hMatch[1].length;
        outBlocks.push('<h' + level + '>' + inline(hMatch[2]) + '</h' + level + '>');
        continue;
      }

      // 引用 > text（多行合并为 <br>）
      if (/^&gt;\s+/.test(trimmed)) {
        const quote = block.split('\n').map(function (l) {
          return l.replace(/^&gt;\s+/, '');
        }).join('<br>');
        outBlocks.push('<blockquote>' + inline(quote) + '</blockquote>');
        continue;
      }

      // 无序列表 - item
      if (/^-\s+/.test(trimmed)) {
        const items = block.split('\n').map(function (l) {
          return '<li>' + inline(l.replace(/^-\s+/, '')) + '</li>';
        }).join('');
        outBlocks.push('<ul>' + items + '</ul>');
        continue;
      }

      // 普通段落（多行用 <br>）
      const p = block.replace(/\n/g, '<br>');
      outBlocks.push('<p>' + inline(p) + '</p>');
    }

    html = outBlocks.join('\n');

    return html;
  }
};

export default MarkdownUtils;
