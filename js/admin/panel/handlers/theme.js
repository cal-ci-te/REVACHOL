// ！主题切换处理
// 面板内主题按钮的处理器：从事件目标向上找 data-theme 属性并交给 ThemeService。
import { ThemeService } from '../../../services/theme-service.js';

export function themeSwitchHandler(event) {
    // 用 closest 向上查找而非直接读 target：点击可能落在按钮内的图标等子元素上
    const btn = event.target.closest('[data-theme]');
    if (!btn) return;
    const themeId = btn.dataset.theme;
    if (themeId) {
        console.log('[ThemeHandler] 切换主题:', themeId);
        ThemeService.switchTheme(themeId);
    }
}