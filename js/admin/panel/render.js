// ！管理面板内容渲染
// 生成管理面板的完整 HTML，并在渲染后装配全部交互（贴图库、色卡、图标包与各文件上传）。
// 首次渲染构建全部结构并绑定事件；之后再次进入只刷新动态列表——
// 整体重建 DOM 会丢失已绑定的事件与用户的输入，代价远高于局部刷新。
import { AdminPanel } from './index.js';
import { AdminAvatar } from '../avatar.js';
import { AdminPosition } from '../position.js';
import { DOMRefs } from '../../core/dom-refs.js';
import { Utils } from '../../utils.js';
import { Texture } from '../../services/texture.js';
import { HeroBackground } from '../../services/hero-background.js';
import { DecoShelfUI } from '../../ui/components/deco-ui.js';
import { EventBus } from '../../core/event-bus.js';
import { AppState } from '../../core/app-state.js';
import { MUTATIONS } from '../../core/state-mutations.js';
import { ArticleService } from '../../services/article-service.js';
import { UI } from '../../utils/ui-strings.js';
import { DecoShelf } from '../../services/deco.js';
import { renderPuzzleEntry } from '../puzzle/PuzzleEntry.js';
import { bindPuzzleFileUpload } from '../puzzle/PuzzleCustomizer.js';
import { SiteIcon } from '../../services/site-icon.js';
import { DirectoryIcon, DIRECTORY_ICON_SLOTS } from '../../services/directory-icon.js';
import { UIIcon, UI_ICON_SLOTS } from '../../services/ui-icon.js';
import { IconPackService } from '../../services/icon-pack-service.js';
import { ICON_PACK_THEME_IDS } from '../../services/icon-pack-keys.js';

// 是否已完成首次完整渲染
AdminPanel._rendered = false;

// 把 "emoji 文本" 拆分为 emoji 与文本两段
// 拆开是为了让图标包能单独替换 emoji，而不影响其后的文字标签
function splitEmojiLabel(label) {
  const idx = String(label || '').indexOf(' ');
  if (idx === -1) return { emoji: String(label || ''), text: '' };
  return { emoji: label.slice(0, idx), text: label.slice(idx + 1) };
}

