// ！上传目录工具
// 提供贴图上传目录的路径与按需创建能力，供服务启动与上传链路复用。
// 目录可经环境变量覆盖，便于容器化部署时挂载到独立卷。
const path = require('path');
const fs = require('fs');

// 默认落在后端目录下的 uploads/decos，与 storage/config.cjs 的本地存储目录保持一致
const DEFAULT_UPLOAD_DIR = path.join(__dirname, 'uploads/decos');
const DECO_UPLOAD_DIR = process.env.DECO_UPLOAD_DIR || DEFAULT_UPLOAD_DIR;

// 确保上传目录存在
// 采用递归创建：首次部署时上级 uploads 目录也可能尚不存在
function ensureUploadDir() {
    if (!fs.existsSync(DECO_UPLOAD_DIR)) {
        fs.mkdirSync(DECO_UPLOAD_DIR, { recursive: true });
        console.log(`📁 创建上传目录: ${DECO_UPLOAD_DIR}`);
    }
}

module.exports = {
    DECO_UPLOAD_DIR,
    ensureUploadDir,
};