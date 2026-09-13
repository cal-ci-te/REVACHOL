// ！后台管理装配
// 组装后台各子模块并把状态订阅与事件路由集中在此，对外只暴露 Admin 门面。
// 门面多为对子模块方法的转发，目的是让调用方（如 app.js、模板）只依赖一个稳定入口。
import { AppState } from '../core/app-state.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { Utils } from '../utils.js';

import { AdminAuth } from './auth.js';
import { AdminUI } from './ui.js';
import { AdminPosition } from './position.js';
import { AdminAvatar } from './avatar.js';
import { AdminEvents } from './events/index.js';

import { Texture } from '../services/texture.js';
import { Watermark } from '../services/watermark.js';
import { DecoShelf } from '../services/deco.js';
import { Article } from '../models/article-model.js';
import { UIController } from '../ui/ui-controller.js';

console.log('[Admin] 开始组装模块...');

// 登录状态与面板折叠状态驱动 UI
// 面板显隐由登录态决定；折叠态变化则交给 AdminPosition 重算定位
AppState.subscribe('isLoggedIn', function (_newValue) {
  AdminUI.updateLoginUI(_newValue);
  if (_newValue) {
    AdminUI.showPanel();
  } else {
    AdminUI.hidePanel();
  }
}).subscribe('panelCollapsed', function (newValue) {
  AdminPosition.applyCollapsedState();
});

// 后台事件路由
// 统一在此把 EVENTS 映射到具体服务方法，页面层只负责 emit，不必知道由谁处理
EventBus
  .on(EVENTS.ADMIN_AVATAR_UPLOAD, function () {
    AdminAvatar.openUpload();
  })

  .on(EVENTS.ADMIN_BG_COLOR_APPLY, function (data) {
    Texture.setBgColor(data.color);
    Utils.showToast(UI.toast.adminBgColorApplied, false);
    // 同时落本地存储：背景色属用户偏好，刷新后应保持
    Utils.storage.set('bg_color', data.color);
  })
  .on(EVENTS.ADMIN_BG_COLOR_RESET, function () {
    Texture.resetBgColor();
    const picker = document.getElementById('bgColorPicker');
    const preview = document.getElementById('bgColorPreview');
    // 重置为默认色需写入具体 hex 而非 CSS 变量：color picker 只接受 hex 值
    if (picker) picker.value = '#1a1612';
    if (preview) preview.style.backgroundColor = '#1a1612';
    Utils.showToast(UI.toast.adminBgColorReset, false);
  })

  .on(EVENTS.ADMIN_TEXTURE_UPLOAD, function (data) {
    Texture.uploadTexture(data.file);
  })
  .on(EVENTS.ADMIN_TEXTURE_APPLY, function () {
    // 未上传却点应用时给出明确引导，而不是静默保存空纹理
    if (!Texture.textureConfig || !Texture.textureConfig.dataUrl) {
      Utils.showToast(UI.toast.adminTextureUploadFirst, true);

      return;
    }
    Texture.saveConfig();
    Utils.showToast(UI.toast.adminTextureSaved, false);
  })
  .on(EVENTS.ADMIN_TEXTURE_RESET, function () {
    Texture.removeTexture();
    Utils.showToast(UI.toast.adminTextureRemoved, false);
  })
  .on(EVENTS.ADMIN_TEXTURE_OPACITY_CHANGE, function (data) {
    Texture.setOpacity(data.opacity);
  })

  .on(EVENTS.ADMIN_WATERMARK_APPLY, function (data) {
    Watermark.apply(data.text, data.opacity);
    Utils.showToast(UI.toast.adminWatermarkApplied, false);
  })

  .on(EVENTS.ADMIN_FOLDER_FILTER_CHANGE, function () {
    // 文件夹过滤后需按新分类重建文章列表面板
    if (UIController && Article && Article.allArticles) {
      const categories = Article.buildDirectoryTree(Article.allArticles);
      UIController.updateArticleListPanel(Article.allArticles, categories);
      Utils.showToast(UI.toast.adminArticleListUpdated, false);
    }
  })

  .on(EVENTS.ADMIN_LOGOUT, function () {
    AdminAuth.logout();
  })

  .on(EVENTS.ADMIN_PANEL_TOGGLE, function () {
    AdminPosition.toggleCollapse();
  })

  .on(EVENTS.ADMIN_CONFIRM_EDIT_POS, function () {
    DecoShelf.confirmEditing();
  })
  .on(EVENTS.ADMIN_CANCEL_EDIT_POS, function () {
    DecoShelf.cancelEditing();
  });

export const Admin = {
  state: AppState,

  checkStatus: AdminAuth.checkStatus,
  login: AdminAuth.login,
  logout: AdminAuth.logout,

  showPanel: AdminUI.showPanel,
  hidePanel: AdminUI.hidePanel,
  togglePanel: AdminUI.togglePanel,
  togglePanelCollapse: AdminPosition.toggleCollapse,

  openAvatarUpload: AdminAvatar.openUpload,
  confirmCrop: AdminAvatar.confirmCrop,
  cancelCrop: AdminAvatar.cancelCrop,
  setAvatarImage: AdminAvatar.setAvatarImage,
  getAvatarForUser: AdminAvatar.getAvatarForUser,

  showToastMessage: Utils.showToast,

  // 重绑事件：面板 DOM 被重建后调用，恢复委托关系
  rebindEvents: function () {
    if (AdminEvents && typeof AdminEvents.rebind === 'function') {
      AdminEvents.rebind();
    }
  },

  // 以 getter 而非静态值暴露：登录态与折叠态会随会话变化，取值时必须实时读 AppState
  get isLoggedIn() {
    return AppState.get('isLoggedIn');
  },
  get panelCollapsed() {
    return AppState.get('panelCollapsed');
  },
};