// 渲染面板内容
// 已渲染过则只刷新动态部分（贴图库、色卡、图标包）后返回，不做整体重建
AdminPanel.renderContent = function () {
    const panel = DOMRefs.get(DOMRefs.admin.content);
    if (!panel) {
        console.warn('[AdminPanel] panelContent 元素不存在');
        return;
    }

    if (AdminPanel._rendered) {
        console.log('[AdminPanel] 面板已渲染，仅刷新动态内容');
        const container = document.getElementById('assetListContainer');
        if (container && typeof DecoShelfUI !== 'undefined' && DecoShelfUI.render) {
            DecoShelfUI.render();
        }
        if (typeof AdminPanel.renderPalettes === 'function') {
            AdminPanel.renderPalettes();
        }
        if (typeof AdminPanel.renderIconPackList === 'function') {
            IconPackService.loadPacks().then(AdminPanel.renderIconPackList).catch(() => {});
        }
        IconPackService.refreshCurrent();
        return;
    }

    const savedAvatar = AdminAvatar.getAvatarForUser() || 'images/default-avatar.png';
    const siteIconDataUrl = SiteIcon.getIcon() || 'images/site-icon.png';
    // 预览块先以占位符渲染，随后由 refreshIconPreviews 按实际图标替换内容
    const directoryCollapsedPreviewHtml = `<div id="directoryCollapsedPreview">${DirectoryIcon.renderPreviewHtml(DIRECTORY_ICON_SLOTS.folderCollapsed, '📂')}</div>`;
    const directoryExpandedPreviewHtml = `<div id="directoryExpandedPreview">${DirectoryIcon.renderPreviewHtml(DIRECTORY_ICON_SLOTS.folderExpanded, '📁')}</div>`;
    const directoryHeaderPreviewHtml = `<div id="directoryHeaderPreview">${DirectoryIcon.renderPreviewHtml(DIRECTORY_ICON_SLOTS.header, '📜')}</div>`;
    const toolbarCollapsedPreviewHtml = `<div id="toolbarCollapsedPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.toolbarCollapsed, '⚙')}</div>`;
    const toolbarExpandedPreviewHtml = `<div id="toolbarExpandedPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.toolbarExpanded, '◀')}</div>`;
    const adminPanelPreviewHtml = `<div id="adminPanelPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.adminPanel, '▶')}</div>`;
    const currentMaxOpacity = Utils.storage.get('video_max_opacity');
    // 透明度取值三级回落：存档值（夹到 0–1）→ 服务当前值 → 1
    // 服务未加载时用 1 兜底，避免滑块落到非法区间
    const opacityValue =
        currentMaxOpacity !== null && typeof currentMaxOpacity === 'number'
            ? Math.max(0, Math.min(1, currentMaxOpacity))
            : HeroBackground
                ? HeroBackground.maxOpacity
                : 1;

    const gradMode = Texture.bgMode || 'solid';
    const gradColors = Texture.gradientColors || ['#1a1612', '#2a231c'];
    const gradDir = Texture.gradientDirection || 'to bottom';
    const gradFeather = Texture.gradientFeather !== undefined ? Texture.gradientFeather : 50;

    panel.innerHTML = `
        <!-- 头像上传（原位置） -->
        <div class="admin-control-group avatar-upload-area">
            <div><img class="admin-avatar" id="adminAvatarPreview" src="${savedAvatar}" alt="${UI.admin.avatarUploadLabel}"></div>
            <button id="uploadAvatarBtn" data-action="upload-avatar" class="avatar-upload-btn"><span class="admin-label-emoji">📷</span> ${splitEmojiLabel(UI.admin.avatarUploadLabel).text}</button>
            <div class="admin-avatar-hint">${UI.admin.avatarHint}</div>
        </div>

        <!-- ===== 自定义贴图（可折叠整合区） ===== -->
        <div class="admin-icon-section">
            <div class="admin-icon-section-header" id="iconUploadSectionHeader">
                <span><span class="admin-label-emoji">🎨</span> ${splitEmojiLabel(UI.admin.customTextureSectionLabel).text}</span>
                <button type="button" class="admin-icon-section-toggle" id="iconUploadSectionToggle" title="${UI.admin.iconSectionToggleTitle}"><span class="icon-pack-arrow arrow-r90">▾</span></button>
            </div>
            <div class="admin-icon-section-body" id="iconUploadSectionBody">
                <!-- 站点图标 -->
                <div class="admin-control-group">
                    <label>${UI.admin.siteIconLabel}</label>
                    <div class="admin-icon-preview">
                        <img id="siteIconPreview" class="admin-icon-preview-img" src="${Utils.escapeHtml(siteIconDataUrl)}" alt="${UI.admin.siteIconPreviewAlt}">
                    </div>
                    <div class="admin-button-group">
                        <button id="siteIconUploadBtn" data-action="upload-site-icon" class="avatar-upload-btn">${UI.admin.siteIconUploadButton}</button>
                        <button id="siteIconResetBtn" data-action="reset-site-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="siteIconFileInput" data-action="site-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.siteIconHint}</div>
                </div>

                <!-- 目录收起图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.directoryCollapsedIconLabel}</label>
                    <div class="admin-icon-preview">${directoryCollapsedPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="directoryCollapsedIconUploadBtn" data-action="upload-directory-collapsed-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="directoryCollapsedIconResetBtn" data-action="reset-directory-collapsed-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="directoryCollapsedIconFileInput" data-action="directory-collapsed-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.directoryCollapsedIconHint}</div>
                </div>

                <!-- 目录展开图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.directoryExpandedIconLabel}</label>
                    <div class="admin-icon-preview">${directoryExpandedPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="directoryExpandedIconUploadBtn" data-action="upload-directory-expanded-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="directoryExpandedIconResetBtn" data-action="reset-directory-expanded-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="directoryExpandedIconFileInput" data-action="directory-expanded-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.directoryExpandedIconHint}</div>
                </div>

                <!-- 目录本身图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.directoryHeaderIconLabel}</label>
                    <div class="admin-icon-preview">${directoryHeaderPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="directoryHeaderIconUploadBtn" data-action="upload-directory-header-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="directoryHeaderIconResetBtn" data-action="reset-directory-header-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="directoryHeaderIconFileInput" data-action="directory-header-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.directoryHeaderIconHint}</div>
                </div>

                <!-- 顶部工具栏 — 收起图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.toolbarCollapsedIconLabel}</label>
                    <div class="admin-icon-preview">${toolbarCollapsedPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="toolbarCollapsedIconUploadBtn" data-action="upload-toolbar-collapsed-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="toolbarCollapsedIconResetBtn" data-action="reset-toolbar-collapsed-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="toolbarCollapsedIconFileInput" data-action="toolbar-collapsed-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.toolbarCollapsedIconHint}</div>
                </div>

                <!-- 顶部工具栏 — 展开图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.toolbarExpandedIconLabel}</label>
                    <div class="admin-icon-preview">${toolbarExpandedPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="toolbarExpandedIconUploadBtn" data-action="upload-toolbar-expanded-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="toolbarExpandedIconResetBtn" data-action="reset-toolbar-expanded-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="toolbarExpandedIconFileInput" data-action="toolbar-expanded-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.toolbarExpandedIconHint}</div>
                </div>

                <!-- 管理员控制台折叠箭头 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.adminPanelIconLabel}</label>
                    <div class="admin-icon-preview">${adminPanelPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="adminPanelIconUploadBtn" data-action="upload-admin-panel-icon" class="avatar-upload-btn">${UI.admin.iconUploadButton}</button>
                        <button id="adminPanelIconResetBtn" data-action="reset-admin-panel-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="adminPanelIconFileInput" data-action="admin-panel-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.adminPanelIconHint}</div>
                </div>

                <!-- 纹理上传 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.textureUploadLabel}</label>
                    <input type="file" id="textureUpload" data-action="texture-upload" accept="image/png,image/jpeg,image/webp">
                    <div class="texture-preview" id="texturePreview"></div>
                    <div class="admin-button-group">
                        <button id="applyTextureBtn" data-action="apply-texture" style="margin:0;">${UI.admin.textureApplyButton}</button>
                        <button id="resetTextureBtn" data-action="reset-texture" style="margin:0; background:var(--color-danger);">${UI.admin.textureRemoveButton}</button>
                    </div>
                </div>

                <!-- 纹理透明度 -->
                <div class="admin-control-group">
                    <label>${UI.admin.textureOpacityLabel} <span id="textureOpacityValue">0.12</span></label>
                    <div class="admin-slider-container">
                        <span>0</span>
                        <input type="range" id="textureOpacitySlider" data-action="texture-opacity" min="0" max="0.5" step="0.01" value="0.12">
                        <span>0.5</span>
                    </div>
                </div>

                <!-- 箱子外观自定义（箱盖 + 箱体双部件） -->
                <div class="admin-control-group" style="border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 12px;">
                    <label>${UI.admin.boxLidLabel}</label>
                    <div class="admin-button-group" style="margin-top: 6px;">
                        <button id="boxLidImageUploadBtn" data-action="upload-lid-image" style="background:var(--color-accent-dark);">${UI.admin.boxLidUploadButton}</button>
                        <button id="boxLidImageRemoveBtn" data-action="remove-lid-image" style="background:var(--color-danger);">${UI.admin.restoreDefaultButton}</button>
                        <input type="file" id="boxLidImageFileInput" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.boxLidHint}</div>
                </div>

                <div class="admin-control-group" style="margin-top: 4px;">
                    <label>${UI.admin.boxBodyLabel}</label>
                    <div class="admin-button-group" style="margin-top: 6px;">
                        <button id="boxBodyImageUploadBtn" data-action="upload-body-image" style="background:var(--color-accent-dark);">${UI.admin.boxBodyUploadButton}</button>
                        <button id="boxBodyImageRemoveBtn" data-action="remove-body-image" style="background:var(--color-danger);">${UI.admin.restoreDefaultButton}</button>
                        <input type="file" id="boxBodyImageFileInput" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.boxBodyHint}</div>
                </div>

                <!-- 箱子物品贴图自定义 -->
                <div class="admin-control-group" style="margin-top: 8px;">
                    <label>${UI.admin.boxItemLabel}</label>
                    <div style="display:flex; gap:6px; align-items:center; margin-top:6px;">
                        <select id="boxItemSelect" style="flex:1; background:var(--color-bg-card); border:1px solid var(--color-border); color:var(--color-text-primary); padding:4px 8px; border-radius:4px; font-family:var(--font-family-base);">
                            <option value="">${UI.admin.boxItemSelectPlaceholder}</option>
                            <option value="feather">${UI.admin.boxItemOptions.feather}</option>
                            <option value="coin">${UI.admin.boxItemOptions.coin}</option>
                            <option value="key">${UI.admin.boxItemOptions.key}</option>
                            <option value="note">${UI.admin.boxItemOptions.note}</option>
                            <option value="sand">${UI.admin.boxItemOptions.sand}</option>
                            <option value="thread">${UI.admin.boxItemOptions.thread}</option>
                            <option value="mirror">${UI.admin.boxItemOptions.mirror}</option>
                            <option value="void">${UI.admin.boxItemOptions.void}</option>
                        </select>
                    </div>
                    <div class="admin-button-group" style="margin-top:6px;">
                        <button id="boxItemImageUploadBtn" data-action="upload-item-image" style="background:var(--color-accent-dark);">${UI.admin.boxItemUploadButton}</button>
                        <button id="boxItemImageRemoveBtn" data-action="remove-item-image" style="background:var(--color-danger);">${UI.admin.boxItemRestoreEmojiButton}</button>
                        <input type="file" id="boxItemImageFileInput" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.boxItemHint}</div>
                </div>
            </div>
        </div>

        <!-- 水印文字 -->
        <div class="admin-control-group">
            <label>${UI.admin.watermarkTextLabel}</label>
            <input type="text" id="watermarkTextInput" value="${UI.config.defaultWatermarkText}">
        </div>

        <!-- 水印透明度 -->
        <div class="admin-control-group">
            <label>${UI.admin.watermarkOpacityLabel} <span id="opacityValue">0.08</span></label>
            <div class="admin-slider-container">
                <span>0</span>
                <input type="range" id="watermarkOpacitySlider" data-action="watermark-opacity" min="0" max="0.3" step="0.01" value="0.08">
                <span>0.3</span>
            </div>
        </div>
        <button id="applyWatermarkBtn" data-action="apply-watermark">${UI.admin.watermarkApplyButton}</button>

        <!-- 视频最大透明度 -->
        <div class="admin-control-group">
            <label>${UI.admin.videoOpacityLabel} <span id="videoMaxOpacityValue">${opacityValue.toFixed(2)}</span></label>
            <div class="admin-slider-container">
                <span>0</span>
                <input type="range" id="videoMaxOpacitySlider" data-action="video-opacity" min="0" max="1" step="0.01" value="${opacityValue}">
                <span>1</span>
            </div>
            <div class="admin-avatar-hint">${UI.admin.videoOpacityHint}</div>
        </div>

        <!-- 背景模式 -->
        <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:12px; margin-top:12px;">
            <label>${UI.admin.bgModeLabel}</label>
            <div style="display:flex; gap:12px; margin:4px 0 8px;">
                <label style="color:var(--color-text-secondary); font-size:12px;">
                    <input type="radio" name="bgMode" data-action="bg-mode" value="solid" ${gradMode === 'solid' ? 'checked' : ''}> ${UI.admin.bgModeSolid}
                </label>
                <label style="color:var(--color-text-secondary); font-size:12px;">
                    <input type="radio" name="bgMode" data-action="bg-mode" value="gradient" ${gradMode === 'gradient' ? 'checked' : ''}> ${UI.admin.bgModeGradient}
                </label>
            </div>
        </div>

        <!-- 渐变控制区 -->
        <div id="gradientControls" style="${gradMode === 'gradient' ? '' : 'display: none;'}">
            <div class="admin-control-group">
                <label>${UI.admin.gradientColorLabel}</label>
                <div class="admin-color-pickers">
                    <input type="color" id="gradColor1" value="${gradColors[0] || '#1a1612'}">
                    <input type="color" id="gradColor2" value="${gradColors[1] || '#2a231c'}">
                    <input type="color" id="gradColor3" value="${gradColors[2] || '#3a2a1a'}" style="${gradColors.length >= 3 ? '' : 'display:none;'}">
                </div>
                <div class="admin-avatar-hint">${UI.admin.gradientColorHint}</div>
            </div>

            <div class="admin-control-group">
                <label>${UI.admin.gradientDirectionLabel}</label>
                <select id="gradDirection" data-action="grad-direction" style="width:100%;">
                    <option value="to bottom" ${gradDir === 'to bottom' ? 'selected' : ''}>${UI.gradient.directionBottom}</option>
                    <option value="to top" ${gradDir === 'to top' ? 'selected' : ''}>${UI.gradient.directionTop}</option>
                    <option value="to left" ${gradDir === 'to left' ? 'selected' : ''}>${UI.gradient.directionLeft}</option>
                    <option value="to right" ${gradDir === 'to right' ? 'selected' : ''}>${UI.gradient.directionRight}</option>
                    <option value="to bottom right" ${gradDir === 'to bottom right' ? 'selected' : ''}>${UI.gradient.directionBottomRight}</option>
                    <option value="to bottom left" ${gradDir === 'to bottom left' ? 'selected' : ''}>${UI.gradient.directionBottomLeft}</option>
                </select>
            </div>

            <div class="admin-control-group">
                <label>${UI.admin.gradientFeatherLabel} <span id="gradFeatherValue">${gradFeather}</span></label>
                <div class="admin-slider-container">
                    <span>0</span>
                    <input type="range" id="gradFeatherSlider" data-action="grad-feather" min="0" max="100" step="1" value="${gradFeather}">
                    <span>100</span>
                </div>
                <div class="admin-avatar-hint">${UI.admin.gradientFeatherHint}</div>
            </div>

            <div class="admin-button-group" style="margin-top:6px;">
                <button id="applyGradientBtn" data-action="apply-gradient" style="background:var(--color-success);">${UI.admin.gradientApplyButton}</button>
                <button id="savePaletteBtn" data-action="save-palette" style="background:var(--color-border);">${UI.admin.paletteSaveButton}</button>
            </div>
            <div class="admin-flex-row" style="margin-top:6px;">
                <input type="text" id="paletteNameInput" placeholder="${UI.admin.paletteNamePlaceholder}" class="admin-palette-input">
            </div>
        </div>

        <!-- 色卡列表 -->
        <div class="admin-control-group" style="margin-top:8px;">
            <label>${UI.admin.paletteListLabel}</label>
            <div id="paletteList" style="max-height:120px; overflow-y:auto; border-top:1px solid var(--color-border); padding-top:6px;"></div>
        </div>

        <!-- 贴图库 -->
        <div class="admin-control-group" style="margin-top:12px;">
            <label>${UI.admin.decoLibraryLabel}</label>
            <div class="admin-button-group" style="margin-bottom:8px;">
                <button id="assetUploadBtn" style="width:auto;background:var(--color-success);">${UI.admin.decoUploadButton}</button>
                <input type="file" id="assetFileInput" accept="image/png,image/webp,image/jpeg" style="display:none;">
            </div>
            <div class="admin-avatar-hint" style="margin-bottom:8px;">${UI.admin.decoUploadHint}</div>
            <div id="assetListContainer" class="admin-asset-list">
                <div style="color:var(--color-text-muted);text-align:center;padding:10px;">${UI.admin.decoLoading}</div>
            </div>
        </div>

        <!-- 图标包管理 -->
        <div class="admin-control-group" style="border-top:1px solid var(--color-border);padding-top:12px;margin-top:12px;">
            <label>${UI.iconPack.sectionLabel}</label>
            <input type="text" id="iconPackNameInput" placeholder="${UI.iconPack.packNamePlaceholder}" style="width:100%; margin-top:6px;">
            <div style="margin-top:6px; font-size:11px; color:var(--color-text-secondary);">${UI.iconPack.themeLabel}</div>
            <div id="iconPackThemeCheckboxes" style="display:flex; gap:10px; margin:4px 0; flex-wrap:wrap;">
                <label style="font-size:12px;"><input type="checkbox" value="dark"> ${UI.iconPack.docTabDark}</label>
                <label style="font-size:12px;"><input type="checkbox" value="light"> ${UI.iconPack.docTabLight}</label>
                <label style="font-size:12px;"><input type="checkbox" value="lofi"> ${UI.iconPack.docTabLofi}</label>
                <label style="font-size:12px;"><input type="checkbox" id="iconPackThemeSelectAll" data-action="icon-pack-theme-select-all"> ${UI.iconPack.selectAll}</label>
            </div>
            <div class="admin-button-group" style="margin:6px 0;">
                <button data-action="upload-icon-pack" style="background:var(--color-success);">${UI.iconPack.uploadButton}</button>
                <input type="file" id="iconPackFileInput" data-action="icon-pack-file" accept=".zip" style="display:none;">
            </div>
            <div class="admin-avatar-hint" style="margin-bottom:6px;">${UI.iconPack.hint}</div>
            <div id="iconPackList"></div>
        </div>

        <!-- 文章管理 -->
        <div class="admin-control-group" style="border-top:1px solid var(--color-border);padding-top:12px;margin-top:12px;">
            <label>${UI.admin.articleEditorLabel}</label>
            <button id="openArticleEditorBtn" style="width:100%;background:var(--color-success);margin-top:4px;">${UI.admin.articleEditorButton}</button>
            <div class="admin-avatar-hint" style="margin-top:4px;">${UI.admin.articleEditorHint}</div>
        </div>

        <!-- 可见性说明 -->
        <div class="admin-control-group" style="margin-top:12px; border-top: 1px solid var(--color-border); padding-top: 12px;">
            <label>${UI.admin.articleVisibilityLabel}</label>
            <div style="color:var(--color-text-secondary); font-size:12px; padding:8px 0;">
                ${UI.admin.articleVisibilityHint}
            </div>
            <div class="admin-avatar-hint" style="margin-top:4px;">
                ${UI.admin.articleVisibilityHintAdmin}
            </div>
        </div>

        <!-- 主题切换 -->
        <div class="admin-control-group" style="border-top: 1px solid var(--color-border); padding-top: 12px; margin-top: 12px;">
            <label>${UI.admin.themeSectionLabel}</label>
            <div id="themeSelector" class="admin-flex-row" style="margin-top:6px;">
                <button data-action="theme-switch" data-theme="dark" class="theme-btn theme-btn-dark"><span class="theme-btn-emoji">🌙</span> ${splitEmojiLabel(UI.theme.dark).text}</button>
                <button data-action="theme-switch" data-theme="light" class="theme-btn theme-btn-light"><span class="theme-btn-emoji">☀️</span> ${splitEmojiLabel(UI.theme.light).text}</button>
                <button data-action="theme-switch" data-theme="lofi" class="theme-btn theme-btn-lofi"><span class="theme-btn-emoji">📼</span> ${splitEmojiLabel(UI.theme.lofi).text}</button>
            </div>
            <div class="admin-avatar-hint">${UI.admin.themeHint}</div>
        </div>

        <!-- 拼图自定义 -->
        ${renderPuzzleEntry()}

        <!-- 退出登录 -->
        <button id="logoutBtn" data-action="logout" style="margin-top:12px;background:var(--color-danger);">${UI.admin.logoutButton}</button>
    `;

    console.log('[AdminPanel] 面板内容渲染完成（首次渲染）');

    // 初始化依赖已存在 DOM 的子系统，顺序即依赖顺序
    const container = document.getElementById('assetListContainer');
    if (container) {
        DecoShelfUI.init(container);
        DecoShelfUI.render();
    }

    IconPackService.loadPacks().then(AdminPanel.renderIconPackList).catch(() => {});
    IconPackService.refreshCurrent();

    if (typeof AdminPanel.renderPalettes === 'function') {
        AdminPanel.renderPalettes();
    }

    if (typeof AdminPanel.bindEvents === 'function') {
        AdminPanel.bindEvents();
    }

    // 文章编辑器按钮：不直接打开编辑器，而是引导用户从目录树右键进入
    const editorBtn = document.getElementById('openArticleEditorBtn');
    if (editorBtn) {
        editorBtn.addEventListener('click', function () {
            Utils.showToast('请在左侧目录树中右键点击文章 → "✏️ 编辑内容" 进入编辑器', false);
        });
    }

    AdminPanel._bindToggleIconDirect();

    AdminPanel._bindIconSection();
    AdminPanel.refreshIconPreviews();

    // 贴图库上传
    // 处理器一律先存字段再摘旧引用：面板可被反复渲染，不摘会累积多份监听
    const uploadBtn = document.getElementById('assetUploadBtn');
    const assetFileInput = document.getElementById('assetFileInput');

    if (uploadBtn && assetFileInput) {
        if (AdminPanel._uploadClickHandler) {
            uploadBtn.removeEventListener('click', AdminPanel._uploadClickHandler);
        }
        if (AdminPanel._assetFileHandler) {
            assetFileInput.removeEventListener('change', AdminPanel._assetFileHandler);
        }

        AdminPanel._uploadClickHandler = function(e) {
            e.stopPropagation();
            console.log('[Upload] 点击上传按钮');
            assetFileInput.value = '';
            assetFileInput.click();
        };
        uploadBtn.addEventListener('click', AdminPanel._uploadClickHandler);

        AdminPanel._assetFileHandler = async function(event) {
            const fileInput = event.target;
            const file = fileInput.files[0];
            fileInput.value = '';
            if (!file) return;

            // 按 MIME 白名单校验：仅靠 accept 属性不可靠，用户可切换为「所有文件」
            const validTypes = ['image/png', 'image/webp', 'image/jpeg'];
            if (!validTypes.includes(file.type)) {
                Utils.showToast(UI.toast.imageFormatInvalid, true);
                return;
            }

            // 默认名去掉扩展名，贴图名不带后缀
            const defaultName = file.name.replace(/\.[^.]+$/, '');
            const name = prompt('请输入贴图名称（不含扩展名）：', defaultName);
            // 区分取消（null）与空串：取消则不新增
            if (name === null) return;

            try {
                await DecoShelf.upload(file, name);
                Utils.showToast(UI.toast.decoUploadSuccess(name), false);
            } catch (err) {
                Utils.showToast(UI.toast.decoUploadFailed(err.message || '未知错误'), true);
            }
        };
        assetFileInput.addEventListener('change', AdminPanel._assetFileHandler);

        console.log('[Upload] 上传事件绑定完成');
    }

    bindPuzzleFileUpload();

    // 箱盖、箱体、物品三类图片上传：逻辑同构，延迟导入处理器以免进主包
    const lidImgInput = document.getElementById('boxLidImageFileInput');
    if (lidImgInput) {
      if (AdminPanel._boxLidHandler) lidImgInput.removeEventListener('change', AdminPanel._boxLidHandler);
      AdminPanel._boxLidHandler = async function (event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const { handleLidImageFile } = await import('./handlers/magic-box.js');
        handleLidImageFile(file);
      };
      lidImgInput.addEventListener('change', AdminPanel._boxLidHandler);
    }

    const bodyImgInput = document.getElementById('boxBodyImageFileInput');
    if (bodyImgInput) {
      if (AdminPanel._boxBodyHandler) bodyImgInput.removeEventListener('change', AdminPanel._boxBodyHandler);
      AdminPanel._boxBodyHandler = async function (event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const { handleBodyImageFile } = await import('./handlers/magic-box.js');
        handleBodyImageFile(file);
      };
      bodyImgInput.addEventListener('change', AdminPanel._boxBodyHandler);
    }

    const boxItemImgInput = document.getElementById('boxItemImageFileInput');
    if (boxItemImgInput) {
      if (AdminPanel._boxItemImageHandler) boxItemImgInput.removeEventListener('change', AdminPanel._boxItemImageHandler);
      AdminPanel._boxItemImageHandler = async function (event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (!file) return;
        const { handleItemImageFile } = await import('./handlers/magic-box.js');
        handleItemImageFile(file);
      };
      boxItemImgInput.addEventListener('change', AdminPanel._boxItemImageHandler);
    }

    AdminPanel._rendered = true;
};

