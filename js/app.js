// 应用入口。无框架依赖——使用自研 AppState（类 Vuex）+ EventBus 实现单向数据流。
// 模块初始化顺序通过 AppInitializer 拓扑排序保证依赖关系。
import { CONFIG } from './config.js';
import { Utils } from './utils.js';
import { DOMRefs } from './core/dom-refs.js';
import { EventBus } from './core/event-bus.js';
import { AppState } from './core/app-state.js';
import { MUTATIONS } from './core/state-mutations.js';
import { EVENTS } from './core/event-constants.js';
import { ApiClient } from './services/api-client.js';
import { UI } from './utils/ui-strings.js';

import { injectUITexts } from './bootstrap/ui-injector.js';
import { registerAllModules, AppInitializer } from './bootstrap/module-registry.js';
import { setupBroadcastChannel } from './bootstrap/broadcast-setup.js';
import { SiteIcon } from './services/site-icon.js';
import { DirectoryIcon } from './services/directory-icon.js';
import { UIIcon } from './services/ui-icon.js';

import { Article } from './models/article-model.js';
import { ArticleService } from './services/article-service.js';
import { DecoShelf } from './services/deco.js';
import { DecoShelfUI } from './ui/components/deco-ui.js';
import { HeroBackground } from './services/hero-background.js';
import { Admin } from './admin/index.js';
import { UIController } from './ui/ui-controller.js';
import { UIDirectory } from './ui/components/directory/index.js';
import { ContextMenu } from './admin/events/context-menu.js';
import { ThemeService } from './services/theme-service.js';
import { Texture } from './services/texture.js';
import { initPuzzle } from './puzzle/Puzzle.js';
import { initMagicBox } from './ui/components/magic-box/index.js';
import { StickerShape } from './editor/sticker-shape.js';
import { HealthMonitor } from './services/health-monitor.js';
import { ArticleEditorMode } from './editor/article-editor-mode.js';

// 组件统一管理系统
import { ComponentManager } from './core/component-manager.js';
import { decoComponent } from './components/deco-component.js';
import { puzzleComponent } from './components/puzzle-component.js';
import { magicBoxComponent } from './components/magic-box-component.js';
import { healthComponent } from './components/health-component.js';

console.log('🚀 [app] ES Module 入口已加载');

const APP_START_TIME = Date.now();
const MIN_LOADER_DISPLAY = 300;

// 加载期间锁定页面滚动（与详情页一致：html + body 双重锁定）
document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

function hideLoader() {
    const loader = document.getElementById('heartbeat-loader');
    if (!loader) return;
    loader.style.opacity = '0';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.classList.add('loaded');
    setTimeout(() => { loader.style.display = 'none'; }, 600);
}

// 兜底：10 秒后强制隐藏（加载失败场景）
setTimeout(() => {
    const loader = document.getElementById('heartbeat-loader');
    if (loader && loader.style.display !== 'none') hideLoader();
}, 10000);

injectUITexts();

// ApiClient 响应拦截器：自动注入 Auth Token，401 时通知所有模块刷新 UI
ApiClient.useRequestInterceptor((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.options.headers = { ...config.options.headers, 'Authorization': `Bearer ${token}` };
    }
    return config;
});
ApiClient.useResponseInterceptor(
    (data) => data,
    async (error) => {
        if (error.status === 401) EventBus.emit(EVENTS.AUTH_UNAUTHORIZED);
        return Promise.reject(error);
    }
);

// 401 响应 → 自动清理过期 Token 并退回访客模式
EventBus.on(EVENTS.AUTH_UNAUTHORIZED, () => {
    console.log('[app] 收到 401，Token 已过期或无效，自动登出');
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('admin_logged_in'); // 清理 v1.9 旧标记
    AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
    EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
});

registerAllModules();

// 页面刷新时从 localStorage 恢复登录状态（Token 仍有效则视为已登录）
if (localStorage.getItem('auth_token')) {
    AppState.commit(MUTATIONS.SET_LOGGED_IN, true);
    console.log('[app] 检测到 auth_token，恢复登录状态');
}

AppInitializer.start();
setupBroadcastChannel();

if (Texture && typeof Texture.setThemeMode === 'function') {
    Texture.setThemeMode(true);
}
ThemeService.init();

// 贴纸右键菜单需要 DecoShelf 加载完成后才能获取贴纸数据，延迟 200ms 确保 DecoShelf.loadLibrary 完成
setTimeout(() => {
    if (ContextMenu && typeof ContextMenu.init === 'function') {
        ContextMenu.init();
    }
}, 200);

