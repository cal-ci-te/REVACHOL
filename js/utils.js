// ！Utils 聚合出口
// 向后兼容层：把 utils/ 下的子模块聚合成单一 Utils 对象，供仍以 Utils.xxx 调用的旧代码使用。
// 新代码应直接从 utils/ 下对应子模块导入，避免为局部功能拖入整包。
import { showToast, hideToast } from './utils/toast.js';
import { escapeHtml } from './utils/dom.js';
import { debounce, throttle } from './utils/function.js';
import { storage } from './utils/storage.js';
import { compressImage } from './utils/image.js';

// 重新导出，保持原有 Utils 对象结构
export const Utils = {
  showToast,
  hideToast,
  escapeHtml,
  debounce,
  storage,
  compressImage,
  // 兼容既有 Utils.throttle 调用点
  throttle,
};
