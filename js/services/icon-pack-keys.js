// 图标包键名注册表 — 全站统一（文章编辑器模块除外）
// 键名 = 压缩包内文件名去后缀（支持任意层子目录，取 basename）。
// 注意：此文件与 backend/routes/icon-packs.cjs 中的 ICON_PACK_KEYS 数组保持同步。

export const ICON_PACK_KEYS = [
  // 基础 UI 键
  { key: 'site', label: '站点图标', slot: 'site' },
  { key: 'directory-folder-collapsed', label: '目录文件夹（收起）', slot: 'directory:folderCollapsed' },
  { key: 'directory-folder-expanded', label: '目录文件夹（展开）', slot: 'directory:folderExpanded' },
  { key: 'directory-header', label: '目录标题图标', slot: 'directory:header' },
  { key: 'toolbar-collapsed', label: '顶部工具栏（收起）', slot: 'ui:toolbarCollapsed' },
  { key: 'toolbar-expanded', label: '顶部工具栏（展开）', slot: 'ui:toolbarExpanded' },
  // 统一箭头（单键 + CSS 旋转，见 1.1.1）；标签/主题图标（替换前置 emoji）
  { key: 'arrow', label: '统一展开/收起箭头', slot: 'arrow' },
  { key: 'avatar-upload', label: '上传头像按钮图标', slot: 'admin-label:avatarUpload' },
  { key: 'custom-texture', label: '自定义贴图区标题图标', slot: 'admin-label:customTexture' },
  { key: 'theme-dark',  label: '主题图标·暗色',   slot: 'theme:dark' },
  { key: 'theme-light', label: '主题图标·亮色',   slot: 'theme:light' },
  { key: 'theme-lofi',  label: '主题图标·低保真', slot: 'theme:lofi' },
  // 目录边栏与贴纸库功能性图标
  { key: 'directory-visibility-visible', label: '目录树·可见性图标（可见）',   slot: 'directory:visibilityVisible' },
  { key: 'directory-visibility-hidden',  label: '目录树·可见性图标（不可见）', slot: 'directory:visibilityHidden' },
  { key: 'search', label: '侧边栏搜索图标', slot: 'search' },
  { key: 'position-mode', label: '进入位置管理按钮图标', slot: 'position-mode' },
  { key: 'article', label: '目录树文章节点图标', slot: 'directory:article' },
  { key: 'deco-style',     label: '贴纸库·切换样式图标', slot: 'deco:style' },
  { key: 'deco-duplicate', label: '贴纸库·复制图标',     slot: 'deco:duplicate' },
  { key: 'deco-rename',    label: '贴纸库·重命名图标',   slot: 'deco:rename' },
  { key: 'deco-edit-pos',  label: '贴纸库·编辑位置图标', slot: 'deco:editPos' },
  { key: 'deco-download',  label: '贴纸库·下载图标',     slot: 'deco:download' },
  { key: 'deco-delete',    label: '贴纸库·删除图标',     slot: 'deco:delete' },
  // 超现实箱子键（slot 前缀 magicbox；物品 id 与 UI.magicBox.items 一致）
  { key: 'box-lid', label: '箱子·箱盖贴图', slot: 'magicbox:lid' },
  { key: 'box-body', label: '箱子·箱体贴图', slot: 'magicbox:body' },
  { key: 'box-item-feather', label: '箱子物品·白色羽毛', slot: 'magicbox:item:feather' },
  { key: 'box-item-coin',   label: '箱子物品·旧硬币',   slot: 'magicbox:item:coin' },
  { key: 'box-item-key',    label: '箱子物品·生锈钥匙', slot: 'magicbox:item:key' },
  { key: 'box-item-note',   label: '箱子物品·字条',     slot: 'magicbox:item:note' },
  { key: 'box-item-sand',   label: '箱子物品·一粒沙',   slot: 'magicbox:item:sand' },
  { key: 'box-item-thread', label: '箱子物品·纽扣',     slot: 'magicbox:item:thread' },
  { key: 'box-item-mirror', label: '箱子物品·小镜子',   slot: 'magicbox:item:mirror' },
  { key: 'box-item-void',   label: '箱子物品·虚空',     slot: 'magicbox:item:void' },
];
export const ICON_PACK_KEY_MAP = Object.fromEntries(ICON_PACK_KEYS.map(k => [k.key, k]));
export const ICON_PACK_KEY_SET = new Set(ICON_PACK_KEYS.map(k => k.key));
export const ICON_PACK_SIZE_RANGE = { min: 64, max: 512 };   // 推荐范围（像素）
export const ICON_PACK_MAX_DIM = 512;                        // 压缩目标最大边长
export const ICON_PACK_LIMITS = { maxEntries: 200, maxFileBytes: 5 * 1024 * 1024, maxTotalBytes: 50 * 1024 * 1024 };
export const ICON_PACK_THEME_IDS = ['dark', 'light', 'lofi'];
