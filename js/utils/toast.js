// ！Toast 提示
// 提供轻量全局提示，同一时刻仅保留一个实例。

let toastTimer = null;
let toastElement = null;

// 显示 Toast
export function showToast(message, isError = false) {
  // 先隐藏旧实例：保证单例，避免多条提示叠加
  hideToast();
  const toast = document.createElement('div');
  toast.className = `toast-message ${isError ? 'error' : 'success'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  toastElement = toast;
  toastTimer = setTimeout(() => hideToast(), 2000);
}

// 立即隐藏 Toast
export function hideToast() {
  if (toastTimer) {
    clearTimeout(toastTimer);
    toastTimer = null;
  }
  if (toastElement && toastElement.parentNode) {
    toastElement.parentNode.removeChild(toastElement);
    toastElement = null;
  }
}