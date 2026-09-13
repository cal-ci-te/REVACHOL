// ！编辑器全屏覆盖层
// 创建文章编辑器的全屏覆盖层 DOM，并按需注入其样式表。
// 纯 DOM 结构创建，无业务逻辑，不依赖主控模块。

export const EditorOverlay = {

  _cssInjected: false,

  // 确保编辑器样式表已注入 head
  // 同时检查标记与 DOM 中的 link：前者可能因热更新重置而失真，后者是最终依据
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

  // 创建全屏覆盖层及其子元素
  // 布局刻意与阅读页对齐（顶栏 36px、容器 padding 24px 32px），使编辑与阅读观感一致
  // 尺寸与内边距全部用内联样式：覆盖层样式需在样式表加载完成前即可生效
  create() {
    const overlay = document.createElement('div');
    overlay.id = 'article-editor-overlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:9999', 'background:var(--color-bg-primary, #1a1612)',
      'overflow-y:auto', 'overflow-x:hidden',
    ].join(';');
    document.body.appendChild(overlay);

    // 顶栏占位条：与阅读页 .detail-topbar 同高同色，避免切换时页面跳动
    const topbar = document.createElement('div');
    topbar.id = 'article-editor-topbar';
    topbar.textContent = '文章编辑';
    overlay.appendChild(topbar);

    // 文章容器：overflow 保持 visible，否则绝对定位的贴纸会被裁剪在容器外
    const articleContainer = document.createElement('div');
    articleContainer.id = 'article-editor-article';
    articleContainer.style.cssText = [
      'padding:24px 32px', 'position:relative', 'overflow:visible',
      'box-sizing:border-box', 'min-height:100%',
    ].join(';');
    overlay.appendChild(articleContainer);

    return { overlay: overlay, topbar: topbar, articleContainer: articleContainer };
  },

  // 移除覆盖层 DOM
  destroy(overlay) {
    if (overlay) {
      overlay.remove();
    }
  },
};
