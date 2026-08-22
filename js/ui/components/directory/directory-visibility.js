import { ArticleListStore } from '../../../stores/article-list-store.js';
import { Utils } from '../../../utils.js';

/**
 * 处理可见性切换事件
 * @param {Event} e - 自定义事件，包含 { id, btn }
 * @param {Function} onSuccess - 切换成功后的回调
 */
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