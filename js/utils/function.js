// ！函数工具
// 提供防抖与节流包装，用于高频事件（输入、滚动、拖拽）降频。

// 防抖
export function debounce(func, wait) {
  let timeout;
  return function (...args) {
    // 清除未触发的旧定时器：等待期内重复调用只执行最后一次
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), wait);
  };
}

// 节流
export function throttle(func, limit) {
  let inThrottle;
  return function (...args) {
    // 窗口未结束则直接丢弃：时间窗口内只执行第一次
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}
