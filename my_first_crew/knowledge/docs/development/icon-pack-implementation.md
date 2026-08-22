# 图标包（Icon Pack）功能实现步骤文档

> 目标读者：下一个执行的 AI/开发者。
> 前置阅读：`knowledge/docs/ai-collaboration/all-summary ( complete ).md`、`knowledge/docs/development/custom-icon-guide.md`。
> 原则：步骤原子化、每步可独立验证、每步可回退；不破坏现有单图标上传功能；不引入不必要的依赖与耦合。

---

## 0. 需求原文要点（逐条映射）

| # | 需求 | 落点 |
|---|------|------|
| R1 | 定义图标键，对需要的图标键名命名 | 阶段 A 步骤 A2：`js/services/icon-pack-keys.js` |
| R2 | 图标支持任意颜色和大小；按现有站点图标逻辑自适应原比例压缩（png/svg） | 阶段 B 步骤 B1：processor（PNG 等比缩小到 ≤512px，不放大；SVG 保持矢量） |
| R3 | 上传位置写明推荐图片大小范围；有图超出/小于范围时提示是哪张图并提示可能效果不佳 | B1 尺寸检测 warnings；C2 上传区提示文案 |
| R4 | 缺少某些键名对应图标时提示缺少哪些图标 | B1 missingKeys warnings |
| R5 | 管理员用「键名+格式后缀」命名文件；工具栏加入键名文档；默认键灰色、有自定义图标绿色 | A2 键表；C1 工具栏键名文档 |
| R6 | 压缩为 zip 后上传到图标包 | C2 上传 UI + B2 上传服务 |
| R7 | 上传到后端前先做安全性检查（遍历每张图，顺带完成尺寸范围检测） | B1 前端校验（遍历 zip 全部图片） |
| R8 | 文件命名支持子目录组织；校验仅遍历图片；支持目录遍历 | B1 递归遍历 entries，只处理 `.png/.svg` |
| R9 | 主题选择：上传时与已应用时都可选单个包对应哪些主题（多选/全选/至少一个） | A6 后端 PUT themes；C2 管理区主题勾选 |
| R10 | 原状态键可视化文档扩展为可切换三份（区分不同主题下图标状态） | C1 键名文档 3 个主题 tab |
| R11 | 暂不考虑动态图标 | 范围外，不做 |

---

## 1. 总体设计决策

### 1.1 图标键名注册表（33 个键，全站统一，文章编辑器模块除外）

#### 基础 UI 键（23 个，对应现有图标槽位/文本标签图标）

| 键名（= 文件名去后缀） | 中文名 | 对应现有槽位 | 现有回退默认 |
|---|---|---|---|
| `site` | 站点图标 | `SiteIcon`（`#siteAvatar`） | `images/site-icon.png` |
| `directory-folder-collapsed` | 目录文件夹（收起） | `DirectoryIcon.folderCollapsed` | 📂 |
| `directory-folder-expanded` | 目录文件夹（展开） | `DirectoryIcon.folderExpanded` | 📁 |
| `directory-header` | 目录标题图标 | `DirectoryIcon.header` | 📜 |
| `toolbar-collapsed` | 顶部工具栏（收起） | `UIIcon.toolbarCollapsed` | ⚙ |
| `toolbar-expanded` | 顶部工具栏（展开） | `UIIcon.toolbarExpanded` | ◀ |
| `arrow` | 统一展开/收起箭头（单键 + CSS 旋转） | 见 1.1.1 箭头清单 | ▶ |
| `avatar-upload` | 管理面板·上传头像按钮图标 | `#uploadAvatarBtn` 前置 emoji | 📷 |
| `custom-texture` | 管理面板·自定义贴图区标题图标 | `.admin-icon-section-header` 前置 emoji | 🎨 |
| `theme-dark` | 主题切换·暗色图标 | `.theme-btn[data-theme=dark]` 前置 emoji | 🌙 |
| `theme-light` | 主题切换·亮色图标 | `.theme-btn[data-theme=light]` 前置 emoji | ☀️ |
| `theme-lofi` | 主题切换·低保真图标 | `.theme-btn[data-theme=lofi]` 前置 emoji | 📼 |
| `directory-visibility-visible` | 目录树·可见性图标（可见） | `.visibility-toggle[data-visible=true]` | 👁️ |
| `directory-visibility-hidden` | 目录树·可见性图标（不可见） | `.visibility-toggle[data-visible=false]` | 🚫 |
| `search` | 侧边栏搜索图标 | `.sidebar-search .search-icon` | 🔍 |
| `position-mode` | 进入位置管理按钮图标 | `#enterPositionModeBtn` 前置 emoji | 📌 |
| `article` | 目录树文章节点图标 | `.tree-node.article .node-icon`（`UI.directory.articleIcon`） | 📄 |
| `deco-style` | 贴纸库·切换样式图标 | `.asset-style-btn` + 右键菜单 `toggle-style` | 🔄 |
| `deco-duplicate` | 贴纸库·复制图标 | `.asset-duplicate-btn` + 右键菜单 `duplicate` | 📋 |
| `deco-rename` | 贴纸库·重命名图标 | `.asset-rename-btn` + 右键菜单 `rename` | ✏️ |
| `deco-edit-pos` | 贴纸库·编辑位置图标 | `.asset-deco-edit-btn` + 右键菜单 `deco-edit` | 📐 |
| `deco-download` | 贴纸库·下载图标 | `.asset-download-btn`（右键菜单无下载项） | ⬇️ |
| `deco-delete` | 贴纸库·删除图标 | `.asset-delete-btn` + 右键菜单 `delete-lib` | 🗑️ |

> 变更说明：原 `admin-panel` 键并入统一 `arrow` 键（管理面板折叠箭头是散落箭头之一）；旧 `UIIcon.adminPanel` 单图标上传与 localStorage 存储保留，作为无包时的回退，行为不变。

#### 1.1.1 统一箭头键 `arrow` 清单（单键 + CSS 旋转，覆盖全站展开/收起箭头）

- 约定：`arrow` 键的默认图标为**向右箭头（▶）**；通过 CSS `transform: rotate(...)` 派生四个方向，不新增其他箭头键。
- 旋转类：`.arrow-r0`（0°=▶ 向右）、`.arrow-r90`（90°=▼ 向下）、`.arrow-r180`（180°=◀ 向左）、`.arrow-r270`（270°=▲ 向上）。
- 包图标为 PNG/SVG 时渲染为 `<img>`，同样用上述类旋转；无包时回退各位置的 emoji/文本默认。

| 位置 | 选择器/来源 | 收起态 | 展开态 | 说明 |
|---|---|---|---|---|
| 管理面板折叠箭头 | `#panelToggleIcon`（`AdminPosition.applyCollapsedState`） | ▶ `r0` | ▼ `r90` | 原 `UIIcon.adminPanel` 回退仍生效 |
| 侧边栏收起按钮 | `#sidebarCollapseBtn`（`sidebar.js`） | ◀ `r180`（侧栏收起时） | ▶ `r0`（侧栏展开时） | 原 textContent 切换改为旋转类切换 |
| 目录树文件夹节点 toggle | `.tree-node.folder .toggle-icon[data-toggle=toggle]`（`directory/render.js`） | ▶ `r0` | ▼ `r90` | `search.expandSearchResults` 同步改旋转类 |
| 管理面板“自定义贴图”整合区折叠 | `#iconUploadSectionToggle`（`admin/panel/render.js`） | ▸ `r0` | ▾ `r90` | 原 ▾/▸ 文本切换改为旋转类 |
| 文章编辑器工具栏折叠 | 排除（文章编辑器模块） | — | — | 范围外 |

