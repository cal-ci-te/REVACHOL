// ！存储工具
// 转发到 StorageAdapter，供业务层以函数式接口读写本地存储。

import { StorageAdapter } from '../services/storage-adapter.js';

// 获取存储值
export function get(key, defaultValue = null) {
  return StorageAdapter.get(key, defaultValue);
}

// 设置存储值
export function set(key, value) {
  StorageAdapter.set(key, value);
}

// 删除存储项
export function remove(key) {
  StorageAdapter.remove(key);
}

// 为了保持与原 Utils.storage 接口一致，导出 storage 对象
export const storage = { get, set, remove };