// ！跨标签页同步
// 经 BroadcastChannel 在多个标签页间同步文章数据变更与超现实箱子默认位置，
// 使管理员在一处改动后其余标签页自动刷新。
import { EventBus } from '../core/event-bus.js';
import { EVENTS } from '../core/event-constants.js';
import { ArticleService } from '../services/article-service.js';

// 建立 BroadcastChannel 并订阅跨标签页同步
// 收到文章增删改或可见性变更时不直接改内存数据，而是重新拉取后广播 ARTICLE_DATA_LOADED：
// 以服务端为唯一事实来源，避免两个标签页各自维护出分歧的数据副本
// 环境不支持时返回 null 而非抛错：跨标签页同步是增强能力，缺失不应阻断启动
export function setupBroadcastChannel() {
    try {
        const channel = new BroadcastChannel('revachol');
        channel.onmessage = (event) => {
            const data = event.data;
            console.log('[BroadcastChannel] 收到消息:', data.type, data.payload);
            const type = data.type;

            if (type === 'article_updated' || type === 'article_created' || 
                type === 'article_deleted' || type === 'visibility_changed') {
                console.log('[BroadcastChannel] 触发数据刷新...');
                ArticleService.fetchArticles(true)
                    .then(() => {
                        console.log('[BroadcastChannel] 数据刷新完成，触发 UI 更新');
                        EventBus.emit(EVENTS.ARTICLE_DATA_LOADED);
                        // 额外手动刷目录树：本标签页可能已错过 UI_INITIALIZED，仅靠事件不一定触发重绘
                        if (window.__REVACHOL__.UIDirectory && typeof window.__REVACHOL__.UIDirectory.updateTree === 'function') {
                            const filter = window.__REVACHOL__.UIDirectory.filterKeyword || null;
                            window.__REVACHOL__.UIDirectory.updateTree(filter);
                            console.log('[BroadcastChannel] 目录树已手动更新');
                        }
                    })
                    .catch(err => {
                        console.error('[BroadcastChannel] 刷新数据失败:', err);
                    });
            } else if (type === 'draft_saved') {
                // 草稿仅存于各自标签页，无需同步
                console.log('[BroadcastChannel] 草稿保存（忽略）:', data.payload);
            } else if (type === 'magic_box_position_changed') {
                // 其他标签页管理员拖拽更新了箱子默认位置
                const { defaultX, defaultY } = data.payload || {};
                if (defaultX !== undefined && defaultY !== undefined) {
                    // 动态导入箱子模块：避免与 magic-box 形成循环依赖，也让未使用箱子的页面不加载它
                    import('../ui/components/magic-box/index.js').then(function (mod) {
                        const box = mod.getMagicBox();
                        if (box && box._state) {
                            box._state.setDefaultPosition(defaultX, defaultY);
                            console.log('[BroadcastChannel] 箱子默认位置已同步:', defaultX, defaultY);
                        }
                    });
                }
            } else {
                console.log('[BroadcastChannel] 未知消息类型:', type);
            }
        };
        window.addEventListener('beforeunload', () => channel.close());
        console.log('✅ BroadcastChannel 已建立');
        return channel;
    } catch (e) {
        console.warn('[BroadcastChannel] 不支持或初始化失败:', e);
        return null;
    }
}