- 各位置原本以 `textContent = '▶'/'▼'` 硬编码切换的代码统一改造，但应用方式分两类：
  1. `#panelToggleIcon`：沿用 `UIIcon` 通道——`_applyArrow(url)` 内部调用 `UIIcon.setExternalIcon(UI_ICON_SLOTS.adminPanel, url)`，包箭头以 backgroundImage 渲染在元素上；`AdminPosition.applyCollapsedState` 改为维护 `arrow-r0/arrow-r90` 旋转类（`transform` 旋转整个元素，背景图随动）。无包时回退旧 `UIIcon.adminPanel` 单图标/emoji，行为不变。
  2. 其余位置（侧边栏 `#sidebarCollapseBtn`、目录树 `.toggle-icon[data-toggle=toggle]`、整合区 `#iconUploadSectionToggle`）：元素内渲染 `.icon-pack-arrow`——有包为 `<img class="icon-pack-arrow arrow-rX">`，无包为 `<span class="icon-pack-arrow arrow-rX">emoji</span>`；状态切换只换 `arrow-rX` 旋转类，`_applyArrow(url)` 遍历注入/清除 img。
- 图标包应用逻辑只需一处 `_applyArrow(url)`；旋转类由各组件状态逻辑维护，与图标包应用互不耦合。

#### 1.1.2 贴纸库六个功能图标的右键菜单复用

- 六个 `deco-*` 键在**贴纸库管理列表**（`js/ui/components/deco-ui.js` 的 `.asset-*-btn`）与**贴纸右键菜单**（`js/admin/events/context-menu.js` 的 `#deco-context-menu [data-action]`）两处复用，同一键渲染同一图标：

| 键名 | 贴纸库按钮选择器 | 右键菜单 data-action |
|---|---|---|
| `deco-style` | `.asset-style-btn` | `toggle-style` |
| `deco-duplicate` | `.asset-duplicate-btn` | `duplicate` |
| `deco-rename` | `.asset-rename-btn` | `rename` |
| `deco-edit-pos` | `.asset-deco-edit-btn` | `deco-edit` |
| `deco-download` | `.asset-download-btn` | （无，右键菜单不含下载） |
| `deco-delete` | `.asset-delete-btn` | `delete-lib` |

- 右键菜单另有「粘贴 📋」「从网页删除 ❌」两项不属于六个功能图标，**不纳入**本键表（保持既有 emoji）。
- 应用方式：`_applyDecoActionIcon(action, url)` 依据上表同时刷新两处；右键菜单项为「emoji + 文本」，只替换前置 emoji 部分（抽 `<span class="ctx-item-emoji">`），文本保留。

#### 超现实箱子键（10 个，对应 MagicBox 可替换贴图/物品）

| 键名 | 中文名 | 对应现有槽位 | 现有回退默认 |
|---|---|---|---|
| `box-lid` | 箱子·箱盖贴图 | `MagicBox` 箱盖（`setCustomLidImage`） | CSS 绘制箱盖 |
| `box-body` | 箱子·箱体贴图 | `MagicBox` 箱体（`setCustomBodyImage`） | CSS 绘制箱体 |
| `box-item-feather` | 箱子物品·白色羽毛 | `MagicBox.itemImages.feather` | 🪶 |
| `box-item-coin` | 箱子物品·旧硬币 | `MagicBox.itemImages.coin` | 🪙 |
| `box-item-key` | 箱子物品·生锈钥匙 | `MagicBox.itemImages.key` | 🗝️ |
| `box-item-note` | 箱子物品·字条 | `MagicBox.itemImages.note` | 📄 |
| `box-item-sand` | 箱子物品·一粒沙 | `MagicBox.itemImages.sand` | ⏳ |
| `box-item-thread` | 箱子物品·纽扣 | `MagicBox.itemImages.thread` | 🧵 |
| `box-item-mirror` | 箱子物品·小镜子 | `MagicBox.itemImages.mirror` | 🪞 |
| `box-item-void` | 箱子物品·虚空 | `MagicBox.itemImages.void` | 🌫️ |

- 键名统一使用小写 + 连字符；匹配时**精确匹配**（区分大小写）。
- `box-item-{id}` 的 `{id}` 与 `UI.magicBox.items` 中物品 `id` 一一对应（feather/coin/key/note/sand/thread/mirror/void），保证映射零转换。
- 打包时文件命名：`{键名}.png` 或 `{键名}.svg`，可放任意层子目录（取 basename 去扩展名）。

#### 不纳入图标包的键（内容图/非图标，明确排除）

| 排除项 | 理由 |
|---|---|
| 头像（`AdminAvatar`） | 管理员照片，非 UI 图标 |
| 贴纸库（`DecoShelf`）、页面贴纸槽（decoLogo/Stamp/Raven） | 用户内容，随文章内容存储 |
| 拼图背景图（`PuzzleCustomizer`） | 照片/内容图，且允许 jpg/webp |
| 纹理贴图（`Texture`） | 背景纹理，非图标 |
| 水印/背景色/渐变色/视频透明度 | 文本或颜色，非图标 |
| 文章编辑器全部按钮/贴纸图标 | 需求明确排除（图标包范围不含文章编辑器模块） |
| 主题 favicon（`/themes/{id}/favicon*`） | 跟随主题 CSS 切换，暂不纳入 |

### 1.2 格式与尺寸

- 支持格式：仅 `.png`、`.svg`（其余文件在遍历中忽略，但会统计为「非图片文件」仅用于日志）。
- 推荐尺寸范围：**64px ～ 512px（任一维度）**；范围常量 `ICON_PACK_SIZE_RANGE = { min: 64, max: 512 }`。
- 压缩策略：PNG 任一边 > 512 时等比缩小到 512（Canvas，`image/png` 输出，**不放大**、**不改变颜色**）；SVG 不栅格化。
- 尺寸越界（任一维度 < min 或 > max）＝**警告**，不阻断上传（需求 R2 保证任意大小可上传）。

### 1.3 安全性检查（前端，上传前）

在 `icon-pack-processor.js` 中一次性完成（一次遍历同时收集尺寸信息）：

1. zip 炸弹防护：entry 总数 ≤ 200；单文件解压 ≤ 5MB；总解压 ≤ 50MB。
2. 仅处理 `.png`/`.svg`；忽略目录项与其他文件。
3. PNG：校验 magic number（8 字节签名 `89 50 4E 47 0D 0A 1A 0A`）。
4. SVG：文本级扫描，出现以下任一即**阻断**：`<script`、`on`+事件属性（`on\w+\s*=`）、`javascript:`、`<foreignObject`、`<!ENTITY`、`<iframe`、`<object`。
5. 尺寸检测（PNG 解码宽高；SVG 解析 width/height/viewBox，解析不到给「无法检测尺寸」警告）。
6. 键名匹配：basename 去扩展名 → 与注册表比对；未知键名收集为警告；缺失键名收集为警告。

阻断项（errors）→ 阻止上传并列表提示；警告项（warnings）→ 弹确认列表，用户确认后仍可上传。

### 1.4 主题绑定模型

- 主题 id：`dark` / `light` / `lofi`（与 `ThemeService.THEMES` 一致）。
- 每个包 `themes` 字段存 JSON 数组，**至少 1 个主题**。
- 每个主题同一时刻只有 **1 个生效包**：settings 表键 `icon_pack_active_{themeId}` → pack_id。
- 上传时选中主题 T ⇒ 把该包设为 T 的生效包。
- 已应用后修改主题勾选：勾选 T ⇒ 设为 T 生效包；取消勾选 T 且 T 当前生效包是本包 ⇒ 清空 T 的生效包（回到默认/旧单图标）。
- 多个包勾选同一主题时，后操作者成为该主题生效包（简单、可预期）。

