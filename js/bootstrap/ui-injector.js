// ！UI 文案注入
// 把 ui-strings.js 中的文案写入 index.html 的静态占位元素，实现文案与结构分离。
// 每项均先判元素存在再赋值：文案项多于当前页面的元素是常态，缺失不应中断其余注入。
import { UI } from '../utils/ui-strings.js';

export function injectUITexts() {
    document.title = UI.common.siteTitle + ' - ' + UI.common.siteSubtitle;

    const siteTitle = document.getElementById('siteTitle');
    if (siteTitle) siteTitle.textContent = UI.common.siteTitle;

    const siteSubtitle = document.getElementById('siteSubtitle');
    if (siteSubtitle) siteSubtitle.textContent = UI.common.siteSubtitle;

    const searchInput = document.getElementById('sidebarSearchInput');
    if (searchInput) searchInput.placeholder = UI.common.searchPlaceholder;

    // 版权行以占位符拼接：站点名与副标题可被配置改写，分开维护可避免两处不一致
    const copyrightBar = document.getElementById('copyrightBar');
    if (copyrightBar) {
        copyrightBar.textContent = UI.copyright
            .replace('{siteTitle}', UI.common.siteTitle)
            .replace('{siteSubtitle}', UI.common.siteSubtitle);
    }

    const heroTitle = document.getElementById('heroTitle');
    if (heroTitle) heroTitle.textContent = UI.hero.title;

    // 用 innerHTML 而非 textContent：首屏说明含内联强调标签
    const heroDesc = document.getElementById('heroDescription');
    if (heroDesc) heroDesc.innerHTML = UI.hero.description;

    const loginLabel = document.getElementById('loginLabel');
    if (loginLabel) loginLabel.textContent = UI.login.triggerLabel;

    const welcomeText = document.getElementById('welcomeText');
    if (welcomeText) welcomeText.textContent = UI.login.welcomeText;

    const loginModalTitle = document.getElementById('loginModalTitle');
    if (loginModalTitle) loginModalTitle.textContent = UI.login.modalTitle;

    const loginUsernameLabel = document.getElementById('loginUsernameLabel');
    if (loginUsernameLabel) loginUsernameLabel.textContent = UI.login.usernameLabel;

    const loginPasswordLabel = document.getElementById('loginPasswordLabel');
    if (loginPasswordLabel) loginPasswordLabel.textContent = UI.login.passwordLabel;

    const loginUsername = document.getElementById('loginUsername');
    if (loginUsername) loginUsername.placeholder = UI.login.placeholderUsername;

    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) loginPassword.placeholder = UI.login.placeholderPassword;

    const modalLoginBtn = document.getElementById('modalLoginBtn');
    if (modalLoginBtn) modalLoginBtn.textContent = UI.login.loginButton;

    const loginHint = document.getElementById('loginHint');
    if (loginHint) loginHint.textContent = UI.login.hint;

    const cropTitle = document.getElementById('cropModalTitle');
    if (cropTitle) cropTitle.textContent = UI.crop.title;

    const cropPreviewLabel = document.getElementById('cropPreviewLabel');
    if (cropPreviewLabel) cropPreviewLabel.textContent = UI.crop.previewLabel;

    const cropCancel = document.getElementById('cropCancelBtn');
    if (cropCancel) cropCancel.textContent = UI.crop.cancel;

    const cropConfirm = document.getElementById('cropConfirmBtn');
    if (cropConfirm) cropConfirm.textContent = UI.crop.confirm;

    const adminTitle = document.getElementById('adminPanelTitle');
    if (adminTitle) adminTitle.textContent = UI.admin.panelTitle;

    // 侧边栏标题固定用卷轴符号而非取 UI 文案：该处是装饰性图标，不随语言/配置变化
    const sidebarTitle = document.getElementById('sidebarTitle');
    if (sidebarTitle) sidebarTitle.textContent = '📜';

    const enterPosBtn = document.getElementById('enterPositionModeBtn');
    if (enterPosBtn) enterPosBtn.textContent = UI.admin.positionModeEnter;

    const savePosBtn = document.getElementById('savePositionChangesBtn');
    if (savePosBtn) savePosBtn.textContent = UI.admin.positionModeSave;

    const cancelPosBtn = document.getElementById('cancelPositionChangesBtn');
    if (cancelPosBtn) cancelPosBtn.textContent = UI.admin.positionModeCancel;

    const posHint = document.getElementById('positionModeHint');
    if (posHint) posHint.textContent = UI.admin.positionModeHint;

    const dirLoading = document.getElementById('directoryLoading');
    if (dirLoading) dirLoading.textContent = UI.directory.loading;

    const articlesLoading = document.getElementById('articlesLoading');
    if (articlesLoading) articlesLoading.textContent = UI.articles.loading;

    const visibleWatermark = document.getElementById('visibleWatermark');
    if (visibleWatermark) {
        visibleWatermark.textContent = `© ${UI.common.siteTitle} · ${UI.common.siteSubtitle} · 内容受保护`;
    }

    console.log('[ui-injector] UI 文案注入完成');
}
