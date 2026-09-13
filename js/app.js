// ！应用入口
// 无框架依赖的应用启动脚本：以自研 AppState（类 Vuex）+ EventBus 实现单向数据流。
// 模块初始化顺序由 AppInitializer 拓扑排序保证依赖关系，本文件只负责装配与启动。
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
import { IconPackService } from './services/icon-pack-service.js';
import { IconPackDoc } from './ui/components/icon-pack-doc.js';
import { initPuzzle } from './puzzle/Puzzle.js';
import { initMagicBox } from './ui/components/magic-box/index.js';
import { StickerShape } from './editor/sticker-shape.js';
import { HealthMonitor } from './services/health-monitor.js';
import { ArticleEditorMode } from './editor/article-editor-mode.js';

import { ComponentManager } from './core/component-manager.js';
import { decoComponent } from './components/deco-component.js';
import { puzzleComponent } from './components/puzzle-component.js';
import { magicBoxComponent } from './components/magic-box-component.js';
import { healthComponent } from './components/health-component.js';

console.log('🚀 [app] ES Module 入口已加载');

const APP_START_TIME = Date.now();
const MIN_LOADER_DISPLAY = 300;

// 加载期间锁定滚动：html 与 body 双重锁定，与详情页打开时的做法一致，
// 单独锁 body 在部分浏览器下仍可滚动 html
document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

// 隐藏心跳加载动画并解除滚动锁定
function hideLoader() {
    const loader = document.getElementById('heartbeat-loader');
    if (!loader) return;
    loader.style.opacity = '0';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
    document.body.classList.add('loaded');
    setTimeout(() => { loader.style.display = 'none'; }, 600);
}

// 兜底：10 秒后强制隐藏，覆盖模块加载失败导致 hideLoader 永不执行的场景
setTimeout(() => {
    const loader = document.getElementById('heartbeat-loader');
    if (loader && loader.style.display !== 'none') hideLoader();
}, 10000);

injectUITexts();

// 请求拦截器：统一附加 Auth Token，避免各调用点各自拼接请求头
ApiClient.useRequestInterceptor((config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
        config.options.headers = { ...config.options.headers, 'Authorization': `Bearer ${token}` };
    }
    return config;
});
// 响应拦截器：把 401 收敛为一个事件，由下方统一登出，调用方无须逐个处理登录失效
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
    // 清理 v1.9 遗留标记，避免旧版本写入的值让后续逻辑误判为已登录
    localStorage.removeItem('admin_logged_in');
    AppState.commit(MUTATIONS.SET_LOGGED_IN, false);
    EventBus.emit(EVENTS.AUTH_LOGGED_OUT);
});

registerAllModules();

// 页面刷新时从 localStorage 恢复登录状态（Token 仍有效则视为已登录）
// 仅作乐观恢复：真正的有效性由后端在首个需要鉴权的请求上校验，失败即经 401 路径登出
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

// 图标包服务：订阅主题/包变更并应用当前主题的生效包
IconPackService.init();

// 贴纸右键菜单依赖 DecoShelf 的贴纸数据，而 loadLibrary 为异步且无完成事件，
// 故延迟 200ms 让其在多数情况下先完成；即使未完成，菜单打开时会再取一次数据
setTimeout(() => {
    if (ContextMenu && typeof ContextMenu.init === 'function') {
        ContextMenu.init();
    }
}, 200);

