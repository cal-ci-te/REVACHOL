// ！面板事件注册表
// 把面板内所有 data-action 映射到处理器，并挂载 bindEvents / unbindEvents 到 AdminPanel。
// 以副作用方式为 AdminPanel 挂载方法，避免与 panel/index.js 形成循环依赖。
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

import * as authHandlers from '../handlers/auth.js';
import * as avatarHandlers from '../handlers/avatar.js';
import * as bgColorHandlers from '../handlers/bg-color.js';
import * as decoEditHandlers from '../handlers/deco-edit.js';
import * as gradientHandlers from '../handlers/gradient.js';
import * as textureHandlers from '../handlers/texture.js';
import * as videoHandlers from '../handlers/video.js';
import * as watermarkHandlers from '../handlers/watermark.js';
import * as themeHandlers from '../handlers/theme.js';

// 读取上传区勾选的主题
// 排除「全选」框本身，它只作批量勾选开关，不代表具体主题
function getSelectedUploadThemes() {
  return Array.from(document.querySelectorAll('#iconPackThemeCheckboxes input[type="checkbox"]:not(#iconPackThemeSelectAll)'))
    .filter((cb) => cb.checked)
    .map((cb) => cb.value);
}

// 刷新图标包列表
// 加载失败静默：列表刷新属附加动作，失败不应打断用户当前操作
function refreshIconPackList() {
  IconPackService.loadPacks().then(AdminPanel.renderIconPackList).catch(() => {});
}

// 图标类操作用同一套流程：唤起文件选择 → 由 *-file 动作接管读取
// 三类图标上传（站点/目录/工具栏）结构完全一致，差异仅在服务与槽位
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

  // 站点图标
  'upload-site-icon': function () {
    const input = document.getElementById('siteIconFileInput');
    if (input) input.click();
  },
  'site-icon-file': function (event) {
    const file = event.target.files && event.target.files[0];
    // 先清空值再处理：无论成败都要允许再次选择同一文件
    event.target.value = '';
    if (!file) return;
    SiteIcon.createUploadHandler()(file);
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },
  'reset-site-icon': function () {
    SiteIcon.removeIcon();
    if (AdminPanel.refreshIconPreviews) AdminPanel.refreshIconPreviews();
  },

  // 目录折叠图标
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

  // 目录展开图标
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

  // 目录标题图标
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

  // 顶部工具栏折叠箭头
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

  // 顶部工具栏展开箭头
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

  // 管理面板折叠箭头
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

  // 图标包上传
  // 先校验包名与主题再唤起文件选择：避免用户选完文件才被告知信息不全
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

  // 图标包文件选中后：先离线校验压缩包，有错终止、有警告需确认
  // 校验在客户端完成，避免把明显不合规的包上传到后端
  'icon-pack-file': async function (event) {
    const fileInput = event.target;
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;

    const name = (document.getElementById('iconPackNameInput') || {}).value?.trim() || '';
    const themeIds = getSelectedUploadThemes();
    // 再次校验：文件选择期间用户可能改动了输入，不能只依赖进入前的那次检查
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

  // 修改图标包的适用主题
  // 至少保留一个主题，故末项被取消勾选时回滚并提示
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
      // 请求失败时回滚勾选状态，使界面与服务端保持一致
      cb.checked = !cb.checked;
      Utils.showToast(err.message || UI.iconPack.uploadFailed, true);
    }
  },

  // 删除图标包
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

  // 上传区主题全选/全不选
  'icon-pack-theme-select-all': function (event) {
    const selectAll = event.target;
    document.querySelectorAll('#iconPackThemeCheckboxes input[type="checkbox"]:not(#iconPackThemeSelectAll)').forEach((cb) => {
      cb.checked = selectAll.checked;
    });
  },

  // 拼图自定义：延迟导入，未用到的面板不加载该模块
  'open-puzzle-customizer': async function () {
    const { handleOpenPuzzleCustomizer } = await import('../../puzzle/PuzzleCustomizer.js');
    handleOpenPuzzleCustomizer();
  },

  // 超现实箱子自定义（箱盖、箱体与物品贴图）
  // 同样延迟导入：这些入口使用频率低，没必要进主包
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

// 绑定事件委托
// 先销毁旧委托器：面板内容会重建，旧容器上的委托已失效且会与新委托重复触发
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

// AdminEvents 适配层（保持对既有调用点的兼容）
export const AdminEvents = {
  bindEvents: AdminPanel.bindEvents,
  unbindEvents: AdminPanel.unbindEvents,
  // 已有委托器则跳过重绑：重复 init 会重建委托，纯属浪费且可能丢状态
  rebind: function () {
    if (AdminPanel._delegator) {
      console.log('[AdminEvents] 已有委托器，跳过重新绑定');
      return;
    }
    this.unbindEvents();
    this.bindEvents();
  },
};
