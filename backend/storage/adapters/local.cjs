// 本地文件系统适配器：文件存储于 uploads/decos/ 目录。
// 使用同步 I/O（writeFileSync/readFileSync）——Node.js 中针对 <1MB 的小文件，
// 同步 I/O 比异步 I/O + Promise 的开销更小，且代码更简洁。
const fs = require('fs');
const path = require('path');
const { LOCAL_CONFIG } = require('../config.cjs');

class LocalAdapter {
    constructor(options = {}) {
        this.uploadDir = options.uploadDir || LOCAL_CONFIG.uploadDir;
        this.baseUrl = options.baseUrl || LOCAL_CONFIG.baseUrl;
        this.idPrefix = options.idPrefix || 'deco_';
        // 确保目录存在
        if (!fs.existsSync(this.uploadDir)) {
            fs.mkdirSync(this.uploadDir, { recursive: true });
        }
    }

    /**
     * 上传文件
     */
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

    /**
     * 获取文件URL
     */
    getUrl(id, filename) {
    return `/api/decos/${id}/image`;
}
    /**
     * 删除文件
     */
    async delete(filename) {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            return true;
        }
        return false;
    }

    /**
     * 检查文件是否存在
     */
    async exists(filename) {
        const filepath = path.join(this.uploadDir, filename);
        return fs.existsSync(filepath);
    }

    /**
     * 读取文件
     */
    async read(filename) {
        const filepath = path.join(this.uploadDir, filename);
        if (fs.existsSync(filepath)) {
            return fs.readFileSync(filepath);
        }
        return null;
    }
}

module.exports = LocalAdapter;