### 1.5 图标应用优先级（不破坏现有功能）

```
主题包图标（当前主题的生效包） > 旧版单槽位 localStorage 图标（SiteIcon/DirectoryIcon/UIIcon/BoxState 自定义图） > 默认 emoji/CSS 默认
```

- 未上传任何包时行为与现状完全一致（旧单槽位上传、箱子贴图上传仍生效）。
- 有包生效时，仅覆盖包内存在的键；包内缺失的键回退旧单槽位/旧箱子自定义图/默认。
- 箱子键走 `BoxState` 的 external 覆盖（不写 `rv_box_data`），删除包或切换主题后旧自定义图不被破坏。
- 切换主题时自动重新应用（订阅 `THEME_CHANGED`）。

### 1.6 API 设计（沿用 enhance.cjs 风格）

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/icon-packs` | requireAuth | 上传：JSON `{ name, themeIds, zipBase64 }` |
| GET | `/api/icon-packs` | 公开 | 包列表（含 themes、iconKeys） |
| GET | `/api/icon-packs/status` | 公开 | 三个主题状态（生效包 + 每个键是否自定义 + 图标 URL） |
| GET | `/api/icon-packs/:id/icons/:key` | 公开 | 输出图标二进制（content-type 取自 DB） |
| PUT | `/api/icon-packs/:id/themes` | requireAuth | JSON `{ themeIds }`，校验 ≥1 |
| DELETE | `/api/icon-packs/:id` | requireAuth | 删除包、文件、清理生效引用 |

广播：写操作后 `broadcast({ type: 'icon_packs_changed' })`。

### 1.7 数据模型（sql.js，db.cjs 内新增）

```sql
CREATE TABLE IF NOT EXISTS icon_packs (
  id TEXT PRIMARY KEY,                -- iconpack_{ts}_{rand}
  name TEXT NOT NULL,
  themes TEXT NOT NULL DEFAULT '[]',  -- JSON 数组
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS icon_pack_icons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pack_id TEXT NOT NULL,
  icon_key TEXT NOT NULL,
  file_key TEXT NOT NULL,             -- 存储适配器中的文件名/key
  mime TEXT NOT NULL,                 -- image/png | image/svg+xml
  UNIQUE(pack_id, icon_key)
);
CREATE INDEX IF NOT EXISTS idx_icon_pack_icons_pack ON icon_pack_icons(pack_id);
```

---

## 2. 实施步骤

### 阶段 A：基础设施（后端与公共常量）

#### A1. 安装 jszip 依赖

- 文件：`package.json`（dependencies 增加 `"jszip": "^3.10.1"`）。
- 执行：`npm install jszip@^3.10.1`（前端浏览器端与后端 Node 端共用）。
- 验证：`node -e "require('jszip'); console.log('ok')"` 输出 ok。
- 回退：从 package.json 移除并 `npm uninstall jszip`。

#### A2. 前端图标键注册表

- 新建：`js/services/icon-pack-keys.js`。
- 内容规格：

```js
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
```

- 验证：`node --input-type=module -e "import('./js/services/icon-pack-keys.js').then(m=>console.log(m.ICON_PACK_KEYS.length))"` 输出 33；且 `box-item-*` 键集合与 `UI.magicBox.items` 的 id 集合完全一致。
- 回退：删除该文件。

#### A3. 事件常量与 UI 文案

- 修改：`js/core/event-constants.js`，在“其他”域追加：
  - `ICON_PACKS_CHANGED: 'icon-packs:changed'`
- 修改：`js/utils/ui-strings.js`，`UI` 下新增 `iconPack` 命名空间，字段：
  - `sectionLabel`「📦 图标包管理」、`uploadButton`「📤 上传图标包」、`packNamePlaceholder`「图标包名称」、
  - `fileInputLabel`「选择 zip 文件」、`themeLabel`「绑定主题」、`selectAll`「全选」、
  - `hint`（含：命名规则 `键名.png/.svg`、支持子目录、推荐尺寸 64–512px、支持 png/svg）、
  - `deleteButton`「🗑️ 删除」、`emptyList`「暂无图标包」、
  - `validationErrorsTitle`「安全性检查未通过」、`validationWarningsTitle`「检查提示（可继续上传）」、
  - `confirmUpload`「仍要上传」、`cancelUpload`「取消上传」、
  - `missingKeys`「缺少图标键」、`unknownKeys`「未识别图标」、`outOfRange`「尺寸超出推荐范围」、
  - 键名文档相关文案（C1 使用）：
    ```js
    docTitle: '🎨 图标键名参考',
    docTabDark: '🌙 暗色',
    docTabLight: '☀️ 亮色',
    docTabLofi: '📼 低保真',
    docLegendDefault: '● 灰色 = 使用默认图标',
    docLegendCustom: '● 绿色 = 已有自定义图标',
    docGroupBase: '基础 UI 图标',
    docGroupBox: '超现实箱子图标',
    ```
  - `uploadSuccess`「图标包已上传」、`uploadFailed`「图标包上传失败」、`deleteSuccess`「图标包已删除」、
  - `themeRequired`「至少选择一个主题」、`nameRequired`「请输入图标包名称」。
- 验证：`npm run lint` 无新增错误；`grep -n iconPack js/utils/ui-strings.js` 存在。
- 回退：删除对应新增字段。

#### 检查点 1：A1-A3 完成后

```bash
npm run lint
```

确保无新增错误；`js/services/icon-pack-keys.js` 可独立导入（见 A2 验证命令），`UI.iconPack` 文案字段齐全。

#### A4. 存储适配器扩展（支持图标包独立目录/前缀，向后兼容）

- 修改：`backend/storage/adapters/local.cjs`
  - 构造函数改为 `constructor(options = {})`；`this.uploadDir = options.uploadDir || LOCAL_CONFIG.uploadDir`；`this.baseUrl = options.baseUrl || LOCAL_CONFIG.baseUrl`；`this.idPrefix = options.idPrefix || 'deco_'`。
  - `upload()` 中 id 生成为 `this.idPrefix + Date.now() + '_' + random`，其余不变。
  - 保证 `new LocalAdapter()` 无参行为与现状一致。
- 修改：`backend/storage/adapters/rustfs.cjs`
  - 构造函数改为 `constructor(options = {})`；`this.keyPrefix = options.keyPrefix || 'deco_'`。
  - `upload()` 中 `const key = this.keyPrefix + Date.now() + '_' + random + '.' + ext`，其余不变。
- 修改：`backend/storage/storage-service.cjs`
  - 构造函数改为 `constructor(options = {})`，`this.adapter = this.type === 'rustfs' ? new RustFSAdapter(options) : new LocalAdapter(options)`。
  - 导出：保留 `module.exports = storage` 的同时追加 `module.exports.StorageService = StorageService`（`require('./storage-service.cjs').StorageService` 可用）。
- 修改：`backend/storage/config.cjs` 追加：

```js
const ICON_PACK_LOCAL_CONFIG = {
  uploadDir: path.join(__dirname, '..', 'uploads', 'icon-packs'),
  baseUrl: '/uploads/icon-packs',
  idPrefix: 'iconpack_',
};
// 导出列表中加入 ICON_PACK_LOCAL_CONFIG
```

- 验证：`node -e "const s=require('./backend/storage/storage-service.cjs'); console.log(s.isLocal(), typeof s.StorageService)"`；重启后端无报错；旧贴纸上/读/删不受影响。
- 回退：git 还原四个文件。

#### A5. 数据库表

- 修改：`backend/db.cjs` 的 `initDb()`，在 `crew_usage` 表之后追加 1.7 节的两条 `CREATE TABLE IF NOT EXISTS` 与索引。
- 验证：删除 `backend/revachol.db`（备份后）重启后端，日志出现新表；或 `node -e "require('./backend/db.cjs').initDb().then(()=>console.log('ok'))"`。
- 回退：还原 db.cjs（表用 IF NOT EXISTS，不会破坏旧库）。

#### A6. 后端路由 icon-packs.cjs + 注册

- 新建：`backend/routes/icon-packs.cjs`。
- 结构规格：

```js
const { send, sendError } = require('../enhance.cjs');
const { StorageService } = require('../storage/storage-service.cjs');
const { ICON_PACK_LOCAL_CONFIG } = require('../storage/config.cjs');
const dbModule = require('../db.cjs');
const { broadcast } = require('../websocket.cjs');
const { requireAuth } = require('../auth.cjs');
const JSZip = require('jszip');

