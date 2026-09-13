// ！拼图存储适配层
// 可插拔存储抽象：默认 localStorage，也可注入任意实现（需实现 getItem/setItem/removeItem）。
// 每实例持有独立 storageKey，避免多实例互相覆盖。
export class StorageAdapter {
    // 构造适配器
    // backend 允许测试注入内存实现；无 localStorage 环境（SSR）时为 null，由各方法短路返回
    constructor(options = {}) {
        this._key = options.storageKey || 'rv_puzzle_state';
        this._backend = options.backend || (typeof localStorage !== 'undefined' ? localStorage : null);
    }

    // 序列化并保存
    // 失败返回 false 而非抛错：存储不可用（隐私模式、配额满）不应中断拼图交互
    save(data) {
        if (!this._backend) return false;
        try {
            this._backend.setItem(this._key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.warn('[Puzzle:Storage] 保存失败:', e);
            return false;
        }
    }

    // 读取并反序列化
    // 解析失败返回 null：旧数据损坏时降级为「无存档」而非抛错，便于上层重新初始化
    load() {
        if (!this._backend) return null;
        try {
            const raw = this._backend.getItem(this._key);
            return raw ? JSON.parse(raw) : null;
        } catch (e) {
            console.warn('[Puzzle:Storage] 读取失败:', e);
            return null;
        }
    }

    // 删除存档
    remove() {
        if (!this._backend) return;
        try {
            this._backend.removeItem(this._key);
        } catch (e) {
            // 删除失败静默忽略：键本就可能不存在，且不影响后续流程
        }
    }

    // 动态切换键名（多实例支持）
    setKey(key) {
        this._key = key;
    }
}
