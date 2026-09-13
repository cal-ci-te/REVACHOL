// ！移动端长按
// 为容器元素提供长按手势识别，供移动端上下文菜单使用。

// 绑定长按监听
// 返回清理函数，供调用方在卸载时解绑
export function initLongPress(container, callback, options = {}) {
  if (!container) return () => {};

  const {
    duration = 500,
    tolerance = 10,
    getTargetData = (el) => el,
  } = options;

  let timer = null;
  let targetEl = null;
  let startX = 0, startY = 0;

  const onTouchStart = (e) => {
    // 多指手势不视为长按，避免缩放/双指操作误触发
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    targetEl = e.target;
    startX = touch.clientX;
    startY = touch.clientY;
    container._longPressTriggered = false;

    timer = setTimeout(() => {
      const data = getTargetData(targetEl);
      if (data) {
        callback(touch, data);
        container._longPressTriggered = true;
      }
      timer = null;
      targetEl = null;
    }, duration);
  };

  const onTouchMove = (e) => {
    if (!timer || !targetEl) return;
    const touch = e.touches[0];
    const dx = touch.clientX - startX;
    const dy = touch.clientY - startY;
    // 超出容忍距离即取消：区分长按与滑动
    if (Math.sqrt(dx*dx + dy*dy) > tolerance) {
      clearTimeout(timer);
      timer = null;
      targetEl = null;
    }
  };

  const onTouchEnd = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
      targetEl = null;
    }
  };

  container.addEventListener('touchstart', onTouchStart, { passive: false });
  container.addEventListener('touchmove', onTouchMove, { passive: true });
  container.addEventListener('touchend', onTouchEnd, { passive: true });

  return () => {
    container.removeEventListener('touchstart', onTouchStart);
    container.removeEventListener('touchmove', onTouchMove);
    container.removeEventListener('touchend', onTouchEnd);
  };
}