// 直接绑定折叠按钮
// 折叠按钮由 render 注入且可能晚于事件委托建立，故单独直绑一次以保证可点
AdminPanel._bindToggleIconDirect = function () {
    const toggleIcon = document.getElementById('panelToggleIcon');
    if (!toggleIcon) return;
    if (AdminPanel._directToggleHandler) {
        toggleIcon.removeEventListener('click', AdminPanel._directToggleHandler);
    }
    AdminPanel._directToggleHandler = function (e) {
        e.stopPropagation();
        console.log('[AdminPanel] 直接点击折叠按钮');
        if (typeof AdminPosition !== 'undefined' && AdminPosition.toggleCollapse) {
            AdminPosition.toggleCollapse();
        }
    };
    toggleIcon.addEventListener('click', AdminPanel._directToggleHandler);
};

// 刷新图标预览
// 站点图标单独处理（无槽位概念），其余六个槽位走同一套刷新逻辑
AdminPanel.refreshIconPreviews = function () {
    const sitePreview = document.getElementById('siteIconPreview');
    if (sitePreview) {
        sitePreview.src = SiteIcon.getIcon() || 'images/site-icon.png';
    }
    const siteReset = document.getElementById('siteIconResetBtn');
    // 仅有自定义图标时才显示「恢复默认」按钮
    if (siteReset) siteReset.hidden = !SiteIcon.getIcon();

    // 通用刷新：目录图标（收起/展开/目录本身）+ 顶部工具栏 + 控制台折叠箭头
    // 用 image 或 fallback 文本整体替换内容，避免残留上一个图标节点
    const refreshSlot = function (slot, previewId, resetBtnId, fallbackText, getIconFn) {
        const container = document.getElementById(previewId);
        const resetBtn = document.getElementById(resetBtnId);
        if (resetBtn) resetBtn.hidden = !getIconFn(slot);
        if (!container) return;
        const dataUrl = getIconFn(slot);
        const img = document.createElement('img');
        img.className = 'admin-icon-preview-img';
        img.src = dataUrl || '';
        img.alt = UI.admin.iconPreviewAlt;
        const fallback = document.createElement('span');
        fallback.className = 'admin-icon-preview-fallback';
        fallback.textContent = fallbackText;
        container.replaceChildren(dataUrl ? img : fallback);
    };

    refreshSlot(DIRECTORY_ICON_SLOTS.folderCollapsed, 'directoryCollapsedPreview', 'directoryCollapsedIconResetBtn', '📂', (s) => DirectoryIcon.getIcon(s));
    refreshSlot(DIRECTORY_ICON_SLOTS.folderExpanded, 'directoryExpandedPreview', 'directoryExpandedIconResetBtn', '📁', (s) => DirectoryIcon.getIcon(s));
    refreshSlot(DIRECTORY_ICON_SLOTS.header, 'directoryHeaderPreview', 'directoryHeaderIconResetBtn', '📜', (s) => DirectoryIcon.getIcon(s));
    refreshSlot(UI_ICON_SLOTS.toolbarCollapsed, 'toolbarCollapsedPreview', 'toolbarCollapsedIconResetBtn', '⚙', (s) => UIIcon.getIcon(s));
    refreshSlot(UI_ICON_SLOTS.toolbarExpanded, 'toolbarExpandedPreview', 'toolbarExpandedIconResetBtn', '◀', (s) => UIIcon.getIcon(s));
    refreshSlot(UI_ICON_SLOTS.adminPanel, 'adminPanelPreview', 'adminPanelIconResetBtn', '▶', (s) => UIIcon.getIcon(s));

    // 预览更新后同步应用到工具栏、控制台与目录树的实际 DOM
    UIIcon.applyAll();
    DirectoryIcon.applyAll();
};

