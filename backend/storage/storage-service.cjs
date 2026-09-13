// ！存储服务门面
// 以适配器模式隔离存储实现，业务代码只调用 upload / read / delete，不感知底层是本地文件还是 S3。
// 切换存储方式只需改 .env 的 STORAGE_TYPE=local|rustfs，无需改动任何业务代码。
// 该设计源于一次重构：最初用数据库 BLOB 存图片，因 sql.js 的 WASM 在 Windows 下序列化损坏而改为本方案。
const { STORAGE_TYPE } = require('./config.cjs');
const LocalAdapter = require('./adapters/local.cjs');
const RustFSAdapter = require('./adapters/rustfs.cjs');

class StorageService {
    // 构造时即选定适配器：类型在进程生命周期内不变，无需延迟到首次调用
    constructor(options = {}) {
        this.type = STORAGE_TYPE;
        this.adapter = this.type === 'rustfs' ? new RustFSAdapter(options) : new LocalAdapter(options);
        console.log('[StorageService] 使用存储后端:', this.type);
    }

    // 仅做协议转发，不掺入业务判断，便于两种适配器各自演进
    async upload(buffer, filename, contentType) { return this.adapter.upload(buffer, filename, contentType); }
    getUrl(id, filename)                          { return this.adapter.getUrl(id, filename); }
    async delete(filename)                        { return this.adapter.delete(filename); }
    async exists(filename)                        { return this.adapter.exists(filename); }
    async read(filename)                          { return this.adapter.read(filename); }

    isLocal()  { return this.type === 'local'; }
    isRustFS() { return this.type === 'rustfs'; }
}

// 导出单例供业务直接使用，同时挂出类本身以便测试注入自定义 options
const storage = new StorageService();
module.exports = storage;
module.exports.StorageService = StorageService;
