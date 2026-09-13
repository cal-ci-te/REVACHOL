// ！视频透明度处理
// 面板内首屏视频最大透明度的调节，优先走 HeroBackground 服务。
import { HeroBackground } from '../../../services/hero-background.js';
import { Utils } from '../../../utils.js';

// 调节视频最大透明度
// 服务不可用时降级为直接改 DOM 并存本地：保证控件在服务未加载时仍能生效
export function videoOpacity(event) {
  const val = parseFloat(event.target.value);
  const valueDisplay = document.getElementById('videoMaxOpacityValue');
  if (valueDisplay) valueDisplay.innerText = val.toFixed(2);
  console.log('[AdminPanel] 视频透明度滑块变化:', val);
  if (HeroBackground && typeof HeroBackground.setMaxOpacity === 'function') {
    HeroBackground.setMaxOpacity(val);
  } else {
    Utils.storage.set('video_max_opacity', val);
    const bg = document.getElementById('fullscreenBg');
    if (bg) bg.style.opacity = val;
    console.warn('[AdminPanel] HeroBackground 未加载，直接修改 DOM');
  }
}
