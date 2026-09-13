// ！主题切换
// 预加载三套主题 CSS，通过 disabled toggle 零网络请求即时切换。
// 选择 disabled toggle 而非动态创建/销毁 <link>：消除 @import 链异步加载导致的变量缺失。
// 选择三套独立 CSS 文件而非变量回退：三套主题的颜色值差异过大，统一变量表的调试成本高于维护独立文件。

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
        puzzleBg: '#1a1612',
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
    // 获取主题列表
    getThemes() {
        return Object.keys(THEMES).map(key => ({ ...THEMES[key] }));
    },

    // 获取当前主题
    getCurrentTheme() {
        return currentTheme;
    },

    // 获取主题信息
    getThemeInfo(themeId) {
        return THEMES[themeId] || THEMES.dark;
    },

    // 获取拼图缺省背景色（按当前主题返回纯色）
    getPuzzleBackground() {
        const theme = THEMES[currentTheme] || THEMES.dark;
        return theme.puzzleBg || '#1a1612';
    },

    // 载入已保存主题
    loadTheme() {
        const saved = Utils.storage.get(STORAGE_KEY);
        const themeId = (saved && THEMES[saved]) ? saved : 'dark';
        this._syncLinkWithTheme(themeId);
        this.applyTheme(themeId, true);
        console.log('[ThemeService] 加载主题:', themeId);
    },

    // 切换激活的主题 CSS link
    // 仅 toggle disabled：预加载的三套 link 都在 DOM 中，切换不发请求、不重排样式表
    _switchThemeLink(themeId) {
        const ids = ['dark', 'light', 'lofi'];
        ids.forEach(id => {
            const link = document.getElementById('theme-stylesheet-' + id);
            if (link) link.disabled = (id !== themeId);
        });
    },

    // 同步预加载 link 的 disabled 状态
    // HTML 中 link 尚未就绪时回退手动切换：极少数首屏竞态下仍能拿到正确主题
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

    // 动态注入缺失的主题 CSS link
    // 仅在 HTML 预加载 link 缺失时兜底
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

        this._switchThemeLink(themeId);

        Utils.storage.set(STORAGE_KEY, themeId);

        if (themeId === 'lofi') {
            document.documentElement.setAttribute('data-theme', 'lofi');
        } else {
            document.documentElement.removeAttribute('data-theme');
        }

        // 清空内联背景样式：主题模式下背景完全交给 CSS，残留内联样式会覆盖主题色
        document.body.style.background = '';
        document.body.style.backgroundColor = '';
        document.body.style.backgroundImage = '';
        document.body.style.backgroundBlendMode = '';

        // 通知 Texture 让位给 CSS
        if (Texture && typeof Texture.setThemeMode === 'function') {
            Texture.setThemeMode(true);
        }

        EventBus.emit(EVENTS.THEME_CHANGED, { themeId, theme, isRestore });

        // 跨标签页同步：文章编辑器等独立页面无法接收 EventBus，走 BroadcastChannel
        try {
          const channel = new BroadcastChannel('revachol');
          channel.postMessage({ type: 'theme_changed', payload: { themeId } });
          channel.close();
        } catch (e) {
          // 忽略：旧浏览器不支持 BroadcastChannel，跨页同步降级为失效
        }

        this._updateThemeButtons(themeId);

        // 延迟 150ms：等 CSS 变量切换完成后再重建依赖主题的 UI，避免读到旧色值
        setTimeout(() => {
            const uiDirectory = window.__REVACHOL__ && window.__REVACHOL__.UIDirectory;
            if (uiDirectory && typeof uiDirectory.updateTree === 'function') {
                uiDirectory.updateTree(uiDirectory.filterKeyword || null);
                console.log('[ThemeService] 目录树已刷新');
            }

            // 右键菜单绑定的是旧主题下的 DOM，需重新初始化
            if (ContextMenu && typeof ContextMenu.init === 'function') {
                ContextMenu.init();
                console.log('[ThemeService] 右键菜单已重新初始化');
            }
        }, 150);

        console.log('[ThemeService] 应用主题:', theme.name);
    },

    // 切换主题
    switchTheme(themeId) {
        // 拦截重复点击：避免无谓的 DOM 重建与事件广播
        if (themeId === currentTheme) {
            console.log('[ThemeService] 已经是当前主题');
            return;
        }
        this.applyTheme(themeId, false);
    },

    // 切换 favicon
    // 带时间戳查询串：绕过浏览器 favicon 缓存，否则切主题后图标不更新
    _switchFavicon(themeId) {
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

    // 刷新主题按钮选中态
    _updateThemeButtons(themeId) {
        document.querySelectorAll('.theme-btn').forEach(btn => {
            const isActive = btn.dataset.theme === themeId;
            btn.style.opacity = isActive ? '1' : '0.5';
            btn.style.borderColor = isActive ? '#c47a44' : '';
            btn.style.boxShadow = isActive ? '0 0 12px rgba(196, 122, 68, 0.3)' : '';
        });
    },

    // 初始化
    init() {
        // 先进入主题模式：防止 Texture 自动加载时把用户自定义背景应用到 body，覆盖主题背景
        if (Texture && typeof Texture.setThemeMode === 'function') {
            Texture.setThemeMode(true);
        }
        this.loadTheme();
        console.log('[ThemeService] 初始化完成');
    },
};
