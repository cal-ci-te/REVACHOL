import { Utils } from '../../../utils.js';
import { Article } from '../../../models/article-model.js';
import { ArticleService } from '../../../services/article-service.js';
import { EventBus } from '../../../core/event-bus.js';
import { EVENTS } from '../../../core/event-constants.js';
import { ApiClient } from '../../../services/api-client.js';
import { UI } from '../../../utils/ui-strings.js';

/**
 * 发送 BroadcastChannel 消息
 */
function broadcastChange(type, payload) {
    try {
        const channel = new BroadcastChannel('revachol');
        channel.postMessage({ type, payload });
        channel.close();
    } catch (e) {
        // 忽略
    }
}

export function showContextMenu(x, y, type, name, articleId, nodeLi, updateTreeFn) {
    // 移除旧菜单
    const oldMenu = document.getElementById('directory-context-menu');
    if (oldMenu) oldMenu.remove();

    let folderForNew = name;
    if (type === 'article' && articleId) {
        const article = Article.allArticles.find(a => a.id === articleId);
        if (article) {
            folderForNew = article.category || article.categoryName || '未分类';
        }
    }

    const menu = document.createElement('div');
    menu.id = 'directory-context-menu';
    menu.style.cssText =
        'position:fixed;left:' + x + 'px;top:' + y + 'px;background:var(--color-bg-tertiary);border:1px solid var(--color-border);border-radius:4px;padding:4px 0;z-index:99999;min-width:180px;box-shadow:0 4px 20px rgba(0,0,0,0.5);';

    let items = [];
    if (type === 'article') {
        items = [
            { label: UI.directory.menuEditArticle, action: 'edit-article', data: articleId },
            { label: UI.directory.menuRenameArticle, action: 'rename-article', data: articleId },
            { label: UI.directory.menuNewArticle, action: 'new-article-in-folder', data: folderForNew },
            { label: UI.directory.menuNewFolder, action: 'new-folder-inside', data: folderForNew },
            { label: UI.directory.menuDeleteArticle, action: 'delete-article', data: articleId },
        ];
    } else if (type === 'folder') {
        items = [
            { label: UI.directory.menuNewArticle, action: 'new-article-in-folder', data: name },
            { label: UI.directory.menuNewFolder, action: 'new-folder-inside', data: name },
            { label: UI.directory.menuNewRootFolder, action: 'new-folder-root', data: null },
            { label: UI.directory.menuRenameFolder, action: 'rename-folder', data: name },
            { label: UI.directory.menuDeleteFolderOnly, action: 'delete-folder-only', data: name },
            { label: UI.directory.menuDeleteFolderWithArticles, action: 'delete-folder-with-articles', data: name },
        ];
    } else {
        items = [
            { label: UI.directory.menuNewArticleRoot, action: 'new-article-root', data: null },
            { label: UI.directory.menuNewFolderRoot, action: 'new-folder-root', data: null },
        ];
    }

    items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'ctx-item';
        div.textContent = item.label;
        div.style.cssText =
            'padding:6px 16px;cursor:pointer;color:var(--color-text-accent);font-family:\'Courier New\',monospace;font-size:12px;';
        div.addEventListener('mouseenter', function () {
            this.style.background = 'var(--color-danger)';
        });
        div.addEventListener('mouseleave', function () {
            this.style.background = 'transparent';
        });
        div.addEventListener('click', (e) => {
            e.stopPropagation();
            handleContextAction(item.action, item.data, nodeLi, updateTreeFn);
            menu.remove();
        });
        menu.appendChild(div);
    });

    document.body.appendChild(menu);

    const closeMenu = function (e) {
        if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener('click', closeMenu);
        }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function handleContextAction(action, data, nodeLi, updateTreeFn) {
    // ---- 编辑文章 → 内联编辑模式 ----
    if (action === 'edit-article') {
        // 通过全局命名空间访问 ArticleEditorMode
        const AEM = window.__REVACHOL__ && window.__REVACHOL__.ArticleEditorMode;
        if (AEM && typeof AEM.open === 'function') {
            AEM.open(data);
        } else {
            Utils.showToast('编辑器模块未加载，请刷新页面后重试', true);
        }
        return;
    }

    // ---- 重命名文章 ----
    if (action === 'rename-article') {
        const newName = prompt(UI.deco.renamePrompt);
        if (newName && newName.trim()) {
            const article = Article.allArticles.find(a => a.id === data);
            if (article) {
                article.title = newName.trim();
                try {
                    await ApiClient.put(`/api/articles/${data}`, {
                        title: article.title,
                        content: article.content,
                        category: article.category
                    });
                    Utils.showToast(UI.notification.articleRenameSuccess, false);
                    await ArticleService.fetchArticles(true);
                    if (updateTreeFn) updateTreeFn();
                } catch (err) {
                    Utils.showToast(UI.notification.articleRenameFailed, true);
                }
            }
        }
        return;
    }

    // ---- 删除文章 ----
    if (action === 'delete-article') {
        console.log('[ContextMenu] 删除文章，传入 data (articleId):', data);
        if (!confirm(UI.notification.articleDeleteConfirm || '确定要删除这篇文章吗？')) return;
        const all = ArticleService.getAllArticles();
        if (!all.some(a => a.id === data)) {
            Utils.showToast(UI.toast.articleIdExpired, true);
            return;
        }
        try {
            console.log('[ContextMenu] 发送 DELETE 请求到 /api/articles/' + data);
            await ApiClient.delete(`/api/articles/${data}`);
            Utils.showToast(UI.notification.articleDeleted, false);
            console.log('[ContextMenu] 删除成功，刷新数据...');
            await ArticleService.fetchArticles(true);
            console.log('[ContextMenu] 数据刷新完成，更新目录树...');
            if (updateTreeFn) updateTreeFn();
            console.log('[ContextMenu] 目录树更新完成');
            broadcastChange('article_deleted', { articleId: data });
        } catch (err) {
            console.error('[ContextMenu] 删除失败:', err);
            Utils.showToast(UI.notification.articleDeleteFailed + err.message, true);
        }
        return;
    }

    // ---- 新建文件夹（根目录） ----
    if (action === 'new-folder-root') {
        const folderName = prompt(UI.directory.menuNewFolder + '：');
        if (!folderName || !folderName.trim()) return;
        const trimmed = folderName.trim();
        if (ArticleService.addCategory(trimmed, null)) {
            Utils.showToast(UI.toast.folderCreateSuccess(trimmed), false);
            if (updateTreeFn) updateTreeFn();
        } else {
            Utils.showToast(UI.toast.folderCreateFailed, true);
        }
        return;
    }

    // ---- 新建子文件夹 ----
    if (action === 'new-folder-inside' && data) {
        const folderName = prompt(UI.directory.menuNewFolder + '（在 "' + data + '" 下）：');
        if (!folderName || !folderName.trim()) return;
        const trimmed = folderName.trim();
        if (ArticleService.addCategory(trimmed, data)) {
            Utils.showToast(UI.toast.folderCreateSuccess(trimmed), false);
            if (updateTreeFn) updateTreeFn();
        } else {
            Utils.showToast(UI.toast.folderCreateFailed, true);
        }
        return;
    }

    // ---- 新建文章 ----
    if (action === 'new-article-root' || action === 'new-article-in-folder') {
        let category = '未分类';
        if (action === 'new-article-in-folder' && data) {
            category = data;
        }
        const title = prompt('请输入文章标题：');
        if (title === null) return;
        const trimmedTitle = title.trim();
        if (!trimmedTitle) {
            Utils.showToast(UI.toast.articleTitleEmpty, true);
            return;
        }
        console.log('[ContextMenu] 新建文章，标题:', trimmedTitle, '分类:', category);
        try {
            const response = await ApiClient.post('/api/articles', {
                title: trimmedTitle,
                content: '',
                category: category
            });
            console.log('[ContextMenu] 创建成功，响应:', response);
            Utils.showToast(UI.notification.articleCreated(trimmedTitle), false);

            const newArticle = response;
            console.log('[ContextMenu] 新文章 ID:', newArticle.id);

            const allArticles = ArticleService.getAllArticles();
            ArticleService.addArticleToCache(newArticle);
            if (newArticle.id > 0) {
                console.log('[ContextMenu] 已手动将新文章插入缓存，当前文章 ID 列表:', allArticles.map(a => a.id));
            }

            console.log('[ContextMenu] 强制刷新数据...');
            await ArticleService.fetchArticles(true);
            console.log('[ContextMenu] 刷新后文章 ID 列表:', ArticleService.getAllArticles().map(a => a.id));

            if (updateTreeFn) {
                console.log('[ContextMenu] 调用 updateTreeFn 更新目录树');
                updateTreeFn();
            }

            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, { articleCreated: newArticle.id });
            broadcastChange('article_created', { articleId: newArticle.id });

        } catch (err) {
            console.error('[ContextMenu] 新建文章失败:', err);
            Utils.showToast(UI.notification.articleSaveFailed + err.message, true);
        }
        return;
    }

    // ---- 重命名文件夹 ----
    if (action === 'rename-folder') {
        const newName = prompt(UI.directory.menuRenameFolder + '：', data);
        if (newName && newName.trim() && newName.trim() !== data) {
            const trimmed = newName.trim();
            const cat = ArticleService.findCategoryById(data);
            if (!cat) {
                Utils.showToast(UI.toast.folderNotFound, true);
                return;
            }
            const siblings = ArticleService.getCategoryChildren(cat.parent);
            if (siblings.some(c => c.name === trimmed && c.id !== data)) {
                Utils.showToast(UI.toast.folderDuplicateName, true);
                return;
            }
            const oldId = cat.id;
            cat.id = trimmed;
            cat.name = trimmed;
            const articles = Article.allArticles.filter(a => a.category === oldId);
            articles.forEach(a => a.category = trimmed);
            ArticleService.reparentCategoryChildren(oldId, trimmed);
            try {
                for (const a of articles) {
                    await ApiClient.put(`/api/articles/${a.id}`, {
                        title: a.title,
                        content: a.content,
                        category: trimmed
                    });
                }
                Utils.showToast(UI.notification.articleRenameSuccess, false);
                await ArticleService.fetchArticles(true);
                if (updateTreeFn) updateTreeFn();
            } catch (err) {
                Utils.showToast(UI.notification.articleRenameFailed, true);
            }
        }
        return;
    }

    // ---- 删除文件夹（仅文件夹） ----
    if (action === 'delete-folder-only') {
        if (!confirm(UI.directory.menuDeleteFolderOnly + '？')) return;
        const cat = ArticleService.findCategoryById(data);
        if (!cat) {
            Utils.showToast(UI.toast.folderNotFound, true);
            return;
        }
        const children = ArticleService.getCategoryChildren(data);
        children.forEach(c => c.parent = null);
        const articles = Article.allArticles.filter(a => a.category === data);
        articles.forEach(a => a.category = '未分类');
        ArticleService.removeCategoryEntry(data);
        try {
            for (const a of articles) {
                await ApiClient.put(`/api/articles/${a.id}`, {
                    title: a.title,
                    content: a.content,
                    category: '未分类'
                });
            }
            Utils.showToast(UI.toast.folderDeleteSuccess, false);
            await ArticleService.fetchArticles(true);
            if (updateTreeFn) updateTreeFn();
        } catch (err) {
            Utils.showToast(UI.toast.folderDeleteFailed, true);
        }
        return;
    }

    // ---- 删除文件夹及所有内容 ----
    if (action === 'delete-folder-with-articles') {
        if (!confirm(UI.directory.menuDeleteFolderWithArticles + '？')) return;
        const cat = ArticleService.findCategoryById(data);
        if (!cat) {
            Utils.showToast(UI.toast.folderNotFound, true);
            return;
        }
        const getDescendantIds = (id) => {
            const children = ArticleService.getCategoryChildren(id);
            let ids = [id];
            children.forEach(c => {
                ids = ids.concat(getDescendantIds(c.id));
            });
            return ids;
        };
        const idsToDelete = getDescendantIds(data);
        const articlesToDelete = Article.allArticles.filter(a => idsToDelete.includes(a.category));
        try {
            for (const a of articlesToDelete) {
                await ApiClient.delete(`/api/articles/${a.id}`);
            }
            ArticleService.removeCategoriesByIds(idsToDelete);
            Utils.showToast(UI.toast.folderDeleteSuccess, false);
            await ArticleService.fetchArticles(true);
            if (updateTreeFn) updateTreeFn();
        } catch (err) {
        Utils.showToast(UI.toast.folderDeleteFailed, true);
        }
        return;
    }
}

// 监听登出：关闭所有打开的右键菜单
EventBus.on(EVENTS.AUTH_LOGGED_OUT, () => {
    const dirMenu = document.getElementById('directory-context-menu');
    if (dirMenu) dirMenu.remove();
    const decoMenu = document.getElementById('deco-context-menu');
    if (decoMenu) decoMenu.style.display = 'none';
});