// 站点图标服务 — 基于 CustomIconManager 的实例，保持向后兼容
import { CustomIconManager } from './custom-icon.js';

export const SiteIcon = new CustomIconManager({
  storageKey: 'site_icon',
  containerSelector: '#siteAvatar',
  imgSelector: '#siteAvatarImg',
  fallbackSelector: '#siteAvatarFallback',
  eventName: 'site-icon:updated',
  defaultSrc: 'images/site-icon.png',
});

/** 站点图标专属：入场摇摆动画 */
SiteIcon.playEntranceAnimation = function () {
  const container = document.querySelector('#siteAvatar');
  if (!container) return;
  setTimeout(function () { container.classList.add('animate'); }, 200);
};