function setupPositionModeControls() {
    const controls = document.getElementById('positionModeControls');
    let enterBtn = document.getElementById('enterPositionModeBtn');
    let saveBtn = document.getElementById('savePositionChangesBtn');
    let cancelBtn = document.getElementById('cancelPositionChangesBtn');

    if (!controls || !enterBtn || !saveBtn || !cancelBtn) return;

    // 使用 cloneNode 移除旧事件监听，防止 HMR 热更新导致重复绑定
    function bindSafeEvent(el, handler) {
        if (!el) return;
        const cloned = el.cloneNode(true);
        el.parentNode.replaceChild(cloned, el);
        if (el === enterBtn) enterBtn = cloned;
        if (el === saveBtn) saveBtn = cloned;
        if (el === cancelBtn) cancelBtn = cloned;
        cloned.addEventListener('click', handler);
        cloned.addEventListener('touchstart', function(e) {
            if (!this._touchHandled) {
                this._touchHandled = true;
                handler(e);
                setTimeout(() => { this._touchHandled = false; }, 300);
            }
        }, { passive: false });
        return cloned;
    }

    const updateVisibility = (isLoggedIn) => {
        controls.style.display = isLoggedIn ? 'block' : 'none';
        if (!isLoggedIn) {
            EventBus.emit(EVENTS.ADMIN_POSITION_MODE_EXIT);
            enterBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            const hint = controls.querySelector('.pos-hint');
            if (hint) hint.remove();
        } else {
            enterBtn.style.display = 'inline-block';
            saveBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
        }
    };

    EventBus.on(EVENTS.AUTH_LOGGED_IN, () => updateVisibility(true));
    EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => updateVisibility(false));

    enterBtn = bindSafeEvent(enterBtn, function(e) {
        e.preventDefault();
        EventBus.emit(EVENTS.ADMIN_POSITION_MODE_ENTER);
        enterBtn.style.display = 'none';
        saveBtn.style.display = 'inline-block';
        cancelBtn.style.display = 'inline-block';
        if (!controls.querySelector('.pos-hint')) {
            const hint = document.createElement('div');
            hint.className = 'pos-hint';
            hint.textContent = '💡 拖拽节点到目标位置，点击"保存更改"生效';
            controls.appendChild(hint);
        }
        Utils.showToast(UI.toast.positionModeEnter, false);
    });

    saveBtn = bindSafeEvent(saveBtn, function(e) {
        e.preventDefault();
        EventBus.emit(EVENTS.ADMIN_POSITION_MODE_EXIT);
        enterBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        const hint = controls.querySelector('.pos-hint');
        if (hint) hint.remove();
        Utils.showToast('位置更改已保存', false);
    });

    cancelBtn = bindSafeEvent(cancelBtn, function(e) {
        e.preventDefault();
        EventBus.emit(EVENTS.ADMIN_POSITION_MODE_CANCEL);
        enterBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        const hint = controls.querySelector('.pos-hint');
        if (hint) hint.remove();
    });

    saveBtn = bindSafeEvent(saveBtn, function(e) {
        e.preventDefault();
        EventBus.emit(EVENTS.ADMIN_POSITION_MODE_EXIT);
        enterBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        const hint = controls.querySelector('.pos-hint');
        if (hint) hint.remove();
        Utils.showToast(UI.toast.positionModeSaved, false);
    });

    cancelBtn = bindSafeEvent(cancelBtn, function(e) {
        e.preventDefault();
        EventBus.emit(EVENTS.ADMIN_POSITION_MODE_CANCEL);
        enterBtn.style.display = 'inline-block';
        saveBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        const hint = controls.querySelector('.pos-hint');
        if (hint) hint.remove();
    });

    const isLoggedIn = AppState.get('isLoggedIn');
    updateVisibility(isLoggedIn);
}

function setupLoginUI() {
    const loginTrigger = DOMRefs.get(DOMRefs.login.trigger);
    const modalOverlay = DOMRefs.get(DOMRefs.login.modal);
    const modalCloseBtn = DOMRefs.get(DOMRefs.login.closeBtn);
    const modalLoginBtn = DOMRefs.get(DOMRefs.login.loginBtn);
    const usernameInput = DOMRefs.get(DOMRefs.login.username);
    const passwordInput = DOMRefs.get(DOMRefs.login.password);

    if (loginTrigger) {
        loginTrigger.removeEventListener('click', loginTrigger._loginHandler);
        loginTrigger._loginHandler = function () {
            if (!Admin.isLoggedIn) {
                if (modalOverlay) modalOverlay.classList.add('active');
            }
        };
        loginTrigger.addEventListener('click', loginTrigger._loginHandler);
    }

    if (modalCloseBtn) {
        modalCloseBtn.removeEventListener('click', modalCloseBtn._closeHandler);
        modalCloseBtn._closeHandler = function () {
            if (modalOverlay) modalOverlay.classList.remove('active');
        };
        modalCloseBtn.addEventListener('click', modalCloseBtn._closeHandler);
    }

    if (modalOverlay) {
        modalOverlay.removeEventListener('click', modalOverlay._overlayHandler);
        modalOverlay._overlayHandler = function (e) {
            if (e.target === modalOverlay) modalOverlay.classList.remove('active');
        };
        modalOverlay.addEventListener('click', modalOverlay._overlayHandler);
    }

    if (modalLoginBtn) {
        modalLoginBtn.removeEventListener('click', modalLoginBtn._loginBtnHandler);
        modalLoginBtn._loginBtnHandler = function () {
            Admin.login(usernameInput ? usernameInput.value : '', passwordInput ? passwordInput.value : '');
        };
        modalLoginBtn.addEventListener('click', modalLoginBtn._loginBtnHandler);
    }

    if (passwordInput) {
        passwordInput.removeEventListener('keypress', passwordInput._keypressHandler);
        passwordInput._keypressHandler = function (e) {
            if (e.key === 'Enter') Admin.login(usernameInput ? usernameInput.value : '', passwordInput.value);
        };
        passwordInput.addEventListener('keypress', passwordInput._keypressHandler);
    }
}

