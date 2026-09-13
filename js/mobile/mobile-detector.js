// ！移动端能力检测
// 以触摸能力为主要依据、UA 为兜底与平台细分：触摸能力更贴近真实交互方式，UA 可被伪装。

// 检测是否为移动端
// 三重条件任一成立即判定为移动端：覆盖触屏笔记本（有 ontouchstart）与 UA 被伪装的设备
export function isMobile() {
    return 'ontouchstart' in window || 
           navigator.maxTouchPoints > 0 ||
           /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// 检测是否支持触摸事件
// 不含 UA 判断：只回答「能否触摸」这一能力问题，与设备形态解耦
export function hasTouchSupport() {
    return 'ontouchstart' in window || navigator.maxTouchPoints > 0;
}

// 获取设备类型
export function getDeviceType() {
    if (isMobile()) {
        return 'mobile';
    }
    return 'desktop';
}

// 检测是否为 iOS
// 额外识别 iPadOS：其 UA 已伪装为 MacIntel，只能靠 maxTouchPoints > 1 与真 Mac 区分
export function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
           (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// 检测是否为 Android
export function isAndroid() {
    return /Android/.test(navigator.userAgent);
}