const THEME_IDS = ['dark', 'light', 'lofi'];
const ACTIVE_KEY = (themeId) => `icon_pack_active_${themeId}`;
// iconPackStorage：本地目录 uploads/icon-packs；rustfs key 前缀 'icon-packs/'
const iconPackStorage = new StorageService({
  uploadDir: ICON_PACK_LOCAL_CONFIG.uploadDir,
  baseUrl: ICON_PACK_LOCAL_CONFIG.baseUrl,
  idPrefix: ICON_PACK_LOCAL_CONFIG.idPrefix,
  keyPrefix: 'icon-packs/',
});
```

- 处理函数（伪代码规格）：

1. `POST /api/icon-packs`（requireAuth）：
   - 手动读 body（限制 ≤ 40MB 字符串）→ JSON.parse → `{ name, themeIds, zipBase64 }`。
   - 校验 name 非空且 ≤100 字符；`themeIds` 为数组、非空、每个 ∈ THEME_IDS；否则 400。
   - `zipBase64` 去掉 data URL 前缀 → Buffer；Buffer 为空 400。
   - `JSZip.loadAsync(buffer)`；遍历 entries：
     - `entry.dir` 跳过；`!/\.(png|svg)$/i.test(name)` 跳过。
     - basename 去扩展名 → key；`entry.async('nodebuffer')` 取内容。
     - 大小限制（单文件 ≤5MB、累计 ≤50MB、条目 ≤200），超限 400。
     - PNG：8 字节 magic 校验，失败 400。
     - SVG：`<script|on\w+\s*=|javascript:|<foreignObject|<!ENTITY|<iframe|<object` 任一命中 400。
   - 写入：`packId = 'iconpack_' + Date.now() + '_' + rand`；每个图标 `iconPackStorage.upload(buf, `${key}.${ext}`, mime)` → 存 `icon_pack_icons(pack_id, icon_key, file_key, mime)`。
   - `dbModule.run('INSERT INTO icon_packs ...', [packId, name, JSON.stringify(themeIds)])`。
   - 每个 themeId：`dbModule.run("INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)", [ACTIVE_KEY(themeId), JSON.stringify(packId)])`。
   - `broadcast({ type: 'icon_packs_changed' })`；`send(res, { id: packId, name, themes: themeIds })`。

2. `GET /api/icon-packs`：查询 icon_packs 全部行 + 每个包的 `icon_key` 列表，返回数组（themes 反序列化）。

3. `GET /api/icon-packs/status`：
   - 对每个 themeId：读 `settings` 中 `ACTIVE_KEY(themeId)` → packId；查包名与 `icon_pack_icons`。
   - 返回 `{ themes: { [themeId]: { activePackId, activePackName, icons: { [key]: { custom, url, mime } } } } }`，icons 遍历**全量注册键**（后端内置与前端一致的 33 个键名常量数组，见 A2，此处硬编码一份并注释“与 js/services/icon-pack-keys.js 保持同步”）。
   - 未生效包的键：`{ custom: false, url: null, mime: null }`。
   - url：`/api/icon-packs/{packId}/icons/{key}`。

4. `GET /api/icon-packs/:id/icons/:key`：查 `icon_pack_icons`（pack_id + icon_key）→ `iconPackStorage.read(file_key)` → 200 + `Content-Type: mime` + `Cache-Control: public, max-age=31536000`；未命中 404。

5. `PUT /api/icon-packs/:id/themes`（requireAuth）：`json(req)` → 校验 themeIds（同上）→ 查包存在（否则 404）→ `UPDATE icon_packs SET themes=? WHERE id=?` → 重算生效引用：新集合内每个 theme 设为该包生效；对「旧集合有而新集合无」的主题，若其生效包 === 本包则置空（`DELETE FROM settings WHERE key=?`）→ broadcast → send `{ success: true }`。

6. `DELETE /api/icon-packs/:id`（requireAuth）：查包（否则 404）→ 查全部 `icon_pack_icons` 逐条 `iconPackStorage.delete(file_key)` → 删 icons 行、删 pack 行 → 对每个 themeId 若生效包 === 本包则删 settings 键 → broadcast → send `{ success: true }`。

- 修改：`backend/server.cjs`
  - `const { registerIconPackRoutes } = require('./routes/icon-packs.cjs');`
  - 路由注册区追加 `registerIconPackRoutes(GET, POST, PUT, DELETE);`（POST 走注册路由，不需要 server.cjs 内联分支；注意 `enhance.match` 先精确匹配，`/api/icon-packs/status` 与 `/api/icon-packs` 均精确命中，无歧义）。
- 修改：`backend/utils.cjs` 或 route 内自行 `fs.mkdirSync(ICON_PACK_LOCAL_CONFIG.uploadDir, { recursive: true })`（建议在 route 模块加载时执行）。
- 验证：`node backend/server.cjs` 启动无报错；`curl http://127.0.0.1:9999/api/icon-packs/status` 返回 `{"themes":{"dark":{...},"light":{...},"lofi":{...}}}`。
- 回退：删除新文件 + 还原 server.cjs。

#### 检查点 2：A4-A6 完成后

```bash
curl -s http://127.0.0.1:9999/api/icon-packs/status
```

所有 API 端点返回预期（status 三个主题结构完整、`GET /api/icon-packs` 返回空数组、未登录 `POST /api/icon-packs` 返回 401）。配合 D2 的 curl 脚本做一次上传/改主题/删除全链路冒烟。

---

### 阶段 B：前端核心服务

#### B1. `js/services/icon-pack-processor.js`（纯逻辑，可单测）

- 新建该文件，依赖 `jszip`、`js/services/icon-pack-keys.js`、`js/utils/dom.js`（escapeHtml 用于错误展示）。
- 导出函数：

```js
export async function inspectZipFile(file) 
  // -> { errors: string[], warnings: string[], icons: [{key, entryName, ext, size, width, height, blob}],
  //      missingKeys: string[], unknownKeys: string[], outOfRange: [{name, width, height}] }
export function checkPngMagic(bytes)            // 8 字节签名校验
export function scanSvgSecurity(text)           // 返回 string[] 命中项；空数组=安全
export async function detectPngSize(blob)       // Image 解码 -> {width, height}
export function detectSvgSize(text)             // width/height/viewBox -> {width, height} | null
export async function resizePng(blob, maxDim)   // 任一边 > maxDim 时 Canvas 等比缩小，输出 image/png blob；否则原样返回
export async function buildNormalizedZip(file, { compressPng = true } = {})
  // 遍历 zip -> 校验 -> PNG 可选压缩 -> 以 `${key}.${ext}` 平铺生成新 JSZip -> 返回 JSZip 实例（由调用方 generateAsync 出 base64）
```