// 渲染图标包列表
AdminPanel.renderIconPackList = function (packs) {
    const container = document.getElementById('iconPackList');
    if (!container) return;

    if (!packs || packs.length === 0) {
        container.innerHTML = `<div style="color:var(--color-text-muted);text-align:center;padding:8px;">${UI.iconPack.emptyList}</div>`;
        return;
    }

    container.innerHTML = packs.map((pack) => {
        const themes = Array.isArray(pack.themes) ? pack.themes : [];
        const themeCheckboxes = ICON_PACK_THEME_IDS.map((themeId) => {
            const label = themeId === 'dark' ? UI.iconPack.docTabDark : themeId === 'light' ? UI.iconPack.docTabLight : UI.iconPack.docTabLofi;
            // 包 id 与名称来自上传，拼入 HTML 前统一转义
            return `<label style="font-size:11px;"><input type="checkbox" data-id="${Utils.escapeHtml(pack.id)}" data-theme="${themeId}" data-action="icon-pack-theme-change" ${themes.includes(themeId) ? 'checked' : ''}> ${label}</label>`;
        }).join('');
        return `
            <div class="icon-pack-row" style="border-top:1px solid var(--color-border); padding:6px 0; margin-top:4px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
                    <span style="font-size:12px; color:var(--color-text-accent);">${Utils.escapeHtml(pack.name)}</span>
                    <button data-action="icon-pack-delete" data-id="${Utils.escapeHtml(pack.id)}" style="background:var(--color-danger); font-size:11px; padding:2px 6px;">${UI.iconPack.deleteButton}</button>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:4px;">${themeCheckboxes}</div>
            </div>
        `;
    }).join('');
};

