// ！本地存储适配器
// 在 localStorage 之上统一加前缀并做 JSON 序列化，实现存储后端可替换（本地 ↔ S3/RustFS）。

// 前缀隔离项目键与外站/第三方写入的键，clear 时可只清自有键
const PREFIX = 'rv_';

export const StorageAdapter = {
  // 读取存储值
  // 兼容历史裸字符串：JSON.parse 失败时原样返回，避免旧数据读不出
  get(key, defaultValue = null) {
    try {
      const fullKey = PREFIX + key;
      const value = localStorage.getItem(fullKey);
      if (value === null) return defaultValue;
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.warn('[StorageAdapter] 读取失败:', key, error);
      return defaultValue;
    }
  },

  // 写入存储值
  set(key, value) {
    try {
      const fullKey = PREFIX + key;
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch (error) {
      console.warn('[StorageAdapter] 写入失败:', key, error);
    }
  },

  // 删除存储项
  remove(key) {
    try {
      const fullKey = PREFIX + key;
      localStorage.removeItem(fullKey);
    } catch (error) {
      console.warn('[StorageAdapter] 删除失败:', key, error);
    }
  },

  // 清空全部带前缀的存储项
  // 只按前缀删除：不触碰其他应用共享同一域时的数据
  clear() {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach((key) => {
        if (key.startsWith(PREFIX)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('[StorageAdapter] 清空失败:', error);
    }
  },
};