- 关键规格：
  - 遍历：`zip.forEach` 或 `Object.values(zip.files)`，`entry.dir` 跳过；仅 `.png/.svg`（`/\.(png|svg)$/i`）计入 icons；其余文件忽略（目录遍历满足 R8）。
  - key = `entry.name.split('/').pop().replace(/\.(png|svg)$/i, '')`（支持子目录）。
  - 校验顺序：限制检查 → magic/安全 → 尺寸检测 → 键名匹配（未知键）→ 缺失键统计 → outOfRange 统计。
  - `resizePng` 保持宽高比；不放大；输出 `canvas.toBlob(..., 'image/png')`。
  - `buildNormalizedZip` 输出条目为 `{key}.png`/`{key}.svg`（无子目录），**返回 JSZip 实例**（不再内部生成 base64；由 B2 调用 `generateAsync`）。

> 注意：`resizePng` 仅在浏览器端运行（Canvas API），Node.js 环境不执行压缩。后端接收 `zipBase64` 时，所有 PNG 已在前端完成等比缩小，后端不做二次压缩。

- 验证（jsdom 无 canvas，测试只覆盖纯函数与 mock canvas 的尺寸逻辑，见 D1）。
- 回退：删除文件。

#### B2. `js/services/icon-pack-service.js`（API + 状态 + 应用）

- 新建该文件，依赖 `ApiClient`、`EventBus/EVENTS`、`ThemeService`、`icon-pack-keys.js`、`icon-pack-processor.js`、`SiteIcon`、`DirectoryIcon`、`UIIcon`、`getMagicBox`（`js/ui/components/magic-box/index.js`）、`debounce`（`js/utils/function.js`）。
- 接口：

```js
export const IconPackService = {
  async loadStatus(force = false)   // GET /api/icon-packs/status，内存缓存
  async loadPacks()                 // GET /api/icon-packs
  async uploadPack(file, name, themeIds)
    // 1) inspectZipFile(file)；errors 非空 -> throw { code:'VALIDATION_ERRORS', errors }
    // 2) warnings 非空 -> 交给调用方确认（本函数提供 report）
    // 3) buildNormalizedZip(file) + generateAsync -> zipBase64（见下方代码）
    // 4) ApiClient.post('/api/icon-packs', { name, themeIds, zipBase64 }, { timeout: 60000 })
    // 5) 清缓存 + emit ICON_PACKS_CHANGED
  async updatePackThemes(id, themeIds) // PUT
  async deletePack(id)                 // DELETE
  async applyActivePack(themeId)       // 见下方“应用逻辑”
  refreshCurrent()                     // 防抖包装（300ms），见下方代码
}
```

```js
// B2 uploadPack 第 3-4 步细化
const normalizedZip = await buildNormalizedZip(file);
const zipBase64 = await normalizedZip.generateAsync({ type: 'base64' });

const result = await ApiClient.post('/api/icon-packs', {
    name,
    themeIds,
    zipBase64,  // 后端用 Buffer.from(zipBase64, 'base64') 解码
}, { timeout: 60000 });
```

```js
// B2 新增：refreshCurrent 防抖（300ms）
// 目的：THEME_CHANGED / ICON_PACKS_CHANGED / COMPONENT_MOUNTED 可能短时间内连续触发，
// 防抖合并为一次 applyActivePack，避免重复请求与 DOM 抖动。
import { debounce } from '../utils/function.js';

// 在 IconPackService 中
refreshCurrent: debounce(async function() {
    const theme = ThemeService.getCurrentTheme();
    await this.applyActivePack(theme);
}, 300),
```

- 应用逻辑 `applyActivePack(themeId)`：
  1. `status = await loadStatus(true)`；`active = status.themes[themeId]`。
  2. 对每个 `ICON_PACK_KEYS`：
     - `packIcon = active?.icons[key]`；
     - `url = packIcon?.custom ? packIcon.url : null`；
     - 按 `slot` 分发（`slot` 形如 `'directory:folderCollapsed'`，冒号后为对应管理器的槽位常量名）：
       - `site` → `SiteIcon.applyIcon(url || SiteIcon.getIcon())`（传 null 显示默认回退；传 legacy dataUrl 保留旧图标）。
       - `directory:*` → `DirectoryIcon.setExternalIcon(slotSuffix, url)`。
       - `ui:*` → `UIIcon.setExternalIcon(slotSuffix, url)`。
       - `arrow` → `_applyArrow(url)`：遍历 `.icon-pack-arrow`，有 url 时替换为 `<img src>`（保留各元素自身 `arrow-rX` 旋转类），无 url 时还原各位置 emoji 默认；见 1.1.1。
       - `admin-label:avatarUpload` → `_applyLabelIcon('#uploadAvatarBtn', url, '📷 上传头像')`（替换按钮前置 emoji，无 url 还原文本）。
       - `admin-label:customTexture` → `_applyLabelIcon('.admin-icon-section-header > span', url, '🎨 自定义贴图')`。
       - `theme:{themeId}` → `_applyThemeIcon(themeId, url)`：对 `.theme-btn[data-theme=themeId]`，有 url 时前置 emoji 替换为 `<img class="theme-btn-icon">`，无 url 还原 `UI.theme.*` 的 emoji 文本。
       - `directory:visibilityVisible` / `directory:visibilityHidden` → `_applyDirectoryVisibility(visibleUrl, hiddenUrl)`：遍历 `.visibility-toggle`，按 `data-visible` 选对应 url 渲染 `.icon-pack-visibility`（img 或 👁️/🚫）。
       - `search` → `_applyLabelIcon('.sidebar-search .search-icon', url, '🔍')`。
       - `position-mode` → `_applyLabelIcon('#enterPositionModeBtn', url, '📌 进入位置管理')`。
       - `directory:article` → `_applyDirectoryArticleIcon(url)`：遍历 `.tree-node.article .node-icon`，有 url 替换为 `<img class="node-icon node-icon-img">`，无 url 还原 `UI.directory.articleIcon`。
       - `deco:style/duplicate/rename/editPos/download/delete` → `_applyDecoActionIcon(action, url)`：同时刷新贴纸库按钮与右键菜单项（映射见 1.1.2），有 url 替换前置 emoji 为 `<img>`，无 url 还原 emoji 文本。
       - `magicbox:lid` → `MagicBox.setExternalLidImage(url)`（见 B3，不写 localStorage）。
       - `magicbox:body` → `MagicBox.setExternalBodyImage(url)`。
       - `magicbox:item:{itemId}` → `MagicBox.setExternalItemImage(itemId, url)`。
     - magic-box 分发统一经过 `_applyMagicBox(key, url)`：`getMagicBox()` 为 null 时记 `_pendingMagicBox = true` 并跳过（组件挂载后补应用）。
     - 标签/主题图标分发（`_applyLabelIcon`/`_applyThemeIcon`）只操作**已渲染 DOM**；管理面板未打开时无对应元素则跳过，`ADMIN_*`/面板打开后由 `refreshCurrent()` 补应用（在 `AdminPanel.renderContent` 末尾调用一次）。
