export const EVENTS = {
  // 文章相关
  ARTICLE_VISIBILITY_CHANGED: 'article:visibility-changed',
  ARTICLE_MADE_INVISIBLE: 'article:made-invisible',
  ARTICLE_DATA_LOADED: 'article:data-loaded',
  ARTICLE_DATA_LOADING: 'article:data-loading',
  ARTICLE_DATA_ERROR: 'article:data-error',
  ARTICLES_UPDATED: 'articles:updated',

  // UI相关
  UI_INITIALIZED: 'ui:initialized',
  UI_REFRESH: 'ui:refresh',

  // 认证相关
  AUTH_LOGGED_IN: 'auth:logged-in',
  AUTH_LOGGED_OUT: 'auth:logged-out',
  AUTH_UNAUTHORIZED: 'auth:unauthorized',

  // 管理面板
  PANEL_TOGGLED: 'panel:toggled',
  PANEL_COLLAPSED: 'panel:collapsed',

  // 管理面板 — 操作事件
  ADMIN_AVATAR_UPLOAD: 'admin:avatar-upload',
  ADMIN_BG_COLOR_APPLY: 'admin:bg-color-apply',
  ADMIN_BG_COLOR_RESET: 'admin:bg-color-reset',
  ADMIN_TEXTURE_UPLOAD: 'admin:texture-upload',
  ADMIN_TEXTURE_APPLY: 'admin:texture-apply',
  ADMIN_TEXTURE_RESET: 'admin:texture-reset',
  ADMIN_TEXTURE_OPACITY_CHANGE: 'admin:texture-opacity-change',
  ADMIN_WATERMARK_APPLY: 'admin:watermark-apply',
  ADMIN_FOLDER_FILTER_CHANGE: 'admin:folder-filter-change',
  ADMIN_LOGOUT: 'admin:logout',
  ADMIN_PANEL_TOGGLE: 'admin:panel-toggle',
  ADMIN_CONFIRM_EDIT_POS: 'admin:confirm-edit-pos',
  ADMIN_CANCEL_EDIT_POS: 'admin:cancel-edit-pos',
  ADMIN_POSITION_MODE_ENTER: 'admin:position-mode-enter',
  ADMIN_POSITION_MODE_EXIT: 'admin:position-mode-exit',
  ADMIN_POSITION_MODE_CANCEL: 'admin:position-mode-cancel',

  // 贴图相关
  DECO_LIBRARY_CHANGED: 'deco:library-changed',
  DECO_EDITING_STARTED: 'deco:editing-started',
  DECO_EDITING_STOPPED: 'deco:editing-stopped',
  DECO_CONTEXT_MENU: 'deco:context-menu',

  // WebSocket
  WS_CONNECTED: 'ws:connected',
  WS_DISCONNECTED: 'ws:disconnected',
  WS_VISIBILITY_CHANGED: 'ws:visibility-changed',

  // 通知
  NOTIFICATION_SHOW: 'notification:show',
  NOTIFICATION_HIDE: 'notification:hide',

  // 健康检查
  HEALTH_CHECK_PASSED: 'health:check-passed',
  HEALTH_CHECK_DEGRADED: 'health:check-degraded',
  HEALTH_CHECK_FAILED: 'health:check-failed',

  // 组件管理器
  COMPONENT_REGISTERED: 'component:registered',
  COMPONENT_INITIALIZED: 'component:initialized',
  COMPONENT_MOUNTED: 'component:mounted',
  COMPONENT_UNMOUNTED: 'component:unmounted',
  COMPONENT_ERROR: 'component:error',
  COMPONENT_BEFORE_DESTROY: 'component:before-destroy',
  COMPONENT_ALL_INITIALIZED: 'component:all-initialized',
  COMPONENT_ALL_READY: 'component:all-ready',
  COMPONENT_CONFIG_CHANGED: 'component:config-changed',

  // 其他
  ARTICLES_LIST_UPDATED: 'articles:list-updated',
  APP_STARTED: 'app:started',
  THEME_CHANGED: 'theme:changed',
  EDITOR_OPENED: 'editor:opened',
  EDITOR_CLOSED: 'editor:closed',
  ICON_PACKS_CHANGED: 'icon-packs:changed',

  // 文章贴纸编辑
  STICKER_EDITOR_OPENED: 'sticker-editor:opened',
  STICKER_EDITOR_CLOSED: 'sticker-editor:closed',
  STICKER_EDITOR_SAVED: 'sticker-editor:saved',

  // CrewAI Web Dashboard
  CREW_STATUS_LOADED: 'crew:status-loaded',
  CREW_STARTED: 'crew:started',
  CREW_AGENT_STATUS: 'crew:agent-status',
  CREW_TASK: 'crew:task',
  CREW_LOG: 'crew:log',
  CREW_OUTPUT: 'crew:output',
  CREW_STATS: 'crew:stats',
  CREW_FINISHED: 'crew:finished',
  CREW_STOPPED: 'crew:stopped',
  CREW_ERROR: 'crew:error',
  // RFC-001：Flow 任务进入暂存区（自动通知人工）
  CREW_FLOW_STAGED: 'crew:flow-staged',
};