function initializeApp() {
    setupPositionModeControls();
    setupLoginUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

// 暴露关键模块到全局，便于调试和模块间松耦合访问
// 收敛到 __REVACHOL__ 单命名空间，避免 14 个全局变量污染
window.__REVACHOL__ = {
  EventBus,
  AppState,
  EVENTS,
  UIController,
  Article,
  ArticleService,
  DecoShelf,
  DecoShelfUI,
  HeroBackground,
  Admin,
  Utils,
  DOMRefs,
  UIDirectory,
  DirectoryIcon,
  UIIcon,
  ThemeService,
  Texture,
  HealthMonitor,
  ComponentManager,
  ArticleEditorMode,
  StickerShape,
};

// 左上角工具栏：展开/收起切换
setTimeout(() => {
    const toolbar = document.getElementById('sideToolbar');
    const toggle = document.getElementById('toolbarToggle');
    if (toolbar && toggle) {
        toggle.addEventListener('click', () => {
            const isCollapsed = toolbar.classList.contains('collapsed');
            toolbar.classList.toggle('collapsed', !isCollapsed);
            toolbar.classList.toggle('expanded', isCollapsed);
            // 工具栏收起/展开后应用对应自定义图标
            UIIcon.applyToolbarIcons();
        });
        const helpBtn = toolbar.querySelector('[data-tool="help"]');
        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                const helpArticle = {
                    id: -1,
                    title: '📖 使用说明',
                    content: `## 欢迎来到 REVACHOL\n\n原创角色档案馆\n\n### 浏览角色\n\n点击左侧目录树中的文章或文件夹，跳转到对应卡片。\n\n### 阅读详情\n\n点击卡片打开标签页式阅读界面，支持多篇同时打开、最小化、全屏。\n\n### 主题切换\n\n管理员面板中可在 **暗色 / 亮色 / 低保真** 三种主题间切换。\n\n### 搜索\n\n侧边栏搜索框支持按关键字过滤目录树。\n\n### 管理员功能\n\n登录后可管理文章可见性、上传贴纸、自定义水印与背景。`
                };
                if (UIController && UIController.detail) {
                    UIController.detail.createTab(helpArticle);
                }
            });
        }
    }
}, 300);

// 自定义站点图标（通过 SiteIcon 服务初始化）
SiteIcon.init();
SiteIcon.playEntranceAnimation();

// 侧边栏目录自定义图标单例：应用已保存图标（上传控件已整合到管理员面板）
DirectoryIcon.init();

// 顶部工具栏 / 管理员控制台折叠按钮自定义图标
UIIcon.applyAll();

// =========================================================================
// 键盘快捷键：Ctrl+E → 编辑当前活跃文章
// =========================================================================
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    // 跳过在输入框/编辑器中的触发
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.contentEditable === 'true')) return;

    e.preventDefault();
    // 获取当前活跃的文章（来自详情标签页或目录选中）
    let activeId = null;
    if (UIController && UIController.detail && UIController.detail.activeId) {
      activeId = UIController.detail.activeId;
    }
    if (!activeId) {
      Utils.showToast('请先在目录树中选中一篇文章', false);
      return;
    }
    ArticleEditorMode.open(activeId);
  }
});

// =========================================================================
// 组件统一管理系统 — 注册 + 批量初始化 + 挂载
// 替代原有的 ad-hoc setTimeout 初始化，提供统一生命周期管理。
// =========================================================================
ComponentManager
  .register(decoComponent)
  .register(puzzleComponent)
  .register(magicBoxComponent)
  .register(healthComponent);

// 延迟初始化所有组件（等待 DOM + AppInitializer 完成）
setTimeout(async () => {
  console.log('[app] ComponentManager 开始批量初始化...');
  const initResult = await ComponentManager.initAll();
  console.log('[app] initAll 完成:', initResult);

  // 挂载所有已初始化的组件
  const mountResult = await ComponentManager.mountAll();
  console.log('[app] mountAll 完成:', mountResult);
  console.log('[app] 组件状态摘要:', ComponentManager.getSummary());
}, 300);

// 页面关闭前统一卸载所有组件
// 使用 sync 模式：浏览器在 beforeunload 中不保证等待 async 完成，
// 因此 unmountAll({ sync: true }) 用 fire-and-forget 方式调用清理钩子。
window.addEventListener('beforeunload', () => {
  console.log('[app] beforeunload: 正在同步卸载所有组件...');
  ComponentManager.unmountAll({ sync: true });
});

// 心跳加载动画隐藏——保证至少显示 400ms，配合 10s 超时兜底
const elapsed = Date.now() - APP_START_TIME;
setTimeout(hideLoader, Math.max(0, MIN_LOADER_DISPLAY - elapsed));
