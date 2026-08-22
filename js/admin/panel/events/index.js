import { AdminPanel } from '../index.js';
import { ActionDelegator } from '../action-delegator.js';
import { DecoShelf } from '../../../services/deco.js';
import { Utils } from '../../../utils.js';
import { UI } from '../../../utils/ui-strings.js';
import { SiteIcon } from '../../../services/site-icon.js';
import { DirectoryIcon, DIRECTORY_ICON_SLOTS } from '../../../services/directory-icon.js';
import { UIIcon, UI_ICON_SLOTS } from '../../../services/ui-icon.js';
import { IconPackService } from '../../../services/icon-pack-service.js';
import { inspectZipFile } from '../../../services/icon-pack-processor.js';

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

/** 读取上传区勾选的主题 */
function getSelectedUploadThemes() {
  return Array.from(document.querySelectorAll('#iconPackThemeCheckboxes input[type="checkbox"]:not(#iconPackThemeSelectAll)'))
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

/** 刷新图标包列表 */
function refreshIconPackList() {
  IconPackService.loadPacks().then(AdminPanel.renderIconPackList).catch(() => {});
}

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
  'upload-directory-collapsed-icon': function () {
    const input = document.getElementById('directoryCollapsedIconFileInput');
    if (input) input.click();
  },
  'directory-collapsed-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    DirectoryIcon.createUploadHandler(DIRECTORY_ICON_SLOTS.folderCollapsed)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-directory-collapsed-icon': function () {
    DirectoryIcon.removeIcon(DIRECTORY_ICON_SLOTS.folderCollapsed);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'upload-directory-expanded-icon': function () {
    const input = document.getElementById('directoryExpandedIconFileInput');
    if (input) input.click();
  },
  'directory-expanded-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    DirectoryIcon.createUploadHandler(DIRECTORY_ICON_SLOTS.folderExpanded)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-directory-expanded-icon': function () {
    DirectoryIcon.removeIcon(DIRECTORY_ICON_SLOTS.folderExpanded);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'upload-directory-header-icon': function () {
    const input = document.getElementById('directoryHeaderIconFileInput');
    if (input) input.click();
  },
  'directory-header-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    DirectoryIcon.createUploadHandler(DIRECTORY_ICON_SLOTS.header)(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-directory-header-icon': function () {
    DirectoryIcon.removeIcon(DIRECTORY_ICON_SLOTS.header);
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

  // ===== 图标包管理 =====
  'upload-icon-pack': function () {
    const name = (document.getElementById('iconPackNameInput') || {}).value?.trim() || '';
    if (!name) {
      Utils.showToast(UI.iconPack.nameRequired, true);
      return;
    }
    if (getSelectedUploadThemes().length === 0) {
      Utils.showToast(UI.iconPack.themeRequired, true);
      return;
    }
    const input = document.getElementById('iconPackFileInput');
    if (input) {
      input.value = '';
      input.click();
    }
  },

  'icon-pack-file': async function (event) {
    const fileInput = event.target;
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    const name = (document.getElementById('iconPackNameInput') || {}).value?.trim() || '';
    const themeIds = getSelectedUploadThemes();
    if (!name) {
      Utils.showToast(UI.iconPack.nameRequired, true);
      return;
    }
    if (themeIds.length === 0) {
      Utils.showToast(UI.iconPack.themeRequired, true);
      return;
    }

    try {
      const report = await inspectZipFile(file);
      if (report.errors.length > 0) {
        Utils.showToast(UI.iconPack.validationErrorsTitle + ':\n' + report.errors.join('\n'), true);
        return;
      }
      if (report.warnings.length > 0) {
        const message = UI.iconPack.validationWarningsTitle + ':\n' + report.warnings.join('\n') +
          '\n\n' + UI.iconPack.confirmUpload + '？';
        if (!confirm(message)) return;
      }
      await IconPackService.uploadPack(file, name, themeIds);
      Utils.showToast(UI.iconPack.uploadSuccess, false);
      refreshIconPackList();
      IconPackService.refreshCurrent();
    } catch (err) {
      Utils.showToast(UI.iconPack.uploadFailed + ': ' + (err.message || '未知错误'), true);
    }
  },

  'icon-pack-theme-change': async function (event) {
    const cb = event.target;
    const packId = cb.dataset.id;
    if (!packId) return;
    const checkboxes = document.querySelectorAll(`#iconPackList input[data-action="icon-pack-theme-change"][data-id="${packId}"]`);
    const themeIds = Array.from(checkboxes).filter((c) => c.checked).map((c) => c.dataset.theme);
    if (themeIds.length === 0) {
      cb.checked = true;
      Utils.showToast(UI.iconPack.themeRequired, true);
      return;
    }
    try {
      await IconPackService.updatePackThemes(packId, themeIds);
      refreshIconPackList();
    } catch (err) {
      cb.checked = !cb.checked;
      Utils.showToast(err.message || UI.iconPack.uploadFailed, true);
    }
  },

  'icon-pack-delete': async function (event) {
    const packId = event.target.dataset.id;
    if (!packId) return;
    if (!confirm(UI.iconPack.deleteButton + '？')) return;
    try {
      await IconPackService.deletePack(packId);
      Utils.showToast(UI.iconPack.deleteSuccess, false);
      refreshIconPackList();
    } catch (err) {
      Utils.showToast(err.message || UI.iconPack.uploadFailed, true);
    }
  },

  'icon-pack-theme-select-all': function (event) {
    const selectAll = event.target;
    document.querySelectorAll('#iconPackThemeCheckboxes input[type="checkbox"]:not(#iconPackThemeSelectAll)').forEach((cb) => {
      cb.checked = selectAll.checked;
    });
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

