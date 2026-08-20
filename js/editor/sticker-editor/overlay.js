/**
 * 贴纸编辑器覆盖层 — 全屏 DOM 结构 + 文章渲染 + 光标高亮。
 *
 * @module sticker-editor/overlay
 */

import { MarkdownUtils } from '../../utils/markdown-utils.js';

export const Overlay = {

  /**
   * 创建全屏覆盖层及其子元素。
   * @returns {{ overlay, articleContainer, stickerLayer }}
   */
  create() {
    // 遮罩层
    const overlay = document.createElement('div');
    overlay.id = 'sticker-editor-overlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:9999', 'background:var(--color-bg-primary, #1a1612)',
      'overflow-y:auto', 'overflow-x:hidden',
    ].join(';');
    document.body.appendChild(overlay);

    // 点击空白区关闭
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        // 由主控在 create 后注入 close 回调
        if (overlay._onBlankClick) overlay._onBlankClick();
      }
    });

    // 文章容器 — 与文章编辑页/阅读页 .detail-pane 容器尺寸完全一致（padding 24px 32px，全宽）
    const articleContainer = document.createElement('div');
    articleContainer.id = 'sticker-editor-article';
    articleContainer.style.cssText = [
      'padding:24px 32px', 'position:relative', 'overflow:visible',
      'box-sizing:border-box', 'min-height:100%',
    ].join(';');
    overlay.appendChild(articleContainer);

    // 贴纸层
    const stickerLayer = document.createElement('div');
    stickerLayer.id = 'sticker-editor-layer';
    stickerLayer.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:10',
    ].join(';');
    articleContainer.appendChild(stickerLayer);

    return { overlay: overlay, articleContainer: articleContainer, stickerLayer: stickerLayer };
  },

  /**
   * 渲染文章的标题和内容。
   * @param {object} article
   * @param {HTMLElement} container - articleContainer
   */
  renderArticle(article, container) {
    // 标题
    const titleEl = document.createElement('h1');
    titleEl.style.cssText = [
      'color:var(--color-text-heading, #e8c88a)',
      'font-size:28px', 'margin:0 0 8px', 'padding-bottom:16px',
      'border-bottom:1px solid var(--color-border, #5a3e2b)',
      'font-family:var(--font-family-serif, Georgia, serif)',
    ].join(';');
    titleEl.textContent = article.title || '未命名文章';
    container.appendChild(titleEl);

    // 内容 — 与 UIDetail.renderContent 完全一致的处理
    const contentEl = document.createElement('div');
    contentEl.className = 'detail-body';
    contentEl.innerHTML = this.renderContent(article.content || '');
    container.appendChild(contentEl);
  },

  /**
   * 委托给公共 Markdown 工具（避免两个编辑器重复实现）。
   */
  renderContent(text) {
    return MarkdownUtils.toHTML(text);
  },

  /**
   * 显示光标高亮脉冲动画。
   * @param {HTMLElement} container - articleContainer
   * @param {number} cursorY - 主题页面中的 Y 坐标
   */
  showCursorHighlight(container, cursorY) {
    if (cursorY == null) return;

    const highlight = document.createElement('div');
    highlight.style.cssText = [
      'position:absolute', 'left:50%', 'top:' + cursorY + 'px',
      'transform:translate(-50%, -50%)',
      'width:60px', 'height:60px', 'border-radius:50%',
      'border:3px solid var(--color-accent, #c47a44)',
      'box-shadow:0 0 30px var(--color-accent, #c47a44)',
      'z-index:5', 'pointer-events:none',
      'animation:sticker-cursor-pulse 0.8s ease-out 3',
    ].join(';');
    container.appendChild(highlight);

    setTimeout(function () {
      highlight.style.transition = 'opacity 0.5s';
      highlight.style.opacity = '0';
      setTimeout(function () {
        if (highlight.parentNode) highlight.parentNode.removeChild(highlight);
      }, 500);
    }, 2000);
  },

  /**
   * 移除覆盖层 DOM。
   */
  destroy(overlay) {
    if (overlay) overlay.remove();
  },
};
