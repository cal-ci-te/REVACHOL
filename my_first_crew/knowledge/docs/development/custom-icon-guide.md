# 自定义图标组件使用指南

> 基于 `CustomIconManager` — 为任意 UI 元素提供"自定义图标 + 回退"能力

---

## 1. 概述

`CustomIconManager`（`js/services/custom-icon.js`）是一个通用管理器，让任意 DOM 元素支持：

- 用户上传自定义图标（base64 存入 localStorage）
- 图标不存在时自动回退到默认元素（如 Emoji、占位图）
- 上传后自动切换 `.has-custom` CSS 类，控制 img/回退元素显隐
- 可选：通过 `EventBus` 通知其他模块图标已更新

**设计模式**：每类图标创建独立实例，互不干扰。

---

## 2. 快速上手

### 2.1 创建实例

```js
// js/services/my-icon.js
import { CustomIconManager } from './custom-icon.js';

export const MyIcon = new CustomIconManager({
  storageKey: 'my_icon',           // localStorage 键名
  containerSelector: '#myAvatar',   // 容器选择器
  imgSelector: '#myAvatarImg',      // 图片元素选择器
  fallbackSelector: '#myAvatarFallback', // 回退元素选择器
  eventName: 'my-icon:updated',     // (可选) 更新事件名
  defaultSrc: 'images/my-icon.png', // (可选) 默认图片路径
});
```

### 2.2 HTML 结构

```html
<div class="avatar" id="myAvatar">
  <img id="myAvatarImg" src="" alt="图标" style="display:none;">
  <span id="myAvatarFallback">🖼️</span>
</div>
```

### 2.3 初始化

```js
MyIcon.init();
```

### 2.4 调用方法

| 方法 | 用途 |
|------|------|
| `MyIcon.getIcon()` | 读取当前存储的 dataUrl |
| `MyIcon.setIcon(dataUrl)` | 存储并应用图标 |
| `MyIcon.removeIcon()` | 移除图标，恢复回退 |
| `MyIcon.applyIcon(src)` | 仅应用到 DOM（不存储） |
| `MyIcon.createUploadHandler()` | 返回 `(file) => void` 处理器 |

---

## 3. CSS 样式

复用站点图标的"标本悬挂" CSS 模式。按以下模式编写选择器，将 `#siteAvatar` 替换为你的容器 ID。

### 3.1 容器

```css
#myAvatar {
  width: 70px; height: 70px;
  overflow: visible;        /* 允许图标溢出 */
  background: var(--color-bg-tertiary);
  border: 2px solid var(--color-border-highlight);
  border-radius: var(--radius-md);
  box-shadow: 0 4px 12px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.05);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

### 3.2 针脚装饰（可选）

```css
#myAvatar::before,
#myAvatar::after {
  content: '';
  position: absolute;
  width: 4px; height: 4px;
  background: var(--color-accent);
  border-radius: 50%;
  z-index: 2;
}
#myAvatar::before { top: 8px; left: 50%; transform: translateX(-50%); }
#myAvatar::after  { bottom: 8px; left: 50%; transform: translateX(-50%); }
```

### 3.3 图标（img + 回退元素）

```css
/* 图标 100×100px 溢出 70×70px 容器，产生悬挂感 */
#myAvatar img,
#myAvatar span {
  display: block;
  width: 100px; height: 100px;
  object-fit: contain;       /* 任意尺寸图片自适应 */
  text-align: center;
  transform-origin: center center;
}
#myAvatar img  { filter: drop-shadow(0 4px 8px rgba(0,0,0,0.4)); }
#myAvatar span { font-size: 60px; line-height: 100px; }

/* 切换逻辑：.has-custom 时显示 img 隐藏 span */
#myAvatar.has-custom img  { display: block; }
#myAvatar.has-custom span { display: none; }

/* 入场动画（可选） */
#myAvatar.animate        { animation: swingBox  1.2s ease-in-out forwards; }
#myAvatar.animate img,
#myAvatar.animate span   { animation: swingIcon 1.2s ease-in-out forwards; }
```

---

## 4. 管理面板集成

在 `js/admin/panel/render.js` 中添加上传/移除按钮：

```js
// HTML 片段
`<div class="admin-control-group">
  <label>自定义图标</label>
  <button id="myIconUploadBtn" data-action="upload-my-icon">
    📤 上传图标
  </button>
  <button id="myIconRemoveBtn" data-action="remove-my-icon">
    🗑️ 移除图标
  </button>
  <input type="file" id="myIconFileInput" accept="image/*" style="display:none;">
</div>`
```

在 `js/admin/panel/events/index.js` 中注册处理器：

```js
import { MyIcon } from '../../../services/my-icon.js';

// 注册数据动作
actionMap['upload-my-icon'] = function () {
  document.getElementById('myIconFileInput').click();
};
actionMap['remove-my-icon'] = function () {
  MyIcon.removeIcon();
};
```

文件选择监听：

```js
document.getElementById('myIconFileInput').addEventListener('change', function (e) {
  var file = e.target.files[0];
  if (!file) return;
  var handler = MyIcon.createUploadHandler();
  handler(file);
});
```

---

## 5. 现有实例参考

| 文件 | 实例 | storageKey | 用途 |
|------|------|-----------|------|
| `js/services/site-icon.js` | `SiteIcon` | `site_icon` | 页面顶部站点图标 #siteAvatar |

---

## 6. 注意事项

1. **DOM 就绪**：`init()` 必须在 DOM 渲染后调用（`<img>` 和回退元素已存在于页面中）
2. **CSS 加载**：`.has-custom` 和入场动画依赖 `css/base/layout.css` 中的 `@keyframes swingBox/swingIcon`
3. **图片格式**：接受任意 `image/*` 类型，转为 base64 dataUrl 存储
4. **localStorage 限制**：单条 dataUrl 约 5-10MB 上限，建议上传前压缩到 200KB 以内
5. **EventBus 依赖**：`_emitEvent` 是可选功能，若未使用 `EventBus` 传 `eventName: null` 即可跳过
