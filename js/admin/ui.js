// ！后台界面控制
// 管理面板的显隐、登录态文案与头像展示，并负责面板打开时的渲染编排。
// 只处理表现层，鉴权判断在 auth.js，本模块按传入的登录态渲染。
import { DOMRefs } from '../core/dom-refs.js';
import { AdminPosition } from './position.js';
import { AdminDrag } from './drag.js';
import { AdminPanel } from './panel/index.js';
import { AdminEvents } from './events/index.js';
import { UIController } from '../ui/ui-controller.js';
import { Utils } from '../utils.js';

export const AdminUI = {
  // 按登录态切换登录入口文案
  // 登出时把头像复位为默认图：否则会残留上一位登录者的头像
  updateLoginUI: function (isLoggedIn) {
    const loginLabel = DOMRefs.get(DOMRefs.login.label);
    const welcomeText = DOMRefs.get(DOMRefs.login.welcomeText);
    const loginAvatar = DOMRefs.get(DOMRefs.login.avatar);

    if (isLoggedIn) {
      if (loginLabel) loginLabel.textContent = '管理员';
      if (welcomeText) welcomeText.textContent = '欢迎管理员';
    } else {
      if (loginLabel) loginLabel.textContent = '登录';
      if (welcomeText) welcomeText.textContent = '欢迎访客';
      if (loginAvatar) loginAvatar.src = 'images/default-avatar.png';
    }
  },

  // 同步头像到登录入口与面板预览两处
  updateAvatarDisplay: function (dataUrl) {
    const loginAvatar = DOMRefs.get(DOMRefs.login.avatar);
    if (loginAvatar && dataUrl) {
      loginAvatar.src = dataUrl;
    }
    const adminPreview = DOMRefs.get(DOMRefs.adminControls.adminAvatarPreview);
    if (adminPreview && dataUrl) {
      adminPreview.src = dataUrl;
    }
  },

  // 显示面板并完成一次完整渲染
  // 先 unbindEvents 再重绑：面板内容每次都会重建，不先摘除旧委托会重复触发
  // 折叠按钮在 100ms 与 300ms 各绑一次，覆盖 render 内异步插入图标的两种时序
  showPanel: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    if (!panel) {
      console.warn('[AdminUI] adminPanel 元素不存在');
      return;
    }

    console.log('[AdminUI] 显示面板，开始渲染...');

    if (typeof AdminEvents !== 'undefined') {
      AdminEvents.unbindEvents();
    }

    panel.classList.remove('hidden');
    panel.classList.add('open');
    panel.style.display = 'block';
    AdminPosition.applyPosition();
    AdminPosition.applyCollapsedState();
    AdminDrag.initDrag();

    if (AdminPanel && AdminPanel.renderContent) {
      AdminPanel.renderContent();
      console.log('[AdminUI] renderContent 执行完成');
    } else {
      console.error('[AdminUI] AdminPanel.renderContent 不存在');
    }

    if (AdminPanel && AdminPanel._bindToggleIconDirect) {
      AdminPanel._bindToggleIconDirect();
      console.log('[AdminUI] 直接绑定折叠按钮完成');
    }

    setTimeout(function () {
      if (AdminEvents && AdminEvents.rebind) {
        AdminEvents.rebind();
        console.log('[AdminUI] AdminEvents.rebind 执行完成');
      }
    }, 100);

    setTimeout(function () {
      if (AdminPanel && AdminPanel._bindToggleIconDirect) {
        AdminPanel._bindToggleIconDirect();
        console.log('[AdminUI] 折叠按钮再次绑定（延迟）');
      }
    }, 300);

    // 刷新文章可见性列表：面板打开才需要展示，故延迟到渲染之后
    // 单独 try-catch：刷可见性属附加能力，失败不应阻断面板其余部分
    setTimeout(function () {
      if (UIController && typeof UIController.refreshDisplay === 'function') {
        try {
          UIController.refreshDisplay();
        } catch (e) {
          console.warn('[AdminUI] 刷新可见性列表失败:', e);
        }
      }
    }, 300);

    console.log('[AdminUI] 面板已显示');
  },

  // 隐藏面板并摘除事件委托
  // 必须解绑：面板隐藏后事件委托仍在，会捕获到不该响应的点击
  hidePanel: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    if (!panel) return;
    if (AdminEvents) {
      AdminEvents.unbindEvents();
    }
    panel.classList.add('hidden');
    panel.style.display = 'none';
    console.log('[AdminUI] 面板已隐藏');
  },

  // 切换显隐
  // 以 hidden 类或内联 display 任一为据判断当前状态，兼容两种隐藏方式
  togglePanel: function () {
    const panel = DOMRefs.get(DOMRefs.admin.panel);
    if (!panel) return;
    if (panel.classList.contains('hidden') || panel.style.display === 'none') {
      this.showPanel();
    } else {
      this.hidePanel();
    }
  },

  showToast: function (message, isError) {
    Utils.showToast(message, isError);
  },

  updatePanelAvatar: function (avatarUrl) {
    const adminPreview = DOMRefs.get(DOMRefs.adminControls.adminAvatarPreview);
    if (adminPreview && avatarUrl) {
      adminPreview.src = avatarUrl;
    }
  },
};
