import { AdminPanel } from '../index.js';
import { ActionDelegator } from '../action-delegator.js';
import { DecoShelf } from '../../../services/deco.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';
import { SiteIcon } from '../../../services/site-icon.js';
import { DirectoryIcon } from '../../../services/directory-icon.js';
import { UIIcon, UI_ICON_SLOTS } from '../../../services/ui-icon.js';

// 导入所有处理器
import * as authHandlers from '../handlers/auth.js';
import * as avatarHandlers from '../handlers/avatar.js';
import * as bgColorHandlers from '../handlers/bg-color.js';
import * as decoEditHandlers from '../handlers/deco-edit.js';
import * as gradientHandlers from '../handlers/gradient.js';
import * as textureHandlers from '../handlers/texture.js';
import * as videoHandlers from '../handlers/video.js';
import * as watermarkHandlers from '../handlers/watermark.js';
import * as themeHandlers from '../handlers/theme.js';

// 构建 action → handler 映射表
const handlerMap = {
  logout: authHandlers.logout,
  'upload-avatar': avatarHandlers.uploadAvatar,
  'apply-bg-color': bgColorHandlers.applyBgColor,
  'reset-bg-color': bgColorHandlers.resetBgColor,
  'confirm-edit-pos': decoEditHandlers.confirmEditPos,
  'cancel-edit-pos': decoEditHandlers.cancelEditPos,
  'bg-mode': gradientHandlers.bgMode,
  'grad-direction': gradientHandlers.gradDirection,
  'grad-feather': gradientHandlers.gradFeather,
  'apply-gradient': gradientHandlers.applyGradient,
  'save-palette': gradientHandlers.savePalette,
  'texture-upload': textureHandlers.textureUpload,
  'apply-texture': textureHandlers.applyTexture,
  'reset-texture': textureHandlers.resetTexture,
  'texture-opacity': textureHandlers.textureOpacity,
  'video-opacity': videoHandlers.videoOpacity,
  'apply-watermark': watermarkHandlers.applyWatermark,
  'watermark-opacity': watermarkHandlers.watermarkOpacity,
  'theme-switch': themeHandlers.themeSwitchHandler,

  // ===== 图标上传整合区 =====
  'upload-site-icon': function () {
    const input = document.getElementById('siteIconFileInput');
    if (input) input.click();
  },
  'site-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    SiteIcon.createUploadHandler()(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-site-icon': function () {
    SiteIcon.removeIcon();
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'upload-directory-icon': function () {
    const input = document.getElementById('directoryIconFileInput');
    if (input) input.click();
  },
  'directory-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    DirectoryIcon.createUploadHandler()(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-directory-icon': function () {
    DirectoryIcon.removeIcon();
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },

  // ===== 顶部工具栏 / 控制台折叠箭头自定义图标 =====
  'upload-toolbar-collapsed-icon': function () {
    const input = document.getElementById('toolbarCollapsedIconFileInput');
    if (input) input.click();
  },
  'toolbar-collapsed-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    UIIcon.createUploadHandler(UI_ICON_SLOTS.toolbarCollapsed)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-toolbar-collapsed-icon': function () {
    UIIcon.removeIcon(UI_ICON_SLOTS.toolbarCollapsed);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'upload-toolbar-expanded-icon': function () {
    const input = document.getElementById('toolbarExpandedIconFileInput');
    if (input) input.click();
  },
  'toolbar-expanded-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    UIIcon.createUploadHandler(UI_ICON_SLOTS.toolbarExpanded)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-toolbar-expanded-icon': function () {
    UIIcon.removeIcon(UI_ICON_SLOTS.toolbarExpanded);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'upload-admin-panel-icon': function () {
    const input = document.getElementById('adminPanelIconFileInput');
    if (input) input.click();
  },
  'admin-panel-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    UIIcon.createUploadHandler(UI_ICON_SLOTS.adminPanel)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-admin-panel-icon': function () {
    UIIcon.removeIcon(UI_ICON_SLOTS.adminPanel);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },

  // 拼图自定义
  'open-puzzle-customizer': async function () {
    const { handleOpenPuzzleCustomizer } = await import('../../puzzle/PuzzleCustomizer.js');
    handleOpenPuzzleCustomizer();
  },

  // 超现实箱子自定义（箱盖+箱体双部件 + 物品贴图）
  'upload-lid-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.uploadLidImage(); });
  },
  'remove-lid-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.removeLidImage(); });
  },
  'upload-body-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.uploadBodyImage(); });
  },
  'remove-body-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.removeBodyImage(); });
  },
  'upload-item-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.uploadItemImage(); });
  },
  'remove-item-image': function () {
    import('../handlers/magic-box.js').then(function (m) { m.removeItemImage(); });
  },
};

// 注册到 AdminPanel
AdminPanel.bindEvents = function () {
  if (AdminPanel._delegator) {
    AdminPanel._delegator.destroy();
  }
  const container = document.getElementById('panelContent');
  if (!container) {
    console.warn('[AdminPanel] #panelContent 不存在，无法绑定委托器');
    return;
  }
  const delegator = ActionDelegator;
  delegator.init(container);
  delegator.registerAll(handlerMap);
  AdminPanel._delegator = delegator;
  console.log('[AdminPanel] 事件委托器已绑定，已注册', Object.keys(handlerMap).length, '个 action');
};

AdminPanel.unbindEvents = function () {
  if (AdminPanel._delegator) {
    AdminPanel._delegator.destroy();
    AdminPanel._delegator = null;
    console.log('[AdminPanel] 事件委托器已清理');
  }
};

// AdminEvents 适配（保持兼容）
export const AdminEvents = {
  bindEvents: AdminPanel.bindEvents,
  unbindEvents: AdminPanel.unbindEvents,
  rebind: function () {
    if (AdminPanel._delegator) {
      console.log('[AdminEvents] 已有委托器，跳过重新绑定');
      return;
    }
    this.unbindEvents();
    this.bindEvents();
  },
};