- 订阅：`EventBus.on(EVENTS.THEME_CHANGED, ({ themeId }) => this.applyActivePack(themeId))`；`EventBus.on(EVENTS.ICON_PACKS_CHANGED, () => this.refreshCurrent())`；`EventBus.on(EVENTS.COMPONENT_MOUNTED, (payload) => { if (payload?.name === 'magic-box' && this._pendingMagicBox) this.refreshCurrent(); })`（箱子懒挂载晚于首次 apply 时补应用）。
- 初始化：`init()`（在 `app.js` DOM 就绪后调用，读当前主题应用一次）。
- 修改：`js/services/api-client.js` 的 `request()` 支持可选超时（默认保持 10s）：读取 `finalOptions.timeout` 后从 options 中剔除再传给 fetch。
- 验证：`npm run test` 通过；手动上传 zip 后页面图标即时切换。
- 回退：删除文件 + 还原 api-client.js。

#### B3. 旧图标管理器扩展（外部 URL 覆盖，不写 localStorage）

- 修改：`js/services/directory-icon.js`
  - 增加 `this._external = {}`；`setExternalIcon(slot, url)`：`url` 为真值时写 `_external[slot] = url`，否则 `delete _external[slot]`（删除后回退旧逻辑）；最后 `applyAll()`。
  - `getIcon(slot)` 改为：`if (this._external && this._external[slot]) return this._external[slot];` 再走原 storage 逻辑。
- 修改：`js/services/ui-icon.js`
  - 同样增加 `this._external = {}`、`setExternalIcon(slot, url)`（同上：真值写入、空值删除）；`getIcon(slot)` 优先 `_external`。
  - `applyToolbarIcons/applyAdminPanelIcon` 无需改动（都经 `getIcon`）。
- `site-icon.js` 无需改动（`applyIcon(src)` 已支持任意 src 且不落 storage）。
- 修改：`js/ui/components/magic-box/BoxState.js`（外部覆盖不持久化，保证旧自定义图不被覆盖）
  - 增加 `this._external = { lid: null, body: null, items: {} }`（不参与 `_save()`）。
  - 新增 `setExternalLidImage(url)` / `setExternalBodyImage(url)` / `setExternalItemImage(itemId, url)`：真值写入、空值删除，均**不调用 `_save()`**，写后由调用方触发渲染刷新。
  - `getCustomLidImage()` 改为：`return this._external.lid || this._data.customLidImage;`；`getCustomBodyImage()`、`getItemImage(itemId)` 同理（external 优先）。
  - `hasCustomAppearance()` 同样把 external 计入。
- 修改：`js/ui/components/magic-box/index.js`（`BoxManager` 增加三个透传方法）
  - `setExternalLidImage(url)` / `setExternalBodyImage(url)` / `setExternalItemImage(itemId, url)` → 调 `this._state` 对应方法后，再调 `this._renderer` 的 `_applyCustomImages()`（或 `_updateItemDisplay()`）立即刷新；`_renderer` 方法若为私有，改为暴露 `applyCustomImages()`/`updateItemDisplay()` 公共包装。
- 验证：旧箱子贴图/物品上传与重置行为不变（无 external 时走原 storage）；`setExternalLidImage(null)` 后回退旧自定义图或 CSS 默认。
- 回退：git 还原相关文件。

#### B4. 统一箭头与文本标签图标 DOM 改造（无逻辑耦合，仅标记/渲染）

- 修改：`js/admin/position.js`（`applyCollapsedState`）
  - `#panelToggleIcon` 的状态切换由 `textContent = '▶'/'▼'` 改为维护 `arrow-r0`/`arrow-r90` 类；emoji 文本由 UIIcon 逻辑负责（无包时仍显示 ▶/▼）。
- 修改：`js/ui/components/sidebar.js`
  - `#sidebarCollapseBtn` 的 `textContent = '◀'/'▶'` 改为内部渲染 `.icon-pack-arrow`（emoji 或 img）+ `arrow-r180`/`arrow-r0` 切换。
- 修改：`js/ui/components/directory/render.js`
  - 文件夹节点 `toggleIconHTML`（`'▶' : '▼'`）改为 `.icon-pack-arrow arrow-r0/arrow-r90`（emoji 或 img）；文章节点 📭 与空节点不动。
- 修改：`js/ui/components/search.js`
  - `expandSearchResults()` 中 `toggleIcon.textContent = '▼'` 改为给 `.icon-pack-arrow` 切换 `arrow-r90`。
- 修改：`js/admin/panel/render.js`
  - `#iconUploadSectionToggle` 的 `▾`/`▸` 文本切换改为 `.icon-pack-arrow arrow-r90/arrow-r0`；
  - 主题按钮 `.theme-btn` 渲染保留 `data-theme`，前置 emoji 抽为 `<span class="theme-btn-emoji">`，便于 `_applyThemeIcon` 替换为 `<img>`；
  - `#uploadAvatarBtn`、`.admin-icon-section-header > span` 前置 emoji 抽为 `<span class="admin-label-emoji">`（或由 `_applyLabelIcon` 直接 `textContent` 前缀替换，二选一，推荐抽 span 方案，避免文案耦合）。
- 修改：`index.html`
  - `.sidebar-search` 内新增 `<span class="search-icon">🔍</span>`（搜索输入框前置图标槽）；
  - `#enterPositionModeBtn` 前置 emoji 抽为 `<span class="admin-label-emoji">📌</span>` + 文本。
- 修改：`js/ui/components/directory/render.js`
  - `.visibility-toggle` 按钮内容抽为 `<span class="icon-pack-visibility">👁️/🚫</span>`（由 `_applyDirectoryVisibility` 替换为 img）；
  - 文章节点图标（`UI.directory.articleIcon`）保留 `.node-icon` 类，`_applyDirectoryArticleIcon` 可直接替换（无需额外标记）。
- 修改：`js/ui/components/directory/directory-visibility.js`
  - 切换成功后 `btn` 内 `.icon-pack-visibility` 重渲染（img 或 emoji）；或调用 `window.__REVACHOL__?.IconPackService?.refreshCurrent()`（沿用 `window.__REVACHOL__` 松耦合模式）刷新全部可见性图标。
- 修改：`js/ui/components/deco-ui.js`
  - 六个功能按钮（`.asset-style-btn/.asset-duplicate-btn/.asset-rename-btn/.asset-deco-edit-btn/.asset-download-btn/.asset-delete-btn`）内容抽为 `<span class="asset-btn-emoji">emoji</span>`，便于 `_applyDecoActionIcon` 替换为 `<img>`。
- 修改：`js/admin/events/context-menu.js`
  - 七项菜单中与六个功能图标对应的五项（`toggle-style/duplicate/rename/deco-edit/delete-lib`）前置 emoji 抽为 `<span class="ctx-item-emoji">emoji</span>`；`paste`、`remove-page` 两项不抽（不属于六个功能键）。
- 修改：`css/components/admin.css`
  - 追加 `.icon-pack-arrow`、`.arrow-r0/.arrow-r90/.arrow-r180/.arrow-r270`（`transform: rotate(...)`、`display:inline-block`、`transition: transform .15s`）、`.theme-btn-icon`、`.admin-label-emoji`、`.search-icon`、`.icon-pack-visibility`、`.asset-btn-emoji`、`.ctx-item-emoji` 样式（统一 `width/height`、`object-fit:contain`、`vertical-align`）。
- 验证：无图标包时四个箭头位置展开/收起显示与改造前一致；上传含 `arrow.png` 的包后四处箭头同时替换且方向正确；含 `theme-dark.png` 的包只替换暗色主题按钮图标；含 `search.png`/`position-mode.png`/`article.png`/`directory-visibility-visible.png`/`directory-visibility-hidden.png`/`deco-*.png` 的包分别替换对应图标，右键菜单同步复用。
- 回退：git 还原上述文件。

