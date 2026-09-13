// ！通知服务
// 收敛所有用户反馈入口，文案统一取自 UI.notification，避免各模块自行拼接提示语。

import { Utils } from '../utils.js';
import { UI } from '../utils/ui-strings.js';

export const NotificationService = {
  // 显示轻提示
  showToast(message, isError = false) {
    Utils.showToast(message, isError);
  },

  // 显示确认弹窗
  showConfirm(message, callback, cancelCallback) {
    if (confirm(message)) {
      if (typeof callback === 'function') callback();
    } else {
      if (typeof cancelCallback === 'function') cancelCallback();
    }
  },

  // 复用文案表，便于集中维护
  messages: UI.notification,

  showVisibilityChanged(visible) {
    this.showToast(this.messages.visibilityChanged(visible));
  },

  showMinimized() {
    this.showToast(this.messages.minimized);
  },

  showLoginSuccess() {
    this.showToast(this.messages.loginSuccess);
  },

  showLoginFailed() {
    this.showToast(this.messages.loginFailed, true);
  },

  showLogoutSuccess() {
    this.showToast(this.messages.logoutSuccess);
  },

  showDecoUploadSuccess(name) {
    this.showToast(this.messages.decoUploadSuccess(name));
  },

  showDecoDuplicateSuccess(name) {
    this.showToast(this.messages.decoDuplicateSuccess(name));
  },

  showDecoDeleteSuccess() {
    this.showToast(this.messages.decoDeleteSuccess);
  },

  showPaletteSaved() {
    this.showToast(this.messages.paletteSaved);
  },

  showPaletteDeleted() {
    this.showToast(this.messages.paletteDeleted);
  },

  showPaletteApplied(name) {
    this.showToast(this.messages.paletteApplied(name));
  },
};

