// ！编辑器内容层
// 负责文章渲染、contentEditable 编辑、内容读写与脏状态检测。
// 所有方法都通过参数接收 DOM 引用与状态，不依赖主控模块，因此不会与之形成循环引用。
import { MarkdownUtils } from '../utils/markdown-utils.js';
import { Utils } from '../utils.js';
import { StickerRenderer } from './sticker-renderer.js';
import { StickerShape } from './sticker-shape.js';
import { AnchorManager } from './anchor-manager.js';
import { ContentBuilder } from './content-builder.js';

export const EditorContent = {

  // 文章渲染

  // 渲染标题与内容到指定容器
  // 标题为只读展示：改名走工具栏输入框，避免与 contentEditable 的撤销栈互相干扰
  render(article, container) {
    const titleEl = document.createElement('h1');
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

    const contentEl = document.createElement('div');
    contentEl.className = 'detail-body';
    contentEl.innerHTML = this.renderContent(article.content || '');
    contentEl.style.outline = 'none';
    container.appendChild(contentEl);

    return { titleEl: titleEl, contentEl: contentEl };
  },

  // 智能渲染内容：自动区分 Markdown 与 HTML
  // 全部委托 MarkdownUtils.toHTML 处理，包括「以贴纸注释开头的 HTML」这类边界情况；
  // 在此自行判断会让两套检测逻辑产生分歧
  renderContent(text) {
    if (!text) return '<p style="color:var(--color-text-muted);">（空内容）</p>';
    return MarkdownUtils.toHTML(text);
  },

  // 判断内容是否已是 HTML 格式
  // 与 MarkdownUtils._isLikelyHtml 保持一致，避免两套检测逻辑产生分歧
  _isHtmlContent(text) {
    return MarkdownUtils._isLikelyHtml(text);
  },

  // 编辑能力

  // 启用 contentEditable 编辑并绑定输入与粘贴事件
  // 粘贴时主动阻止默认行为并转成纯文本：直接粘贴会带入外部样式，破坏文章排版一致性
  enableEditing(titleEl, contentEl, onDirty) {
    contentEl.contentEditable = 'true';
    contentEl.setAttribute('role', 'textbox');
    contentEl.setAttribute('aria-label', '文章内容');
    contentEl.style.cursor = 'text';

    contentEl.classList.add('editing');

    const inputHandler = function () {
      if (onDirty) onDirty();
    };
    titleEl.addEventListener('input', inputHandler);
    contentEl.addEventListener('input', inputHandler);

    const pasteHandler = function (e) {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      if (!text) return;

      // 空行转为段落分隔、单换行转为 <br>，保留原文的段落层次
      let html = Utils.escapeHtml(text)
        .replace(/\n{2,}/g, "</p><p>")
        .replace(/\n/g, '<br>');
      html = '<p>' + html + '</p>';

      // 插入到光标位置
      // 需先确认选区落在 contentEl 内：选区可能在标题或其他区域，直接插入会写错位置
      const sel = window.getSelection();
      if (sel.rangeCount && sel.getRangeAt(0).intersectsNode(contentEl)) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const fragment = range.createContextualFragment(html);
        range.insertNode(fragment);
        range.collapse(false);
      }
      if (onDirty) onDirty();
    };
    contentEl.addEventListener('paste', pasteHandler);

    console.log('[EditorContent] 编辑能力已启用');

    return { inputHandler: inputHandler, pasteHandler: pasteHandler };
  },

  // 清理编辑事件监听
  // 用外部传入的处理器引用精确摘除：匿名函数无法 removeEventListener
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

  // 内容读写

  // 获取当前标题
  getTitle(titleEl) {
    if (!titleEl) return '';
    return titleEl.textContent.trim();
  },

  // 设置标题（更新 DOM、标记脏状态并同步工具栏）
  setTitle(titleEl, val, toolbar, article, onDirty) {
    if (titleEl) {
      titleEl.textContent = val || '未命名文章';
    }
    if (onDirty) onDirty();
    if (toolbar) {
      toolbar.updateInfo(val, article ? (article.category || '未分类') : '');
    }
  },

  // 获取当前编辑后的内容（HTML）
  // 顺带移除空段落与「（空内容）」占位：它们是渲染期产物，不应写入存档
  getContentHTML(contentEl) {
    if (!contentEl) return '';
    let html = contentEl.innerHTML;

    html = html.replace(/<p[^>]*>\s*（空内容）\s*<\/p>/g, '');
    html = html.replace(/<p[^>]*>\s*<\/p>/g, '');

    return html.trim();
  },

  // 构建保存用的内容
  // 数据驱动流程：先收集贴纸锚点 → 剥离贴纸 DOM 与旧标记得到纯内容 → 按锚点重新插入标记
  // 顺序不可颠倒：锚点计算依赖完整 DOM 结构，剥离后再算会全部落到默认位置
  buildSaveContent(contentEl, article) {
    if (!contentEl) return '';

    const stickersWithAnchor = this.collectStickersWithAnchor(contentEl, article);
    console.log('[EditorContent.buildSaveContent] 收集到 ' + stickersWithAnchor.length +
                ' 张贴纸（含锚点）| decoIds=' + stickersWithAnchor.map(function(s){return s.decoId;}).join(','));

    let html = this.getContentHTML(contentEl);
    html = StickerRenderer.stripStickerDivs(html);
    html = StickerRenderer.stripMarkers(html);

    const result = ContentBuilder.build(html, stickersWithAnchor);

    console.log('[EditorContent.buildSaveContent] 构建完成 | stickers=' + stickersWithAnchor.length +
                ' | 输出 len=' + result.length +
                ' | head80=' + JSON.stringify(result.substring(0, 80)));
    return result.trim();
  },

  // 从 DOM 收集贴纸数据（含锚点）
  // 必须在剥离贴纸 div 之前调用，否则锚点计算会失去 DOM 依据
  collectStickersWithAnchor: function (container, article) {
    if (!container) return [];
    const result = [];
    const els = container.querySelectorAll('.article-sticker');
    if (!els.length) return result;

    const stickerMap = {};
    const existing = article ? (article.stickers || []) : [];
    existing.forEach(function (s) { if (s && s.decoId) stickerMap[s.decoId] = s; });

    els.forEach(function (el) {
      const decoId = el.dataset.decoId;
      if (!decoId) return;

      const existingData = stickerMap[decoId] || {};

      // 锚点优先取贴纸编辑器保存过的值（基于覆盖层中的真实位置），
      // 缺省或为默认锚点时才回退到按主编辑器 DOM 现算
      let anchor = existingData.anchor;
      let anchorSource = 'none';
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

      const width = parseFloat(el.style.width) ||
                  existingData.width || existingData.w ||
                  StickerShape.DEFAULT_SIZE;
      const height = parseFloat(el.style.height) ||
                   existingData.height || existingData.h ||
                   StickerShape.DEFAULT_SIZE;
      let align = existingData.align || 'left';
      const margin = existingData.margin !== undefined
                   ? existingData.margin
                   : StickerShape.DEFAULT_MARGIN;

      // 已有数据无 align 时向 DOM 补取：用户可能只拖拽调整过浮动方向
      const floatVal = el.style.float;
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

  // 从文章内容解析贴纸标记（用于刷新后恢复贴纸数据）
  // y 缺省时按已解析数量递增 DEFAULT_GAP：多个无坐标贴纸都用默认值会完全重叠
  parseStickersFromContent(content) {
    const stickers = [];
    if (!content) return stickers;
    const regex = StickerRenderer._MARKER_REGEX;
    // 复位共享正则状态：该正则为模块级单例，上次使用可能残留 lastIndex
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(content)) !== null) {
      const fields = AnchorManager.parseFromMarker(match[1]);
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
        // 旧标记无 anchor 字段时默认末尾，保证历史数据可用
        anchor: fields.anchor || { type: 'end', index: -1 },
      });
    }
    console.log('[EditorContent.parseStickersFromContent] 解析到 ' + stickers.length + ' 张贴纸 | decoIds=' + stickers.map(function(s){return s.decoId;}).join(','));
    return stickers;
  },

  // 检测是否有实际修改（对比快照）
  // 快照的 content 可能含贴纸标记而当前 DOM 不含，故两侧都先剥离标记再比较，否则会恒判为已修改
  hasChanges(snapshot, titleEl, contentEl, article, dirty) {
    if (!snapshot) return dirty;

    const currentTitle = this.getTitle(titleEl);
    const currentContent = this.getContentHTML(contentEl);
    const currentStickers = article ? (article.stickers || []) : [];

    const snapshotContent = StickerRenderer.stripMarkers(snapshot.content || '');
    const cleanContent = StickerRenderer.stripMarkers(currentContent || '');

    return currentTitle !== snapshot.title ||
           cleanContent !== snapshotContent ||
           JSON.stringify(currentStickers) !== JSON.stringify(snapshot.stickers || []);
  },
};
