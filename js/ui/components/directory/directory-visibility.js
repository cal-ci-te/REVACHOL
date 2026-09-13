// ！目录可见性切换
// 目录节点上的「访客可见」开关：调用 Store 切换后刷新按钮图标，并为不可见节点补「(访客不可见)」标注。
import { ArticleListStore } from '../../../stores/article-list-store.js';
import { Utils } from '../../../utils.js';

// 切换节点可见性
export async function handleVisibilityToggle(e, onSuccess) {
    const { id, btn } = e.detail;
    const currentVisible = btn.dataset.visible === 'true';
    const newVisible = !currentVisible;
    const success = await ArticleListStore.setVisibility(id, newVisible);
    if (success) {
        btn.dataset.visible = newVisible;
        const visEl = btn.querySelector('.icon-pack-visibility');
        if (visEl) {
            visEl.textContent = newVisible ? '👁️' : '🚫';
        } else {
            btn.textContent = newVisible ? '👁️' : '🚫';
        }
        btn.style.color = newVisible ? 'var(--color-success)' : 'var(--color-border)';
        const parentContent = btn.closest('.tree-node-content');
        const titleSpan = parentContent.querySelector('.node-title');
        // 标注按文本内容识别而非专有类名：标注元素是动态插入的，没有稳定的 class 可依赖
        const oldAnnot = parentContent.querySelector('.tree-node-content > span:last-child');
        if (oldAnnot && oldAnnot.textContent === '(访客不可见)') {
            oldAnnot.remove();
        }
        if (!newVisible) {
            const annot = document.createElement('span');
            annot.style.cssText = 'font-size:9px;color:var(--color-text-muted);margin-left:6px;';
            annot.textContent = '(访客不可见)';
            titleSpan.after(annot);
        }
        if (onSuccess) onSuccess();
    }
    return success;
}