// 切换图标整合区展开/收起
// 折叠态写入本地存储：该偏好跨会话保留，避免每次打开都要手动收起
AdminPanel.toggleIconSection = function () {
    const body = document.getElementById('iconUploadSectionBody');
    const toggleBtn = document.getElementById('iconUploadSectionToggle');
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (toggleBtn) {
        toggleBtn.innerHTML = `<span class="icon-pack-arrow ${collapsed ? 'arrow-r90' : 'arrow-r0'}">${collapsed ? '▾' : '▸'}</span>`;
    }
    Utils.storage.set('admin_icon_section_collapsed', !collapsed);
};

// 绑定图标整合区的展开/收起交互
AdminPanel._bindIconSection = function () {
    const header = document.getElementById('iconUploadSectionHeader');
    const body = document.getElementById('iconUploadSectionBody');
    const toggleBtn = document.getElementById('iconUploadSectionToggle');
    if (!header || !body) return;

    // 点标题栏整行也能展开/收起，但点在按钮上时交给按钮自己的处理器，避免触发两次
    if (AdminPanel._iconSectionHeaderHandler) {
        header.removeEventListener('click', AdminPanel._iconSectionHeaderHandler);
    }
    AdminPanel._iconSectionHeaderHandler = function (e) {
        if (e.target.closest('button')) return;
        AdminPanel.toggleIconSection();
    };
    header.addEventListener('click', AdminPanel._iconSectionHeaderHandler);

    if (toggleBtn) {
        if (AdminPanel._iconSectionToggleHandler) {
            toggleBtn.removeEventListener('click', AdminPanel._iconSectionToggleHandler);
        }
        AdminPanel._iconSectionToggleHandler = function (e) {
            e.stopPropagation();
            AdminPanel.toggleIconSection();
        };
        toggleBtn.addEventListener('click', AdminPanel._iconSectionToggleHandler);
    }

    // 恢复上次折叠状态，默认展开
    const collapsed = Utils.storage.get('admin_icon_section_collapsed');
    if (collapsed === true) {
        body.style.display = 'none';
        if (toggleBtn) toggleBtn.innerHTML = '<span class="icon-pack-arrow arrow-r0">▸</span>';
    } else {
        body.style.display = 'block';
        if (toggleBtn) toggleBtn.innerHTML = '<span class="icon-pack-arrow arrow-r90">▾</span>';
    }
};