// 装配位置模式控件：三个按钮由登录状态驱动显隐
function setupPositionModeControls() {
    const controls = document.getElementById('positionModeControls');
    let enterBtn = document.getElementById('enterPositionModeBtn');
    let saveBtn = document.getElementById('savePositionChangesBtn');
    let cancelBtn = document.getElementById('cancelPositionChangesBtn');

    if (!controls || !enterBtn || !saveBtn || !cancelBtn) return;

    // 用 cloneNode 重建元素以剥离旧监听，防止 HMR 热更新重复绑定导致一次点击多次触发
    // 同时兼容 click 与 touchstart：触摸端 click 有延迟，且部分设备不派发 click
    function bindSafeEvent(el, handler) {
        if (!el) return;
        const cloned = el.cloneNode(true);
        el.parentNode.replaceChild(cloned, el);
        if (el === enterBtn) enterBtn = cloned;
        if (el === saveBtn) saveBtn = cloned;
        if (el === cancelBtn) cancelBtn = cloned;
        cloned.addEventListener('click', handler);
        cloned.addEventListener('touchstart', function(e) {
            // 300ms 去重窗口：抑制同一次触碰随后补发的 click
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
            // 登出瞬间必须退出位置模式，否则拖拽态会残留在非管理员会话中
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

    // 覆盖前一对处理器：绑定顺序保持与历史一致，后者生效并带上 i18n 文案
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

// 装配登录弹窗交互
// 处理器一律存到元素的 _xxxHandler 属性上再移除旧引用：HMR 重跑本函数时才能摘掉上一次的监听
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
        // 只在点击遮罩本体时关闭：否则点击弹窗内容会冒泡到遮罩而误关
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

// 暴露关键模块到全局，便于调试与模块间松耦合访问
// 收敛到 __REVACHOL__ 单命名空间，避免十余个全局变量污染 window
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
  IconPackService,
  Texture,
  HealthMonitor,
  ComponentManager,
  ArticleEditorMode,
  StickerShape,
};

// 左上角工具栏：展开/收起切换
// 延迟 300ms 等待工具栏 DOM 就绪——其由外部模板注入，早于此绑定会取不到元素
setTimeout(() => {
    const toolbar = document.getElementById('sideToolbar');
    const toggle = document.getElementById('toolbarToggle');
    if (toolbar && toggle) {
        toggle.addEventListener('click', () => {
            const isCollapsed = toolbar.classList.contains('collapsed');
            toolbar.classList.toggle('collapsed', !isCollapsed);
            toolbar.classList.toggle('expanded', isCollapsed);
            // 收起/展开会改变可见图标集合，需重新套用自定义图标
            UIIcon.applyToolbarIcons();
        });
        const helpBtn = toolbar.querySelector('[data-tool="help"]');
        const iconPackBtn = toolbar.querySelector('[data-tool="icon-pack"]');

        if (helpBtn) {
            helpBtn.addEventListener('click', () => {
                // 使用说明是内置虚拟文章：id 取负数，避免与后端文章 id 冲突
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

        if (iconPackBtn) {
            iconPackBtn.addEventListener('click', () => {
                if (!UIController || !UIController.detail) return;
                // 与使用说明同为虚拟文章（id -2），先开标签页再渲染键名文档
                const article = { id: -2, title: UI.iconPack.docTitle, content: '' };
                UIController.detail.createTab(article);
                const pane = document.querySelector('#detailPanes .detail-pane[data-id="-2"]');
                const body = pane && pane.querySelector('.detail-body');
                if (body) IconPackDoc.render(body);
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

// 键盘快捷键：Ctrl+E 编辑当前活跃文章
document.addEventListener('keydown', function (e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
    // 在输入框或可编辑区域中不拦截，否则会抢走输入 'e' 的按键
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.contentEditable === 'true')) return;

    e.preventDefault();
    // 活跃文章取详情标签页；未打开详情时回退为空，提示用户先选中
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

// 组件统一管理系统：注册 + 批量初始化 + 挂载
// 替代原先分散的 setTimeout 初始化，由 ComponentManager 提供统一生命周期与错误隔离
ComponentManager
  .register(decoComponent)
  .register(puzzleComponent)
  .register(magicBoxComponent)
  .register(healthComponent);

// 延迟初始化所有组件，等待 DOM 与 AppInitializer 完成
setTimeout(async () => {
  console.log('[app] ComponentManager 开始批量初始化...');
  const initResult = await ComponentManager.initAll();
  console.log('[app] initAll 完成:', initResult);

  const mountResult = await ComponentManager.mountAll();
  console.log('[app] mountAll 完成:', mountResult);
  console.log('[app] 组件状态摘要:', ComponentManager.getSummary());
}, 300);

// 页面关闭前卸载所有组件
// 用 sync 模式：beforeunload 中浏览器不保证等待 async 完成，故以 fire-and-forget 方式调用清理钩子
window.addEventListener('beforeunload', () => {
  console.log('[app] beforeunload: 正在同步卸载所有组件...');
  ComponentManager.unmountAll({ sync: true });
});

// 心跳加载动画隐藏——保证至少显示 MIN_LOADER_DISPLAY，配合上方 10s 超时兜底
const elapsed = Date.now() - APP_START_TIME;
setTimeout(hideLoader, Math.max(0, MIN_LOADER_DISPLAY - elapsed));
