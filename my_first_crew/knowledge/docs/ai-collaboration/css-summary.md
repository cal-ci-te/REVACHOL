我需要为 REVACHOL 项目的 CSS 样式体系建立索引文档，方便后续开发中快速定位样式、理解设计系统，以及让 AI 在生成新组件时能准确复用现有样式。

## 项目背景
- 项目名称：REVACHOL
- 版本：v1.18.0
- 样式架构：CSS 变量驱动，三套主题（暗色/亮色/低保真）
- 技术栈：原生 CSS + Vite
- 项目规模：约 2 万行

## 文档来源
请扫描以下 CSS 目录和文件：

### 主题系统
- `css/themes/dark.css` — 暗色主题（核心变量 + 布局 + 内容 + 侧边栏 + 交互）
- `css/themes/light.css` — 亮色主题（同上结构）
- `css/themes/lofi.css` — 低保真主题（同上结构）

### 全局样式
- `css/style.css` — 全局基础样式、布局、通用组件

### 组件样式
- `css/components/puzzle.css` — 拼图组件
- `css/components/deco-resize.css` — 贴纸缩放
- `css/components/magic-box.css` — 3D 魔法箱子
- `css/components/health-indicator.css` — 健康监控指示器
- `css/components/sticker-float.css` — 文章贴纸文字绕排

### 编辑器样式
- `css/editor/sticker-editor.css` — 贴纸编辑模式
- `css/editor/article-editor.css` — 文章编辑模式

### 管理面板样式
- `css/admin/panel.css` — 管理员控制台

### 侧边栏样式
- `css/layout/sidebar.css` — 目录侧边栏

### 响应式样式
- `css/responsive/mobile.css` — 移动端适配（≤768px）
- `css/responsive/small-mobile.css` — 小屏移动端（≤480px）

## 需要建立索引的 CSS 模块

### C1 - CSS 变量体系（设计令牌）
- 文件：css/themes/*.css（变量定义部分）
- 内容：所有 `--color-*` 变量的完整列表
- 关键：变量名、用途、三套主题下的对应值

### C2 - 主题系统
- 文件：css/themes/dark.css, light.css, lofi.css
- 职责：三套主题的完整样式
- 关键：切换机制（data-theme 属性）、各主题独有样式

### C3 - 全局基础样式
- 文件：css/style.css
- 职责：重置、字体、基础排版、通用工具类
- 关键：字体栈、行高、链接样式、滚动条

### C4 - 布局系统
- 文件：css/style.css（布局部分）
- 职责：应用布局、网格、Flex 容器
- 关键：app-layout、main-content、sidebar 定位

### C5 - 管理员控制台（可复用面板）
- 文件：css/admin/panel.css
- 职责：.admin-panel 样式、拖拽、折叠
- 关键：完整的 .admin-panel 样式规范（这是被多处复用的基础组件）

### C6 - 侧边栏
- 文件：css/layout/sidebar.css
- 职责：目录树、折叠、搜索、右键菜单
- 关键：侧边栏状态（open/collapsed）、目录树层级

### C7 - 文章阅读样式
- 文件：css/style.css（文章阅读部分）
- 职责：.detail-body、标题、段落、引用、代码块
- 关键：文章内容的完整排版样式

### C8 - 贴纸交互样式
- 文件：css/components/deco-resize.css, css/components/sticker-float.css
- 职责：贴纸缩放控制点、编辑工具栏、文字绕排
- 关键：.deco-editing、.deco-edit-handle、.sticker-float

### C9 - 文章编辑模式样式
- 文件：css/editor/article-editor.css
- 职责：全屏覆盖层、编辑模式特有样式
- 关键：覆盖层布局、内容可编辑状态、光标高亮

### C10 - 贴纸编辑模式样式
- 文件：css/editor/sticker-editor.css
- 职责：贴纸编辑全屏覆盖层
- 关键：控制台、工具栏、脉冲动画

### C11 - 移动端适配
- 文件：css/responsive/mobile.css, small-mobile.css
- 职责：响应式断点、移动端隐藏/简化
- 关键：断点值、隐藏规则、简化样式

### C12 - 交互组件样式
- 文件：css/components/puzzle.css, css/components/magic-box.css, css/components/health-indicator.css
- 职责：拼图、3D箱子、健康指示器
- 关键：各组件独立样式、动画

## 输出要求

每个 CSS 模块使用以下固定格式（严格遵循）：