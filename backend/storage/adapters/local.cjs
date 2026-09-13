// ！本地存储适配器
// 把文件存到本地 uploads/decos 目录，与 RustFS 适配器实现同一组方法。
// 采用同步 I/O：针对 <1MB 的小文件，同步写法比异步加 Promise 的开销更小，代码也更直接。
const fs = require('fs');
const path = require('path');
const { LOCAL_CONFIG } = require('../config.cjs');

class LocalAdapter {
    constructor(options = {}) {
        this.uploadDir = options.uploadDir || LOCAL_CONFIG.uploadDir;
        this.baseUrl = options.baseUrl || LOCAL_CONFIG.baseUrl;
        this.idPrefix = options.idPrefix || 'deco_';
        // 构造时即建目录：上传路径不再需要额外判断目录是否存在
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    // 上传文件
    // 文件名由「前缀 + 时间戳 + 随机串 + 原扩展名」拼成，避免并发上传撞名
    async upload(buffer, originalName, contentType) {
        const id = this.idPrefix + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const ext = path.extname(originalName) || '.webp';
        const filename = id + ext;
        const filepath = path.join(this.uploadDir, filename);

        fs.writeFileSync(filepath, buffer);
        console.log('[LocalAdapter] 文件已保存:', filepath);

        return {
            id,
            url: this.baseUrl + '/' + filename,
            path: filepath,
            filename: filename,
            key: filename,
        };
    }

    // 取文件 URL
    // 本地存储不直接暴露文件路径，而是走带鉴权的接口路由
    getUrl(id, filename) {
    return `/api/decos/${id}/image`;
}
    // 删除文件
    // 文件不存在时返回 false 而非抛错，使调用方可重复执行删除
    async delete(filename) {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    // 检查文件是否存在
    async exists(filename) {
        const filepath = path.join(this.uploadDir, filename);
        return fs.existsSync(filepath);
    }

    // 读取文件
    // 文件缺失返回 null，与「读取到空内容」区分开
    async read(filename) {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            return fs.readFileSync(filepath);
        }
        return null;
    }
}

module.exports = LocalAdapter;