#### 检查点 3：B1-B4 完成后

手动上传一个含 `site.png` 的 ZIP（可通过临时在 C2 之前用浏览器控制台调用 `IconPackService.uploadPack(file, 'test', ['dark'])` 验证），确认站点图标应用成功；再删除该包确认回退旧图标。此检查点不依赖 C1/C2 的 UI。

---

### 阶段 C：UI

#### C1. 工具栏键名文档（三主题可切换）

- 新建：`js/ui/components/icon-pack-doc.js`：

```js
export const IconPackDoc = {
  render(container) { /* 渲染：标题 + 3 个主题 tab（data-doc-theme）+ 图例 + 键列表 */ },
  _renderKeyList(themeId) { /* 分两组渲染：基础 UI 键（含统一箭头/标签/主题图标）+ 超现实箱子键；每键：● 灰/绿 + 键名 + 中文名；数据来自 IconPackService.loadStatus() */ },
  destroy() { /* 清理事件与订阅 */ },
};
```

- 渲染容器：`#toolbarContent`（`index.html` 已存在）。
- 交互：tab 点击切换 `dark/light/lofi`（当前主题 tab 默认选中）；状态色：`custom=false` 灰（`var(--color-text-muted)`）、`custom=true` 绿（`var(--color-success)`）。
- 订阅 `ICON_PACKS_CHANGED` 重渲染；不随 `THEME_CHANGED` 自动切 tab（仅高亮当前主题 tab）。
- 修改：`index.html` 的 `.toolbar-tools` 内，在 help 按钮后追加：
  `<button class="tool-item" data-tool="icon-pack" title="图标包键名文档">🎨</button>`
- 修改：`js/app.js`
  - import `IconPackDoc` 与 `IconPackService`；
  - 在现有 toolbar setTimeout 内追加：`iconPackBtn` 点击 → 切换 active class（与 help 互斥）→ `IconPackDoc.render(document.getElementById('toolbarContent'))`；
  - 在 `ThemeService.init()` 附近调用 `IconPackService.init()`（延迟到 DOM 就绪后，约在 `SiteIcon.init()` 之后）。
- 修改：`css/components/admin.css` 追加样式：`.icon-pack-doc`、`.icon-pack-doc-tabs`、`.icon-pack-doc-tab.active`、`.icon-pack-key`、`.icon-pack-key .dot`、`.dot.custom`（绿）/`.dot.default`（灰）。
- 验证：点击 🎨 工具栏展开显示文档；三个 tab 可切换；上传包后对应主题 tab 的键变绿。
- 回退：删新文件、还原 index.html/app.js/admin.css 的改动。

#### C2. 管理面板「图标包管理」区

- 修改：`js/admin/panel/render.js`
  - 在「贴图库」区之后插入 `iconPackSection` HTML：
    - 标题 `UI.iconPack.sectionLabel`；
    - 上传行：名称 input（id `iconPackNameInput`）、主题复选框组（id `iconPackThemeCheckboxes`，含 3 主题 + 全选 checkbox id `iconPackThemeSelectAll`）、文件选择（`<input type="file" id="iconPackFileInput" accept=".zip" data-action="icon-pack-file">`）、上传按钮（`data-action="upload-icon-pack"`）；
    - 提示行：`UI.iconPack.hint`（含推荐尺寸范围 64–512px、命名规则、子目录说明、png/svg）；
    - 列表容器：id `iconPackList`（每行：名称 + 主题勾选（`data-action="icon-pack-theme-change"` data-id/data-theme）+ 删除按钮 `data-action="icon-pack-delete"`）。
  - 在 `render.js` 末尾新增 `AdminPanel.renderIconPackList = function (packs) { ... }`（渲染包列表；供 events 与首次渲染复用）。
  - `renderContent()` 首次渲染后调用 `IconPackService.loadPacks().then(AdminPanel.renderIconPackList)`。
- 修改：`js/admin/panel/events/index.js` handlerMap 追加：

```js
'upload-icon-pack': 打开文件选择（先校验名称与至少一个主题，否则 toast 阻断）
'icon-pack-file': 读取 file -> IconPackService.uploadPack 流程：
   - 先 inspectZipFile：errors -> Utils.showToast(errors.join('\n'), true) 并返回；
   - warnings -> 用 confirm 列出（图片名+原因、缺失键名、未知键名）让管理员确认；取消则返回；
   - 成功后 Utils.showToast(uploadSuccess) + 刷新包列表 + 重新应用当前主题
'icon-pack-theme-change': 读取该包所有勾选主题 -> 至少 1 个否则恢复勾选并 toast -> IconPackService.updatePackThemes
'icon-pack-delete': confirm -> IconPackService.deletePack -> 刷新列表
'icon-pack-theme-select-all': 全选/取消全选（联动上传区或编辑区，作用于当前操作目标）
```

- 修改：`js/utils/ui-strings.js` 文案（见 A3）。
- 验证：登录管理员 → 面板出现图标包区；上传合法 zip 成功；上传含越界尺寸/缺键的 zip 出现警告列表且可继续；主题勾选变化即时生效。
- 回退：还原 render.js/events/index.js。

#### 检查点 4：C1-C2 完成后

完整 UI 流程测试：上传 → 切换主题 → 删除 → 回退。覆盖：上传区主题多选/全选/至少一个校验、包列表主题勾选编辑、删除后图标全部回退、工具栏键名文档三 tab 状态色正确、警告/阻断弹窗文案正确。

---

### 阶段 D：单元测试与审查

#### D1. 前端纯逻辑单测

- 新建 `tests/unit/services/icon-pack-processor.test.js`：
  - key 提取（子目录 `a/b/site.png` → `site`）；
  - 非图片忽略（`.txt` 不计入）；
  - PNG magic 校验通过/失败；
  - SVG 安全扫描命中 `<script`、`onload=`、`javascript:` 时返回命中项；
  - 尺寸范围：宽或高 <64 / >512 产生 outOfRange 且含文件名；范围内无警告；
  - missingKeys：包内缺 `site` 时列出 `site`；unknownKeys：含 `foo.png` 时列出 `foo`；
  - 限制：条目数/单文件大小/总大小超限产生 errors；
  - `buildNormalizedZip`：输出 zip 内条目为 `{key}.png` 平铺（用 JSZip 重新打开断言）。
- 新建 `tests/unit/services/icon-pack-keys.test.js`：共 33 键、key 唯一、slot 唯一、size range 合法（min>0、min<max）；`box-item-*` 键集合与 `UI.magicBox.items` 的 id 集合完全一致；键名全部匹配 `^[a-z0-9-]+$`；`theme-*` 键集合 = `ThemeService.getThemes()` 的 id 集合；`arrow` 键存在且唯一；`deco-*` 六键存在且与 1.1.2 映射表一致。
- 新建 `tests/unit/services/icon-pack-service.test.js`（mock `ApiClient`）：
  - `updatePackThemes` 校验 themeIds 为空时抛错/不请求；
  - `uploadPack` 在 inspect 有 errors 时不调用 ApiClient.post；
  - `uploadPack` 成功调用 `ApiClient.post('/api/icon-packs', {name, themeIds, zipBase64}, {timeout:60000})`。
- 运行：`npm run test`（vitest）全绿。
- 回退：删除测试文件。

#### D2. 后端手工/脚本验证

- 启动后端 `node backend/server.cjs`。
- curl 脚本（无鉴权 GET / 有鉴权 POST，token 从 `/api/auth/login` 获取）：

