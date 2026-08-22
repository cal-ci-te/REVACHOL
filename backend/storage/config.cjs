// 通过 dotenv 读取环境变量，支持 STORAGE_TYPE=local|rustfs 切换。
// RustFS 兼容 S3 协议（MinIO/Ceph/AWS S3 均可），forcePathStyle=true 适配自建服务。
const path = require('path');
require('dotenv').config(); // 如果使用 dotenv

// 存储类型：'local' 或 'rustfs'
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';

// RustFS 配置（兼容 S3 协议）
const RUSTFS_CONFIG = {
    endpoint: process.env.RUSTFS_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.RUSTFS_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.RUSTFS_SECRET_KEY || 'minioadmin',
    bucket: process.env.RUSTFS_BUCKET || 'revachol',
    region: process.env.RUSTFS_REGION || 'us-east-1',
    useSSL: process.env.RUSTFS_USE_SSL === 'true' || false,
    forcePathStyle: true, // RustFS/MinIO 需要
};

// 本地存储配置
const LOCAL_CONFIG = {
    uploadDir: path.join(__dirname, '..', 'uploads', 'decos'),
    baseUrl: '/uploads/decos',
};

// 图标包独立存储目录/前缀（与贴纸 decos 互不干扰）
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