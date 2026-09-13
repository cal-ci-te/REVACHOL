// ！集中式 DOM 引用
// 汇总各模块使用的选择器字符串，供按名字段或路径查询。
// 选择集中登记而非散落各模块的 querySelector：选择器变更只需改一处，避免多处硬编码字符串漂移。

export const DOMRefs = {
  // 侧边栏
  sidebar: {
    container: '#sidebar',
    toggleBtn: '#sidebarCollapseBtn',
    searchInput: '#sidebarSearchInput',
    directoryTree: '#directoryTree',
    overlay: '#sidebarOverlay',
  },

  // 文章列表
  articles: {
    container: '#articlesContainer',
  },

  // 详情浮层
  detail: {
    overlay: '#detailOverlay',
    content: '#detailContent',
    closeBtn: '#detailCloseBtn',
    body: '#detailBody',
  },

  // 登录
  login: {
    widget: '#loginWidget',
    trigger: '#loginTrigger',
    avatar: '#loginAvatar',
    label: '.login-label',
    welcomeText: '#welcomeText',
    modal: '#loginModalOverlay',
    closeBtn: '#modalCloseBtn',
    loginBtn: '#modalLoginBtn',
    username: '#loginUsername',
    password: '#loginPassword',
  },

  // 头像裁剪
  crop: {
    overlay: '#avatarCropModalOverlay',
    canvas: '#cropCanvas',
    previewCanvas: '#previewCanvas',
    confirmBtn: '#cropConfirmBtn',
    cancelBtn: '#cropCancelBtn',
    closeBtn: '#cropModalCloseBtn',
  },

  // 管理面板
  admin: {
    panel: '#adminPanel',
    header: '#panelHeader',
    content: '#panelContent',
    toggleIcon: '#panelToggleIcon',
  },

  // 管理面板控件
  adminControls: {
    toggleDecoEdit: '#toggleDecoEditBtn',
    decoEditStatus: '#decoEditStatus',
    resetDecoLogo: '#resetDecoLogoBtn',
    resetDecoStamp: '#resetDecoStampBtn',
    resetDecoRaven: '#resetDecoRavenBtn',
    uploadAvatar: '#uploadAvatarBtn',
    adminAvatarPreview: '#adminAvatarPreview',
    bgColorPicker: '#bgColorPicker',
    bgColorPreview: '#bgColorPreview',
    applyBgColor: '#applyBgColorBtn',
    resetBgColor: '#resetBgColorBtn',
    textureUpload: '#textureUpload',
    texturePreview: '#texturePreview',
    applyTexture: '#applyTextureBtn',
    resetTexture: '#resetTextureBtn',
    textureOpacitySlider: '#textureOpacitySlider',
    textureOpacityValue: '#textureOpacityValue',
    watermarkText: '#watermarkTextInput',
    watermarkOpacitySlider: '#watermarkOpacitySlider',
    opacityValue: '#opacityValue',
    applyWatermark: '#applyWatermarkBtn',
    folderFilter: '#folderFilterSelect',
    articleListPanel: '#articleListPanel',
    logoutBtn: '#logoutBtn',
  },

  // 页面装饰元素
  misc: {
    siteAvatar: '#siteAvatar',
    tiledWatermark: '#tiledWatermark',
    customTexture: '#customTexture',
    visibleWatermark: '#visibleWatermark',
    decoLogo: '#decoLogo',
    decoStamp: '#decoStamp',
    decoRaven: '#decoRaven',
  },

  // 查询单个元素
  get: function (selector) {
    if (typeof selector === 'string') {
      return document.querySelector(selector);
    }
    return null;
  },

  // 查询多个元素
  getAll: function (selector) {
    if (typeof selector === 'string') {
      return document.querySelectorAll(selector);
    }
    return null;
  },

  // 按字段路径查询
  getByPath: function (path) {
    const parts = path.split('.');
    let current = this;
    for (let i = 0; i < parts.length; i++) {
      if (current && current[parts[i]] !== undefined) {
        current = current[parts[i]];
      } else {
        return null;
      }
    }
    return typeof current === 'string' ? document.querySelector(current) : current;
  },
};
