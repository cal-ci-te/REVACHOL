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
import { DirectoryIcon } from '../../services/directory-icon.js';
import { UIIcon, UI_ICON_SLOTS } from '../../services/ui-icon.js';

// 标志：是否已完成首次完整渲染
AdminPanel._rendered = false;

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
        return;
    }

    const savedAvatar = AdminAvatar.getAvatarForUser() || 'images/default-avatar.png';
    const siteIconDataUrl = SiteIcon.getIcon() || 'images/site-icon.png';
    const dirIconDataUrl = DirectoryIcon.getIcon() || '';
    const dirIconPreviewHtml = dirIconDataUrl
        ? `<img id="directoryIconPreview" class="admin-icon-preview-img" src="${Utils.escapeHtml(dirIconDataUrl)}" alt="${UI.admin.directoryIconPreviewAlt}">`
        : `<span id="directoryIconPreview" class="admin-icon-preview-fallback">📁</span>`;
    const toolbarCollapsedPreviewHtml = `<div id="toolbarCollapsedPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.toolbarCollapsed, '⚙')}</div>`;
    const toolbarExpandedPreviewHtml = `<div id="toolbarExpandedPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.toolbarExpanded, '◀')}</div>`;
    const adminPanelPreviewHtml = `<div id="adminPanelPreview">${UIIcon.renderPreviewHtml(UI_ICON_SLOTS.adminPanel, '▶')}</div>`;
    const currentMaxOpacity = Utils.storage.get('video_max_opacity');
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
            <button id="uploadAvatarBtn" data-action="upload-avatar" class="avatar-upload-btn">${UI.admin.avatarUploadLabel}</button>
            <div class="admin-avatar-hint">${UI.admin.avatarHint}</div>
        </div>

        <!-- ===== 自定义贴图（可折叠整合区） ===== -->
        <div class="admin-icon-section">
            <div class="admin-icon-section-header" id="iconUploadSectionHeader">
                <span>${UI.admin.customTextureSectionLabel}</span>
                <button type="button" class="admin-icon-section-toggle" id="iconUploadSectionToggle" title="${UI.admin.iconSectionToggleTitle}">▾</button>
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

                <!-- 目录图标 -->
                <div class="admin-control-group" style="border-top:1px solid var(--color-border); padding-top:8px; margin-top:8px;">
                    <label>${UI.admin.directoryIconLabel}</label>
                    <div class="admin-icon-preview">${dirIconPreviewHtml}</div>
                    <div class="admin-button-group">
                        <button id="directoryIconUploadBtn" data-action="upload-directory-icon" class="avatar-upload-btn">${UI.admin.directoryIconUploadButton}</button>
                        <button id="directoryIconResetBtn" data-action="reset-directory-icon" style="margin:0; background:var(--color-danger);" hidden>${UI.admin.iconRestoreDefaultButton}</button>
                        <input type="file" id="directoryIconFileInput" data-action="directory-icon-file" accept="image/*" style="display:none;">
                    </div>
                    <div class="admin-avatar-hint">${UI.admin.directoryIconHint}</div>
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
                <button data-action="theme-switch" data-theme="dark" class="theme-btn theme-btn-dark">${UI.theme.dark}</button>
                <button data-action="theme-switch" data-theme="light" class="theme-btn theme-btn-light">${UI.theme.light}</button>
                <button data-action="theme-switch" data-theme="lofi" class="theme-btn theme-btn-lofi">${UI.theme.lofi}</button>
            </div>
            <div class="admin-avatar-hint">${UI.admin.themeHint}</div>
        </div>

        <!-- 拼图自定义 -->
        ${renderPuzzleEntry()}

        <!-- 退出登录 -->
        <button id="logoutBtn" data-action="logout" style="margin-top:12px;background:var(--color-danger);">${UI.admin.logoutButton}</button>
    `;

    console.log('[AdminPanel] 面板内容渲染完成（首次渲染）');

    // 初始化贴图库 UI
    const container = document.getElementById('assetListContainer');
    if (container) {
        DecoShelfUI.init(container);
        DecoShelfUI.render();
    }

    // 渲染色卡
    if (typeof AdminPanel.renderPalettes === 'function') {
        AdminPanel.renderPalettes();
    }

    // 绑定事件委托器（仅首次）
    if (typeof AdminPanel.bindEvents === 'function') {
        AdminPanel.bindEvents();
    }

    // 文章编辑器按钮 → 内联编辑模式
    const editorBtn = document.getElementById('openArticleEditorBtn');
    if (editorBtn) {
        editorBtn.addEventListener('click', function () {
            // 提示用户在目录树中右键选择文章进行编辑
            Utils.showToast('请在左侧目录树中右键点击文章 → "✏️ 编辑内容" 进入编辑器', false);
        });
    }

    // 绑定折叠按钮
    AdminPanel._bindToggleIconDirect();

    // 绑定图标上传整合区（展开/收缩 + 预览刷新）
    AdminPanel._bindIconSection();
    AdminPanel.refreshIconPreviews();

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

            const validTypes = ['image/png', 'image/webp', 'image/jpeg'];
            if (!validTypes.includes(file.type)) {
                Utils.showToast(UI.toast.imageFormatInvalid, true);
                return;
            }

            const defaultName = file.name.replace(/\.[^.]+$/, '');
            const name = prompt('请输入贴图名称（不含扩展名）：', defaultName);
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

    // 拼图图片上传绑定（PuzzleCustomizer）
    bindPuzzleFileUpload();

    // 箱盖外观文件上传绑定
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

    // 箱体外观文件上传绑定
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

    // 箱子物品贴图文件上传绑定
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

// ===== 图标上传整合区：预览刷新 + 展开/收缩 =====

AdminPanel.refreshIconPreviews = function () {
    const sitePreview = document.getElementById('siteIconPreview');
    if (sitePreview) {
        sitePreview.src = SiteIcon.getIcon() || 'images/site-icon.png';
    }
    const siteReset = document.getElementById('siteIconResetBtn');
    if (siteReset) siteReset.hidden = !SiteIcon.getIcon();

    const dirPreview = document.getElementById('directoryIconPreview');
    const dirDataUrl = DirectoryIcon.getIcon();
    const dirReset = document.getElementById('directoryIconResetBtn');
    if (dirReset) dirReset.hidden = !dirDataUrl;
    if (dirPreview) {
        const img = document.createElement('img');
        img.id = 'directoryIconPreview';
        img.className = 'admin-icon-preview-img';
        img.src = dirDataUrl || '';
        img.alt = UI.admin.directoryIconPreviewAlt;
        const fallback = document.createElement('span');
        fallback.id = 'directoryIconPreview';
        fallback.className = 'admin-icon-preview-fallback';
        fallback.textContent = '📁';
        dirPreview.replaceWith(dirDataUrl ? img : fallback);
    }

    // 通用刷新：顶部工具栏收起/展开、控制台折叠箭头
    const refreshSlot = function (slot, previewId, resetBtnId, fallbackText) {
        const container = document.getElementById(previewId);
        const resetBtn = document.getElementById(resetBtnId);
        if (resetBtn) resetBtn.hidden = !UIIcon.hasIcon(slot);
        if (!container) return;
        const dataUrl = UIIcon.getIcon(slot);
        const img = document.createElement('img');
        img.className = 'admin-icon-preview-img';
        img.src = dataUrl || '';
        img.alt = UI.admin.iconPreviewAlt;
        const fallback = document.createElement('span');
        fallback.className = 'admin-icon-preview-fallback';
        fallback.textContent = fallbackText;
        container.replaceChildren(dataUrl ? img : fallback);
    };

    refreshSlot(UI_ICON_SLOTS.toolbarCollapsed, 'toolbarCollapsedPreview', 'toolbarCollapsedIconResetBtn', '⚙');
    refreshSlot(UI_ICON_SLOTS.toolbarExpanded, 'toolbarExpandedPreview', 'toolbarExpandedIconResetBtn', '◀');
    refreshSlot(UI_ICON_SLOTS.adminPanel, 'adminPanelPreview', 'adminPanelIconResetBtn', '▶');

    // 同步应用到工具栏/控制台实际 DOM
    UIIcon.applyAll();
};

AdminPanel.toggleIconSection = function () {
    const body = document.getElementById('iconUploadSectionBody');
    const toggleBtn = document.getElementById('iconUploadSectionToggle');
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? 'block' : 'none';
    if (toggleBtn) toggleBtn.textContent = collapsed ? '▾' : '▸';
    Utils.storage.set('admin_icon_section_collapsed', !collapsed);
};

AdminPanel._bindIconSection = function () {
    const header = document.getElementById('iconUploadSectionHeader');
    const body = document.getElementById('iconUploadSectionBody');
    const toggleBtn = document.getElementById('iconUploadSectionToggle');
    if (!header || !body) return;

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

    // 恢复上次折叠状态（默认展开）
    const collapsed = Utils.storage.get('admin_icon_section_collapsed');
    if (collapsed === true) {
        body.style.display = 'none';
        if (toggleBtn) toggleBtn.textContent = '▸';
    } else {
        body.style.display = 'block';
        if (toggleBtn) toggleBtn.textContent = '▾';
    }
};

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

