// ！UI 公共辅助
// 供各 UI 子模块复用的零散工具：卡片 ID、提示条、滚动定位、层级推断、文字混淆。
import { CONFIG } from '../../config.js';
import { UI } from '../../utils/ui-strings.js';

export const UIHelpers = {
  // 生成卡片 DOM ID
  generateCardId(articleId) {
    return `article-card-${articleId}`;
  },

  // 显示节点警告提示（2s 自动消失）
  // 复用单例：同屏只保留一条提示，避免连续操作时提示条叠成一摞
  showNodeWarning(message) {
    const existing = document.querySelector('.node-warning');
    if (existing) existing.remove();

    const msg = document.createElement('div');
    msg.className = 'node-warning';
    msg.textContent = message || UI.articles.empty;
    msg.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--color-bg-secondary);
            border: 1px solid #c47a44;
            color: var(--color-text-accent);
            padding: 10px 20px;
            font-family: 'Courier New', monospace;
            font-size: 12px;
            z-index: 2000;
            border-radius: 8px;
            text-align: center;
            max-width: 80%;
            animation: toastFadeInOut 2s ease-in-out forwards;
        `;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 2000);
  },

  // 滚动到指定卡片并高亮
  scrollToElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      element.classList.add('card-highlight');
      setTimeout(() => element.classList.remove('card-highlight'), 1600);
    }
  },

  // 推断分类层级
  // 支持两种历史写法：分隔符分段（a/b/c）与缩进空格，故需按顺序判定
  getCategoryLevel(categoryName) {
    if (!categoryName) return 1;
    const parts = categoryName.split(/[/\-—>]/).filter((p) => p.trim() !== '');
    if (parts.length > 1) {
      return Math.min(parts.length, 6);
    }
    const trimmed = categoryName.trim();
    if (trimmed.startsWith('  ') || trimmed.startsWith('\t')) {
      const indentMatch = trimmed.match(/^(\s+)/);
      if (indentMatch) {
        const indentLevel = Math.floor(indentMatch[0].length / 2);
        return Math.min(indentLevel + 1, 6);
      }
    }
    return 1;
  },

  // 混淆文本（同形西里尔/全角字符）
  // 用视觉同形字符而非编码/加密：目标只是提高复制门槛，仍需保持可读与可搜索
  obfuscateText(text) {
    if (!CONFIG.protection.enableObfuscation || !text) return text;
    const map = {
      a: 'а',
      c: 'с',
      e: 'е',
      o: 'о',
      p: 'р',
      x: 'х',
      y: 'у',
      A: 'А',
      B: 'В',
      C: 'С',
      E: 'Е',
      H: 'Н',
      K: 'К',
      M: 'М',
      O: 'О',
      P: 'Р',
      T: 'Т',
      X: 'Х',
      Y: 'У',
      0: '０',
      1: '１',
      2: '２',
      3: '３',
      4: '４',
      5: '５',
      6: '６',
      7: '７',
      8: '８',
      9: '９',
      ',': '，',
      '.': '．',
      '!': '！',
      '?': '？',
    };
    return text
      .split('')
      .map((ch) => map[ch] || ch)
      .join('');
  },

  // 底部轻提示
  // 动画样式只在首次调用时注入：避免每次弹提示都新建 <style> 节点
  showBottomToast(message, isWarning = false) {
    const toast = document.createElement('div');
    toast.className = 'bottom-toast';
    toast.innerHTML = message || UI.articles.bottomToastEnd;
    toast.style.cssText = `
            position: fixed;
            bottom: 30px;
            left: 50%;
            transform: translateX(-50%);
            background: ${isWarning ? 'rgba(196, 68, 68, 0.9)' : 'rgba(42, 35, 28, 0.95)'};
            backdrop-filter: blur(8px);
            border: 1px solid ${isWarning ? 'var(--color-error)' : 'var(--color-accent)'};
            border-radius: 30px;
            padding: 10px 24px;
            color: var(--color-text-accent);
            font-family: 'Courier New', monospace;
            font-size: 13px;
            z-index: 2100;
            text-align: center;
            white-space: nowrap;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            animation: bottomToastFade 2s ease-in-out forwards;
        `;

    if (!document.querySelector('#bottom-toast-style')) {
      const style = document.createElement('style');
      style.id = 'bottom-toast-style';
      style.textContent = `
                @keyframes bottomToastFade {
                    0% { opacity: 0; transform: translateX(-50%) translateY(20px); }
                    15% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    85% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(20px); visibility: hidden; }
                }
            `;
      document.head.appendChild(style);
    }

    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  },
};

