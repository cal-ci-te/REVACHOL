// ！站点图标服务
// 基于 CustomIconManager 的站点头像单例，保留原有调用入口。

import { CustomIconManager } from './custom-icon.js';

export const SiteIcon = new CustomIconManager({
  storageKey: 'site_icon',
  containerSelector: '#siteAvatar',
  imgSelector: '#siteAvatarImg',
  fallbackSelector: '#siteAvatarFallback',
  eventName: 'site-icon:updated',
  defaultSrc: 'images/site-icon.png',
});

// 播放入场摇摆动画
// 延迟 200ms：等首帧渲染完成后再挂动画类，避免过渡被浏览器跳过
SiteIcon.playEntranceAnimation = function () {
  const container = document.querySelector('#siteAvatar');
  if (!container) return;
  setTimeout(function () { container.classList.add('animate'); }, 200);
};
