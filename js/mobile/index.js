// ！移动端模块入口
// 桶文件：仅聚合子模块导出，不承载业务逻辑，便于调用方按需取用检测或交互能力。

export { isMobile, hasTouchSupport, getDeviceType, isIOS, isAndroid } from './mobile-detector.js';
export { enableTouchDrag } from './touch-drag.js';
export { enableTouchContext } from './touch-context.js';