// ！贴纸编辑器覆盖层
// 创建全屏覆盖层 DOM、渲染文章内容并显示光标高亮脉冲。
// 与文章编辑器覆盖层结构一致（顶栏高度、容器内边距相同），使两个编辑模式的观感统一。
import { MarkdownUtils } from '../../utils/markdown-utils.js';

export const Overlay = {

  // 创建全屏覆盖层及其子元素
  // 文章容器 overflow 保持 visible：贴纸可拖到容器边缘外，裁剪会让其消失
  // 贴纸层用 absolute 且 pointer-events:none 兜底，具体成员元素自行开启事件
  create() {
    const overlay = document.createElement('div');
    overlay.id = 'sticker-editor-overlay';
    overlay.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'z-index:9999', 'background:var(--color-bg-primary, #1a1612)',
      'overflow-y:auto', 'overflow-x:hidden',
    ].join(';');
    document.body.appendChild(overlay);

    // 仅在点击遮罩本体时关闭：命中子元素说明用户仍在操作内容区
    // 关闭回调由主控在 create 之后注入，故此处只读 _onBlankClick
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        if (overlay._onBlankClick) overlay._onBlankClick();
      }
    });

    // 文章容器尺寸与阅读页 .detail-pane 完全一致（padding 24px 32px、全宽）
    const articleContainer = document.createElement('div');
    articleContainer.id = 'sticker-editor-article';
    articleContainer.style.cssText = [
      'padding:24px 32px', 'position:relative', 'overflow:visible',
      'box-sizing:border-box', 'min-height:100%',
    ].join(';');
    overlay.appendChild(articleContainer);

    const stickerLayer = document.createElement('div');
    stickerLayer.id = 'sticker-editor-layer';
    stickerLayer.style.cssText = [
      'position:absolute', 'top:0', 'left:0', 'width:100%', 'height:100%',
      'pointer-events:none', 'z-index:10',
    ].join(';');
    articleContainer.appendChild(stickerLayer);

    return { overlay: overlay, articleContainer: articleContainer, stickerLayer: stickerLayer };
  },

  // 渲染文章标题与内容
  // 标题样式与阅读页、文章编辑器保持一致，避免切换模式时标题栏跳动
  renderArticle(article, container) {
    const titleEl = document.createElement('h1');
    titleEl.style.cssText = [
      'color:var(--color-text-heading, #e8c88a)',
      'font-size:28px', 'margin:0 0 8px', 'padding-bottom:16px',
      'border-bottom:1px solid var(--color-border, #5a3e2b)',
      'font-family:var(--font-family-serif, Georgia, serif)',
    ].join(';');
    titleEl.textContent = article.title || '未命名文章';
    container.appendChild(titleEl);

    const contentEl = document.createElement('div');
    contentEl.className = 'detail-body';
    contentEl.innerHTML = this.renderContent(article.content || '');
    container.appendChild(contentEl);
  },

  // 渲染内容：委托公共 Markdown 工具，避免两个编辑器各自实现一套
  renderContent(text) {
    return MarkdownUtils.toHTML(text);
  },

  // 显示光标高亮脉冲
  // 目的：从主题页点入时告知用户「刚才点在哪里」，脉冲 3 次后自动淡出移除
  // cursorY 为空表示非点击进入（如无光标来源），此时不显示
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

    // 先淡出再移除，避免元素突然消失；移除前判 parentNode，防止期间已被其他逻辑摘除
    setTimeout(function () {
      highlight.style.transition = 'opacity 0.5s';
      highlight.style.opacity = '0';
      setTimeout(function () {
        if (highlight.parentNode) highlight.parentNode.removeChild(highlight);
      }, 500);
    }, 2000);
  },

  // 移除覆盖层 DOM
  destroy(overlay) {
    if (overlay) overlay.remove();
  },
};