```bash
# 1) 状态（公开）
curl -s http://127.0.0.1:9999/api/icon-packs/status
# 2) 登录拿 token
TOKEN=$(curl -s -X POST http://127.0.0.1:9999/api/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).token))")
# 3) 上传（先 node 脚本把 test.zip 转 base64）
curl -s -X POST http://127.0.0.1:9999/api/icon-packs -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d "{\"name\":\"test\",\"themeIds\":[\"dark\"],\"zipBase64\":\"$(base64 -w0 /tmp/test.zip)\"}"
# 4) 获取单个图标
curl -sI http://127.0.0.1:9999/api/icon-packs/{packId}/icons/site
# 5) 修改主题
curl -s -X PUT http://127.0.0.1:9999/api/icon-packs/{packId}/themes -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"themeIds":["dark","light"]}'
# 6) 删除
curl -s -X DELETE http://127.0.0.1:9999/api/icon-packs/{packId} -H "Authorization: Bearer $TOKEN"
```

- 验证点：上传后 status 对应主题生效；非法 themeIds 400；空 themeIds 400；无 token POST 401；SVG 含 `<script` 上传 400；PNG 伪造 magic 上传 400。

#### D3. 回归检查（不破坏现有功能）

- `npm run lint`、`npm run type-check`、`npm run test` 全绿。
- 手动回归：
  1. 未上传任何图标包时：站点图标/目录图标/工具栏图标/管理面板箭头的**单槽位上传与重置**行为与改动前一致。
  2. 未上传任何图标包时：超现实箱子的箱盖/箱体/物品贴图上传与恢复默认行为与改动前一致。
  3. 未上传任何图标包时：全站展开/收起箭头（管理面板/侧边栏/目录树/整合区）的 emoji 与方向、上传头像按钮、自定义贴图区标题、主题切换按钮 emoji、搜索图标、位置管理按钮、文章节点图标、可见性按钮、贴纸库六个功能按钮与贴纸右键菜单与改造前显示一致。
  4. 上传包后：包内缺失的键回退到旧单槽位/旧箱子自定义图/emoji 默认；包内存在的键以包图标为准；删除包后全部回退。
  5. 主题切换（dark/light/lofi）：图标即时重应用，且拼图背景、目录树刷新等既有逻辑不受影响。
  6. 贴图上传/管理、文章可见性、编辑器草稿等既有模块不受影响。
  7. 图标包区在未登录时不出现（管理面板本身已鉴权显示，无需额外逻辑）。

---

### 阶段 E：需求覆盖审查与回退

#### E1. 需求逐条验收（对照第 0 节表格）

- R1：`icon-pack-keys.js` 共 33 键存在且唯一；`box-item-*` 与 `UI.magicBox.items` 一一对应；`theme-*` 与 `ThemeService.getThemes()` 一一对应；`arrow` 键存在且唯一；`deco-*` 六键与 1.1.2 映射表一致。
- R2：上传超大 PNG（如 2000×1000）后，下载到的图标尺寸 ≤512 且宽高比不变；任意颜色 PNG 原色保留；SVG 原样存储。
- R3：上传区显示推荐范围文案；上传含 32×32 与 1024×1024 图片的 zip 时，警告列表分别列出两张图名并提示“可能导致效果不佳”。
- R4：上传缺 `arrow` 或 `box-lid` 键的 zip，警告列出缺少对应键。
- R5：文档中键名以 `site.png/site.svg` 形式展示；工具栏文档灰/绿状态正确，基础键（含箭头/标签/主题图标）与箱子键分组显示。
- R6：上传 zip 成功并出现在包列表。
- R7：上传含 `x.png`（伪造扩展名但非 PNG magic）或含 `<script>` 的 svg 时被阻断，且**未发请求到后端**（浏览器 Network 面板确认）。
- R8：zip 内 `sub/dir/site.png` 结构被正确识别为 `site` 键；`.txt` 文件被忽略。
- R9：上传时选 `dark+light` 成功；包列表编辑勾选为 `lofi` 后 status 三个主题正确；取消全部勾选被阻止。
- R10：工具栏文档三个 tab 分别显示 dark/light/lofi 状态，互不串扰。
- R11：无动态图标相关代码。
- R12（扩展）：含 `box-lid.png`/`box-item-key.png` 的包应用后，箱子箱盖与“生锈钥匙”物品显示包图标；删除包后回退旧自定义图或 CSS/emoji 默认。
- R13（扩展）：含 `arrow.png` 的包应用后，管理面板箭头/侧边栏按钮/目录树节点/整合区折叠四处箭头统一替换且方向正确（CSS 旋转）；含 `avatar-upload.png`、`custom-texture.png`、`theme-dark/light/lofi.png` 的包分别替换对应按钮/标题/主题图标；删除包后全部还原 emoji/文本。
- R14（扩展）：含 `directory-visibility-visible.png`/`directory-visibility-hidden.png` 的包应用后，目录树可见性按钮按可见/不可见状态分别显示对应图标，点击切换后图标跟随状态；含 `search.png`/`position-mode.png`/`article.png` 的包分别替换搜索图标、进入位置管理按钮、文章节点图标；含六个 `deco-*.png` 的包替换贴纸库六个功能按钮，并同步复用到贴纸右键菜单对应项（下载键仅贴纸库生效）；删除包后全部还原。

#### E2. 回退方案

- 每个步骤均为独立文件/独立代码块；回退 = 删除新文件 + `git checkout` 还原被改文件。
- 数据库新增表不破坏旧表；如整体回滚，删除 `backend/revachol.db` 或保留（IF NOT EXISTS 表不影响旧功能）。
- 依赖回退：`npm uninstall jszip`。

---

## 3. 文件清单总览

**新增（前端）**：`js/services/icon-pack-keys.js`、`js/services/icon-pack-processor.js`、`js/services/icon-pack-service.js`、`js/ui/components/icon-pack-doc.js`。
**新增（后端）**：`backend/routes/icon-packs.cjs`。
**新增（测试）**：`tests/unit/services/icon-pack-processor.test.js`、`icon-pack-keys.test.js`、`icon-pack-service.test.js`。
**修改（前端）**：`js/core/event-constants.js`、`js/utils/ui-strings.js`、`js/services/directory-icon.js`、`js/services/ui-icon.js`、`js/services/api-client.js`、`js/ui/components/magic-box/BoxState.js`、`js/ui/components/magic-box/index.js`、`js/admin/position.js`、`js/ui/components/sidebar.js`、`js/ui/components/directory/render.js`、`js/ui/components/directory/directory-visibility.js`、`js/ui/components/search.js`、`js/ui/components/deco-ui.js`、`js/admin/events/context-menu.js`、`js/app.js`、`index.html`、`js/admin/panel/render.js`、`js/admin/panel/events/index.js`、`css/components/admin.css`。
**修改（后端）**：`backend/server.cjs`、`backend/db.cjs`、`backend/storage/config.cjs`、`backend/storage/adapters/local.cjs`、`backend/storage/adapters/rustfs.cjs`、`backend/storage/storage-service.cjs`。
**修改（依赖）**：`package.json`（jszip）。

## 4. 实施顺序建议（每步可提交）

1. A1 → A2 → A3（依赖 + 常量 + 文案）
2. A4 → A5 → A6（后端通路，curl 验证）
3. B1 → B3 → B4 → B2（前端核心：先旧图标扩展与 DOM 改造，再组装服务）
4. C1 → C2（UI 两个入口）
5. D1 → D2 → D3（测试与回归）
6. E1（逐条验收）

> 注意：A6 后端注册键名常量数组需与 A2 保持一致（注释互相指向）；修改键名时两处同步。
