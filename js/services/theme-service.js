// 预加载三套主题 CSS，通过 disabled toggle 零网络请求即时切换。
// 三套主题的颜色值差异过大，使用变量回退的调试成本高于维护独立文件。
import { Utils } from '../utils.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { Texture } from './texture.js';
import { ContextMenu } from '../admin/events/context-menu.js';

const THEMES = {
    dark: {
        id: 'dark',
        name: '暗色',
        icon: '🌙',
        cssFile: '/css/themes/dark.css',
        isDefault: true,
        puzzleBg: '#1a1612',   // 拼图缺省背景色
    },
    light: {
        id: 'light',
        name: '亮色',
        icon: '☀️',
        cssFile: '/css/themes/light.css',
        isDefault: false,
        puzzleBg: '#f5f0eb',
    },
    lofi: {
        id: 'lofi',
        name: '低保真',
        icon: '📼',
        cssFile: '/css/themes/lofi.css',
        isDefault: false,
        puzzleBg: '#fdf6e3',
    },
};

const STORAGE_KEY = 'selected_theme';
let currentTheme = 'dark';

export const ThemeService = {
    getThemes() {
        return Object.keys(THEMES).map(key => ({ ...THEMES[key] }));
    },

    getCurrentTheme() {
        return currentTheme;
    },

    getThemeInfo(themeId) {
        return THEMES[themeId] || THEMES.dark;
    },

    /** 获取拼图组件的缺省背景色（根据当前主题返回纯色） */
    getPuzzleBackground() {
        const theme = THEMES[currentTheme] || THEMES.dark;
        return theme.puzzleBg || '#1a1612';
    },

    loadTheme() {
        const saved = Utils.storage.get(STORAGE_KEY);
        const themeId = (saved && THEMES[saved]) ? saved : 'dark';
        this._syncLinkWithTheme(themeId);
        this.applyTheme(themeId, true);
        console.log('[ThemeService] 加载主题:', themeId);
    },

    /**
     * 切换激活的主题 CSS link（预加载三套，切换仅 toggle disabled 属性，零网络请求）。
     * 替代旧版动态创建/销毁 <link> 的方案，消除 @import 链异步加载导致的变量缺失。
     */
    _switchThemeLink(themeId) {
        const ids = ['dark', 'light', 'lofi'];
        ids.forEach(id => {
            const link = document.getElementById('theme-stylesheet-' + id);
            if (link) link.disabled = (id !== themeId);
        });
    },

    /**
     * 页面初始加载时同步：确保 HTML 中预加载的 disabled 状态与保存的主题一致。
     * 若 HTML 中的 link 尚未就绪（极少情况），回退到手动切换。
     */
    _syncLinkWithTheme(themeId) {
        const activeLink = document.getElementById('theme-stylesheet-' + themeId);
        if (activeLink) {
            this._switchThemeLink(themeId);
        } else {
            // HTML link 尚未就绪，先加载 CSS 文件再等 DOM 就绪后切换
            this._preloadThemeCSS(themeId);
            const self = this;
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function () {
                    self._switchThemeLink(themeId);
                });
            } else {
                self._switchThemeLink(themeId);
            }
        }
    },

    /** 回退方案：动态注入未预加载的 CSS link（仅在 HTML link 缺失时使用） */
    _preloadThemeCSS(themeId) {
        const ids = ['dark', 'light', 'lofi'];
        ids.forEach(id => {
            if (!document.getElementById('theme-stylesheet-' + id)) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = THEMES[id].cssFile;
                link.id = 'theme-stylesheet-' + id;
                link.disabled = (id !== themeId);
                document.head.appendChild(link);
            }
        });
    },

    applyTheme(themeId, isRestore = false) {
        if (!THEMES[themeId]) {
            console.warn('[ThemeService] 主题不存在:', themeId);
            return;
        }

        currentTheme = themeId;
        const theme = THEMES[themeId];
        this._switchFavicon(themeId);

        // 切换激活的 CSS link（disabled toggle，零网络请求）
        this._switchThemeLink(themeId);

        // 保存偏好
        Utils.storage.set(STORAGE_KEY, themeId);

        // 设置 data-theme
        if (themeId === 'lofi') {
            document.documentElement.setAttribute('data-theme', 'lofi');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // 清除内联背景样式，让 CSS 控制
        document.body.style.background = '';
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = '';
        document.body.style.backgroundBlendMode = '';

        // 通知 Texture 进入主题模式
        if (Texture && typeof Texture.setThemeMode === 'function') {
            Texture.setThemeMode(true);
        }

        // 通知主题变更
        EventBus.emit(EVENTS.THEME_CHANGED, { themeId, theme, isRestore });

        // 跨页面同步：通知文章编辑器等其它标签页
        try {
          const channel = new BroadcastChannel('revachol');
          channel.postMessage({ type: 'theme_changed', payload: { themeId } });
          channel.close();
        } catch (e) { /* BroadcastChannel 不支持 */ }

        // 更新管理面板中的按钮状态
        this._updateThemeButtons(themeId);

        setTimeout(() => {
            // 刷新目录树
            const uiDirectory = window.__REVACHOL__ && window.__REVACHOL__.UIDirectory;
            if (uiDirectory && typeof uiDirectory.updateTree === 'function') {
                uiDirectory.updateTree(uiDirectory.filterKeyword || null);
                console.log('[ThemeService] 目录树已刷新');
            }

            // 重新初始化右键菜单
            if (ContextMenu && typeof ContextMenu.init === 'function') {
                ContextMenu.init();
                console.log('[ThemeService] 右键菜单已重新初始化');
            }
        }, 150);

        console.log('[ThemeService] 应用主题:', theme.name);
    },

    switchTheme(themeId) {
        if (themeId === currentTheme) {
            console.log('[ThemeService] 已经是当前主题');
            return;
        }
        this.applyTheme(themeId, false);
    },

    _switchFavicon(themeId) {
        // 移除旧 favicon
        document.querySelectorAll('link[rel="icon"]').forEach(el => el.remove());
        const ts = Date.now();
        const base = `/themes/${themeId}`;
        [ { href: `${base}/favicon.ico`, type: 'image/x-icon', sizes: '' },
          { href: `${base}/favicon-32x32.png`, type: 'image/png', sizes: '32x32' } ]
            .forEach(cfg => {
                const link = document.createElement('link');
                link.rel = 'icon';
                link.type = cfg.type;
                link.href = `${cfg.href}?t=${ts}`;
                if (cfg.sizes) link.sizes = cfg.sizes;
                document.head.appendChild(link);
            });
    },


    _updateThemeButtons(themeId) {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            const isActive = btn.dataset.theme === themeId;
            btn.style.opacity = isActive ? '1' : '0.5';
            btn.style.borderColor = isActive ? '#c47a44' : '';
            btn.style.boxShadow = isActive ? '0 0 12px rgba(196, 122, 68, 0.3)' : '';
        });
    },

    init() {
        // 确保 Texture 进入主题模式
        if (Texture && typeof Texture.setThemeMode === 'function') {
            Texture.setThemeMode(true);
        }
        this.loadTheme();
        console.log('[ThemeService] 初始化完成');
    },
};