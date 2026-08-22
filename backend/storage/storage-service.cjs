// 适配器模式门面：隔离存储实现，业务代码调用 storage.upload/read/delete，不感知底层是本地文件还是 S3。
// 切换存储方式只需改 .env 中 STORAGE_TYPE=local|rustfs，无需改动任何业务代码。
// ——最初用 BLOB 存图片，发现 sql.js WASM 在 Windows 下序列化损坏后重构为此方案。

const { STORAGE_TYPE } = require('./config.cjs');
const LocalAdapter = require('./adapters/local.cjs');
const RustFSAdapter = require('./adapters/rustfs.cjs');

class StorageService {
    constructor(options = {}) {
        this.type = STORAGE_TYPE;
        this.adapter = this.type === 'rustfs' ? new RustFSAdapter(options) : new LocalAdapter(options);
        console.log('[StorageService] 使用存储后端:', this.type);
    }

    async upload(buffer, filename, contentType) { return this.adapter.upload(buffer, filename, contentType); }
    getUrl(id, filename)                          { return this.adapter.getUrl(id, filename); }
    async delete(filename)                        { return this.adapter.delete(filename); }
    async exists(filename)                        { return this.adapter.exists(filename); }
    async read(filename)                          { return this.adapter.read(filename); }

    isLocal()  { return this.type === 'local'; }
    isRustFS() { return this.type === 'rustfs'; }
}

const storage = new StorageService();
module.exports = storage;
module.exports.StorageService = StorageService;
