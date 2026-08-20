/**
 * 编辑器全屏覆盖层 — DOM 结构创建 + CSS 动态注入。
 *
 * 纯 DOM 创建，无业务逻辑，不依赖主控模块。
 *
 * @module editor-overlay
 */

export const EditorOverlay = {

  _cssInjected: false,

  /**
   * 确保编辑器的 CSS 样式表已注入到 <head>。
   * 首次调用创建 <link> 标签，后续调用跳过。
   */
  ensureCSS() {
    if (this._cssInjected) return;
    let link = document.getElementById('article-editor-css');
    if (!link) {
      link = document.createElement('link');
      link.id = 'article-editor-css';
      link.rel = 'stylesheet';
      link.href = '/css/editor/article-editor.css';
      document.head.appendChild(link);
    }
    this._cssInjected = true;
    console.log('[EditorOverlay] CSS 已注入');
  },

  /**
   * 创建全屏覆盖层及其子元素。
   * 贴纸以 float + shape-outside 浮动元素直接插入内容流，不再需要独立贴纸层。
   * @returns {{ overlay, topbar, articleContainer }}
   */
  create() {
    // 全屏覆盖层 — 与 StickerEditorMode 完全一致的布局
    const overlay = document.createElement('div');
    overlay.id = 'article-editor-overlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:9999', 'background:var(--color-bg-primary, #1a1612)',
      'overflow-y:auto', 'overflow-x:hidden',
    ].join(';');
    document.body.appendChild(overlay);

    // 标签栏占位条 — 外观与阅读页 .detail-topbar 一致（36px，深色背景 + 底边框）
    const topbar = document.createElement('div');
    topbar.id = 'article-editor-topbar';
    topbar.textContent = '文章编辑';
    overlay.appendChild(topbar);

    // 文章容器 — 完全匹配阅读页 .detail-pane（padding 24px 32px）
    const articleContainer = document.createElement('div');
    articleContainer.id = 'article-editor-article';
    articleContainer.style.cssText = [
      'padding:24px 32px', 'position:relative', 'overflow:visible',
      'box-sizing:border-box', 'min-height:100%',
    ].join(';');
    overlay.appendChild(articleContainer);

    return { overlay: overlay, topbar: topbar, articleContainer: articleContainer };
  },

  /**
   * 移除覆盖层 DOM。
   * @param {HTMLElement} overlay
   */
  destroy(overlay) {
    if (overlay) {
      overlay.remove();
    }
  },
};
