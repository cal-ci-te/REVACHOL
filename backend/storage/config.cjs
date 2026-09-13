// ！存储配置
// 经 dotenv 载入 .env，并以 STORAGE_TYPE=local|rustfs 切换后端，业务代码无需改动。
// RustFS 兼容 S3 协议（MinIO / Ceph / AWS S3 均可），故统一按 S3 语义配置。
const path = require('path');

// 载入 .env，使下方 process.env 能读到本地配置
require('dotenv').config();

// 存储类型：'local' 或 'rustfs'，默认本地
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';

// RustFS 配置（兼容 S3 协议）
// forcePathStyle 必须为 true：自建 MinIO / RustFS 不支持虚拟主机式寻址
const RUSTFS_CONFIG = {
    endpoint: process.env.RUSTFS_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.RUSTFS_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.RUSTFS_SECRET_KEY || 'minioadmin',
    bucket: process.env.RUSTFS_BUCKET || 'revachol',
    region: process.env.RUSTFS_REGION || 'us-east-1',
    useSSL: process.env.RUSTFS_USE_SSL === 'true' || false,
    forcePathStyle: true,
};

// 本地存储配置
const LOCAL_CONFIG = {
    uploadDir: path.join(__dirname, '..', 'uploads', 'decos'),
    baseUrl: '/uploads/decos',
};

// 图标包使用独立目录与 URL 前缀，与贴纸 decos 互不干扰
const ICON_PACK_LOCAL_CONFIG = {
    uploadDir: path.join(__dirname, '..', 'uploads', 'icon-packs'),
    baseUrl: '/uploads/icon-packs',
    idPrefix: 'iconpack_',
};

module.exports = {
    STORAGE_TYPE,
    RUSTFS_CONFIG,
    LOCAL_CONFIG,
    ICON_PACK_LOCAL_CONFIG,
};