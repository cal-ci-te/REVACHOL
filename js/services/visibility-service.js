// ！文章可见性策略
// 统一判断「当前访客能否看到某篇文章」：管理员一律可见，访客仅见 visible !== false 的文章。

import { AppState } from '../core/app-state.js';
import { ArticleService } from './article-service.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { NotificationService } from './notification-service.js';

export const VisibilityService = {
  // 判断是否具备管理权限
  canModify() {
    return AppState.get('isLoggedIn') === true;
  },

  // 判断单篇是否可见
  isVisible(articleId, articles) {
    // 管理员不受可见性约束
    if (this.canModify()) return true;
    const article = (articles || []).find((a) => a.id === articleId);
    return article ? article.visible !== false : false;
  },

  // 过滤可见文章
  getVisibleArticles(articles) {
    // 返回副本：调用方排序/裁剪不污染原始数组
    if (this.canModify()) return articles.slice();
    return articles.filter((a) => a.visible !== false);
  },

  // 切换文章可见性
  // 依次尝试传入的 setVisibilityFn、ArticleService，均不可用时降级为本地模拟
  async toggleVisibility(articleId, articles, setVisibilityFn) {
    if (!this.canModify()) {
      NotificationService.showToast(NotificationService.messages.visibilityAdminOnly, true);
      return false;
    }
    const article = (articles || []).find((a) => a.id === articleId);
    if (!article) return false;

    const newVisible = !article.visible;
    if (typeof setVisibilityFn === 'function') {
      return await setVisibilityFn(articleId, newVisible);
    } else if (typeof ArticleService !== 'undefined' && ArticleService.setVisibility) {
      return await ArticleService.setVisibility(articleId, newVisible);
    } else {
      // 降级：直接改本地对象并发事件，仅用于依赖缺失的测试环境
      article.visible = newVisible;
      EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, {
        articleId,
        visible: newVisible,
        fromRemote: false,
      });
      NotificationService.showVisibilityChanged(newVisible);
      return true;
    }
  },

  // 兼容旧命名
  isAdmin() {
    return this.canModify();
  },
};