// 解绑本模块绑定的事件后，转交原 unbindEvents
// 用包装而非覆盖：panel/events 先挂载的委托器清理逻辑不能被本模块丢掉
const originalUnbind = AdminPanel.unbindEvents;
AdminPanel.unbindEvents = function () {
    const toggleIcon = document.getElementById('panelToggleIcon');
    if (toggleIcon && AdminPanel._directToggleHandler) {
        toggleIcon.removeEventListener('click', AdminPanel._directToggleHandler);
        delete AdminPanel._directToggleHandler;
    }
    const iconHeader = document.getElementById('iconUploadSectionHeader');
    const iconToggle = document.getElementById('iconUploadSectionToggle');
    if (iconHeader && AdminPanel._iconSectionHeaderHandler) {
        iconHeader.removeEventListener('click', AdminPanel._iconSectionHeaderHandler);
        delete AdminPanel._iconSectionHeaderHandler;
    }
    if (iconToggle && AdminPanel._iconSectionToggleHandler) {
        iconToggle.removeEventListener('click', AdminPanel._iconSectionToggleHandler);
        delete AdminPanel._iconSectionToggleHandler;
    }
    const uploadBtn = document.getElementById('assetUploadBtn');
    const assetFileInput = document.getElementById('assetFileInput');
    if (uploadBtn && AdminPanel._uploadClickHandler) {
        uploadBtn.removeEventListener('click', AdminPanel._uploadClickHandler);
        delete AdminPanel._uploadClickHandler;
    }
    if (assetFileInput && AdminPanel._assetFileHandler) {
        assetFileInput.removeEventListener('change', AdminPanel._assetFileHandler);
        delete AdminPanel._assetFileHandler;
    }
    if (typeof originalUnbind === 'function') {
        originalUnbind.call(this);
    }
};
