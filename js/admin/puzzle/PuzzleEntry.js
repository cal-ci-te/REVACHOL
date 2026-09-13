// ！拼图自定义入口
// 管理面板中的拼图自定义入口：打开自定义面板的按钮加当前配置预览。
// 按钮通过 data-action 交由 ActionDelegator 派发，本模块只负责生成片段与预览。
import { AppState } from '../../core/app-state.js';
import { UI } from '../../utils/ui-strings.js';

// 生成 PuzzleEntry 的 HTML 片段，供 AdminPanel.renderContent 内联使用
// 移动端直接返回空串：拼图在窄屏为流式布局，没有尺寸与坐标可调
export function renderPuzzleEntry() {
    if (window.innerWidth <= 600) return '';

    const config = _getCurrentConfig();
    const preview = config
        ? `${config.width}×${config.height}`
        : '480×180';

    return `
        <div class="admin-control-group" style="border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 12px;">
            <label>${UI.puzzle.title}</label>
            <div class="admin-button-group" style="margin:6px 0;">
                <button id="openPuzzleCustomizerBtn" data-action="open-puzzle-customizer" style="background:var(--color-success);">
                    🧩 拼图自定义
                </button>
                <span id="puzzleConfigPreview" style="
                    font-family: 'Courier New', monospace;
                    font-size: 12px;
                    color: var(--color-text-muted);
                    padding: 6px 8px;
                    border: 1px solid var(--color-border);
                    border-radius: 4px;
                    background: var(--color-bg-tertiary);
                ">${preview}</span>
            </div>
            <input type="file" id="puzzleCustomizerFileInput" accept="image/*" style="display:none;">
            <div class="admin-avatar-hint">点击「拼图自定义」调整尺寸、位置、图片等参数</div>
        </div>`;
}

// 更新配置预览文字
// 配置缺失时回落默认尺寸文案，与 renderPuzzleEntry 的口径一致
export function updatePuzzlePreview() {
    const el = document.getElementById('puzzleConfigPreview');
    if (!el) return;
    const config = _getCurrentConfig();
    el.textContent = config ? `${config.width}×${config.height}` : '480×180';
}

// 读当前拼图配置
// 折在 try 内取值：拼图实例未初始化时路径上任何一步都可能抛错，此处一律按未配置处理
function _getCurrentConfig() {
    try {
        const inst = window.__puzzleInstance;
        if (inst && typeof inst.getConfig === 'function') {
            return inst.getConfig();
        }
    } catch (e) {
        // 实例不可用，视为无配置
    }
    return null;
}

// 获取拼图实例引用
export function getPuzzleInstance() {
    return window.__puzzleInstance || null;
}
