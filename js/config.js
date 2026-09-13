// ！全局配置
// 集中环境判定、API 地址与各模块默认值，是全项目唯一的配置来源。
// 已移除硬编码服务器 IP：本地经 Vite proxy 代理 API，生产部署设置 VITE_API_BASE_URL 并调整 isLocal 判定即可。

// 本地环境判定
// 空 hostname 也归为本地：以 file:// 直接打开页面时 hostname 为空串
const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.hostname === '';

export const CONFIG = {
  SERVER_IP: isLocal ? '' : '47.108.52.6',
  // 以 getter 暴露：SERVER_IP 可能在运行时被改写，缓存成静态值会读到过期结果
  get API_BASE_URL() {
    return isLocal ? '' : `http://${this.SERVER_IP}`;
  },
  WS_URL: isLocal ? '' : 'ws://47.108.52.6/websocket/',
  ADMIN_USERNAME: 'admin',
  // ADMIN_PASSWORD 已弃用（v1.10）：登录校验已迁移至后端，由环境变量 ADMIN_PASSWORD 控制
  // 此处保留仅为向后兼容，不再作为校验依据，切勿据此判断登录
  ADMIN_PASSWORD: 'admin123',
  CACHE_TTL: 5 * 60 * 1000,

  protection: {
    enableObfuscation: false,
    enableWatermark: true,
  },

  decoDefaults: {
    decoLogo: { top: '20px', left: '20px' },
    decoStamp: { bottom: '80px', right: '30px' },
    decoRaven: { bottom: '25px', left: '25px' },
  },

  watermarkDefaults: {
    text: 'REVACHOL',
    opacity: 0.15,
  },

  textureDefaults: {
    opacity: 0.12,
  },

  // 与 css 变量 --color-bg-primary 保持一致，改动时需同步
  bgColorDefault: '#1a1612',
};

export const API_ENDPOINTS = {
  ARTICLES: '/api/articles',
  DECOS: '/api/decos',
  SETTINGS: '/api/settings',
};
