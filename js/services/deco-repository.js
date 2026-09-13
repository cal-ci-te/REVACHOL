// ！贴纸仓库
// 贴纸数据的唯一真源，负责服务器 ↔ localStorage ↔ 内存缓存三层同步。
// 采用「本地优先 + 后台静默同步」：网络不可用时仍可读贴纸，恢复后自动对齐服务器数据。

import { ApiClient } from './api-client.js';
import { StorageAdapter } from './storage-adapter.js';
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { API_ENDPOINTS } from '../config.js';

const STORAGE_KEY = 'deco_library';

export const DecoRepository = {
    _cache: null,
    _pendingIds: new Set(),
    // PUT 失败的贴纸 ID 队列，下次 load 时重试
    _syncFailQueue: [],

    _ensureCache() {
        if (!this._cache || !Array.isArray(this._cache)) {
            this._cache = [];
        }
        return this._cache;
    },

    // 载入贴纸数据
    // 命中内存或本地缓存即返回，避免每次进入页面都发起请求
    async load(forceRemote = false) {
        if (this._cache && this._cache.length > 0 && !forceRemote) {
            return this._cache;
        }
        const localData = StorageAdapter.get(STORAGE_KEY);
        if (localData && Array.isArray(localData) && !forceRemote) {
            // dataUrl 不入库，按 id 按需生成图片路由
            const enriched = localData.map(item => ({
                ...item,
                dataUrl: `/api/decos/${item.id}/image`
            }));
            this._cache = enriched;
            console.log('[DecoRepository] 从本地缓存加载，共', enriched.length, '项');
            // 后台静默同步：拉取服务器数据合并，服务器 position 优先
            this._syncFromServerSilently();
            // 重试之前失败的 PUT 请求
            this._retryFailedSyncs();
            return enriched;
        }
        // localStorage 为空 → 强制从服务器拉取
        return this._fetchFromServer();
    },

    // 重试之前失败的同步
    // 队列持久化在 localStorage：跨会话保留，网络恢复后仍能补推
    async _retryFailedSyncs() {
        const queue = StorageAdapter.get('deco_sync_fail_queue');
        if (!queue || !Array.isArray(queue) || queue.length === 0) return;
        console.log('[DecoRepository] 重试失败同步队列，共', queue.length, '项');
        const remaining = [];
        for (const id of queue) {
            const item = this._cache.find(i => i.id === id);
            if (!item) continue;
            try {
                await this._putToServer(item);
                console.log('[DecoRepository] 重试同步成功:', id);
            } catch (e) {
                remaining.push(id);
            }
        }
        StorageAdapter.set('deco_sync_fail_queue', remaining);
        if (remaining.length > 0) {
            console.warn('[DecoRepository]', remaining.length, '项同步仍然失败，将在下次加载时重试');
        }
    },

    // 保存贴纸
    // 更新走乐观写入：先改本地缓存并通知 UI，再异步推送服务器，失败则入重试队列
    async save(item) {
        const isNew = !item.id || !this._cache.some(i => i.id === item.id);

        if (isNew) {
            console.log('[DecoRepository] 新建贴图:', item.name || '未命名');
            try {
                if (!item.dataUrl && item.file) {
                    throw new Error('缺少 dataUrl');
                }
                const result = await this._postToServer(item);
                // 采用服务器返回的 dataUrl：新建后 id 才确定，图片路由必须以服务端 id 为准
                const newItem = {
                    ...item,
                    id: result.id,
                    dataUrl: result.dataUrl || `/api/decos/${result.id}/image`
                };
                this._ensureCache();
                this._cache.push(newItem);
                this._syncToStorage();
                EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
                console.log('[DecoRepository] 新建成功，正式 ID:', result.id);
                return newItem;
            } catch (error) {
                console.error('[DecoRepository] 新建失败:', error);
                throw error;
            }
        } else {
            // 同步中拒绝再次编辑：并发 PUT 会导致 position 互相覆盖
            if (this._pendingIds.has(item.id)) {
                throw new Error('该贴图正在同步中，请稍后操作');
            }
            console.log('[DecoRepository] 更新贴图:', item.id);
            this._ensureCache();
            const index = this._cache.findIndex(i => i.id === item.id);
            if (index !== -1) {
                this._cache[index] = { ...this._cache[index], ...item };
            } else {
                this._cache.push(item);
            }
            this._syncToStorage();
            this._pendingIds.add(item.id);
            try {
                await this._putToServer(item);
                this._pendingIds.delete(item.id);
                EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
                return item;
            } catch (error) {
                this._pendingIds.delete(item.id);
                console.warn('[DecoRepository] 更新同步失败，已保存到本地，将在下次加载时重试:', error);
                const queue = StorageAdapter.get('deco_sync_fail_queue') || [];
                if (!queue.includes(item.id)) {
                    queue.push(item.id);
                    StorageAdapter.set('deco_sync_fail_queue', queue);
                }
                EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
                return item;
            }
        }
    },

    // 删除贴纸
    // 本地先行删除并返回成功：服务器删除失败不阻塞 UI，残留数据由下次同步收敛
    async delete(id) {
        if (this._pendingIds.has(id)) {
            throw new Error('该贴图正在同步中，请稍后操作');
        }
        this._ensureCache();
        const index = this._cache.findIndex(item => item.id === id);
        if (index !== -1) {
            this._cache.splice(index, 1);
            this._syncToStorage();
            EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
        }
        try {
            await this._deleteFromServer(id);
            return true;
        } catch (error) {
            console.warn('[DecoRepository] 删除同步失败，已从本地删除:', error);
            return true;
        }
    },

    // 强制从服务器同步
    async syncFromServer() {
        return this._fetchFromServer(true);
    },

    // 获取全部贴纸
    getAll() {
        this._ensureCache();
        return [...this._cache];
    },

    // 获取单个贴纸
    get(id) {
        this._ensureCache();
        return this._cache.find(item => item.id === id) || null;
    },

    // 从服务器拉取
    // 用 try-catch 兜底：拉取失败时逐级回退到内存缓存、本地存储、空数组，保证调用方总能拿到数组
    async _fetchFromServer(forceUpdate = false) {
        try {
            const data = await ApiClient.get(API_ENDPOINTS.DECOS);
            const list = Array.isArray(data) ? data : [];
            const enriched = list.map(item => ({
                ...item,
                dataUrl: `/api/decos/${item.id}/image`
            }));
            this._cache = enriched;
            this._syncToStorage();
            console.log('[DecoRepository] 从服务器同步成功，共', enriched.length, '项');
            EventBus.emit(EVENTS.DECO_LIBRARY_CHANGED);
            return enriched;
        } catch (error) {
            console.error('[DecoRepository] 从服务器拉取失败:', error);
            if (this._cache) return this._cache;
            const local = StorageAdapter.get(STORAGE_KEY);
            if (local && Array.isArray(local)) {
                const enriched = local.map(item => ({
                    ...item,
                    dataUrl: `/api/decos/${item.id}/image`
                }));
                this._cache = enriched;
                return enriched;
            }
            this._cache = [];
            return [];
        }
    },

    // 后台静默同步
    // 解决「本地有位置但服务器 position 为 null」的冲突：以服务器为权威，同时把本地位置推回服务器
    async _syncFromServerSilently() {
        try {
            const serverData = await ApiClient.get(API_ENDPOINTS.DECOS);
            const serverList = Array.isArray(serverData) ? serverData : [];
            if (serverList.length === 0) return;

            const serverMap = new Map(serverList.map(item => [item.id, item]));
            let merged = 0;
            this._ensureCache();
            // 合并规则：服务器有有效位置 → 采用；本地有位置但服务器为 null → 需同步到服务器
            const needSync = [];
            for (const cached of this._cache) {
                const server = serverMap.get(cached.id);
                if (server) {
                    if (server.position !== null && server.position !== undefined) {
                        cached.position = server.position;
                        merged++;
                    } else if (cached.position) {
                        // 本地有位置但服务器为 null → 标记需推送
                        needSync.push(cached.id);
                    }
                    if (server.name !== undefined) cached.name = server.name;
                    if (server.style !== undefined) cached.style = server.style;
                }
            }
            // 添加服务器有但本地没有的贴纸
            for (const server of serverList) {
                if (!this._cache.some(c => c.id === server.id)) {
                    this._cache.push({
                        ...server,
                        dataUrl: `/api/decos/${server.id}/image`
                    });
                }
            }
            this._syncToStorage();
            // 本地有位置但服务器为 null → 加入重试队列，等登录后推送到服务器
            if (needSync.length > 0) {
                const StorageAdapterSync = (await import('./storage-adapter.js')).StorageAdapter;
                const queue = StorageAdapterSync.get('deco_sync_fail_queue') || [];
                for (const id of needSync) {
                    if (!queue.includes(id)) queue.push(id);
                }
                StorageAdapterSync.set('deco_sync_fail_queue', queue);
                console.log('[DecoRepository] 静默同步：', needSync.length, '项需推送到服务器');
            }
            if (merged > 0) console.log('[DecoRepository] 静默同步：从服务器合并了', merged, '项位置数据');
        } catch (e) {
            // 忽略：静默同步失败不打扰用户，下次 load 时自动重试
        }
    },

    // 新建到服务器
    // 支持两种来源：已压缩好的 dataUrl，或原始 File（转 base64 后上传）
    async _postToServer(item) {
        let base64 = item.dataUrl;
        if (!base64 && item.file) {
            base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(item.file);
            });
        }
        if (!base64) {
            throw new Error('No image data');
        }
        const payload = {
            name: item.name || '',
            base64: base64,
        };
        const result = await ApiClient.post(API_ENDPOINTS.DECOS, payload);
        return result;
    },

    // 更新到服务器
    // 剔除 file/dataUrl：二者是本地的临时字段，序列化上传会撑爆请求体
    async _putToServer(item) {
        const endpoint = API_ENDPOINTS.DECOS + '/' + item.id;
        const payload = { ...item };
        delete payload.file;
        delete payload.dataUrl;
        await ApiClient.put(endpoint, payload);
    },

    // 从服务器删除
    async _deleteFromServer(id) {
        const endpoint = API_ENDPOINTS.DECOS + '/' + id;
        await ApiClient.delete(endpoint);
    },

    // 写入本地存储
    // 不存 dataUrl：图片路由可随时按 id 重建，存 base64 会迅速撑爆 localStorage 配额
    _syncToStorage() {
        if (this._cache) {
            const toStore = this._cache.map(item => {
                const { dataUrl, ...rest } = item;
                return rest;
            });
            StorageAdapter.set(STORAGE_KEY, toStore);
            console.log('[DecoRepository] 已同步到本地存储，共', toStore.length, '项');
        } else {
            StorageAdapter.set(STORAGE_KEY, []);
        }
    },
};
