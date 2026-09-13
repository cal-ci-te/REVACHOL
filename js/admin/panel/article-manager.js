// ！文章管理面板
// 面板内的文章列表与内联编辑器：列表按分类分组展示，点击行载入编辑器。
// 增删改均先请求后端、再重新拉取数据并广播事件，使目录树与卡片列表同步刷新。
import { ArticleService } from '../../services/article-service.js';
import { EventBus } from '../../core/event-bus.js';
import { EVENTS } from '../../core/event-constants.js';
import { Utils } from '../../utils.js';
import { AppState } from '../../core/app-state.js';
import { ApiClient } from '../../services/api-client.js';
import { UI } from '../../utils/ui-strings.js';

export const AdminArticleManager = {
    currentEditId: null,

    init() {
        this.renderList();
        this.bindEvents();
        // 订阅数据变更自动重绘列表：可见性变更与数据加载都会影响列表内容
        EventBus.on(EVENTS.ARTICLE_VISIBILITY_CHANGED, () => this.renderList());
        EventBus.on(EVENTS.ARTICLE_DATA_LOADED, () => this.renderList());
        // 登录态变化也需重绘：管理员登录后才应看到列表
        EventBus.on(EVENTS.AUTH_LOGGED_IN, () => this.renderList());
    },

    renderList() {
        const container = document.getElementById('articleManagementList');
        if (!container) return;
        // 非管理员不展示列表内容，仅给出登录提示
        if (!AppState.get('isLoggedIn')) {
            container.innerHTML = `<div style="color:var(--color-text-muted);text-align:center;padding:10px;">${UI.notification.loginRequired}</div>`;
            return;
        }
        const articles = ArticleService.getAllArticles();
        if (!articles || articles.length === 0) {
            container.innerHTML = `<div style="color:var(--color-text-muted);text-align:center;padding:10px;">${UI.admin.articleEmpty}</div>`;
            return;
        }
        // 按分类分组展示
        const groups = {};
        articles.forEach(a => {
            const cat = a.category || '未分类';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(a);
        });
        let html = '';
        for (const [cat, items] of Object.entries(groups)) {
            // 标题与分类名均可能含用户输入，拼入 HTML 前需转义
            html += `<div style="font-size:10px;color:var(--color-text-secondary);padding:2px 8px;background:var(--color-bg-secondary);border-bottom:1px solid var(--color-danger);">📁 ${Utils.escapeHtml(cat)}</div>`;
            items.forEach(a => {
                const visible = a.visible !== false;
                html += `
                    <div class="article-list-item" data-id="${a.id}" style="display:flex;align-items:center;padding:4px 8px;border-bottom:1px solid var(--color-bg-tertiary);cursor:pointer;hover:background:var(--color-danger);">
                        <span style="flex:1;font-size:11px;color:var(--color-text-accent);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${Utils.escapeHtml(a.title)}</span>
                        <span style="font-size:9px;color:${visible ? 'var(--color-success)' : 'var(--color-border)'};margin-right:8px;">${visible ? '👁️' : '🚫'}</span>
                        <button class="edit-article-btn" data-id="${a.id}" style="background:none;border:none;color:var(--color-text-secondary);cursor:pointer;font-size:12px;padding:0 4px;" title="${UI.common.edit}">✏️</button>
                        <button class="delete-article-btn" data-id="${a.id}" style="background:none;border:none;color:var(--color-error);cursor:pointer;font-size:12px;padding:0 4px;" title="${UI.common.delete}">🗑️</button>
                    </div>
                `;
            });
        }
        container.innerHTML = html;

        // 行内按钮的点击需 stopPropagation：否则会冒泡到行的点击处理而同时打开编辑器
        container.querySelectorAll('.edit-article-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.loadArticleToEditor(id);
            });
        });
        container.querySelectorAll('.delete-article-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                this.deleteArticle(id);
            });
        });
        container.querySelectorAll('.article-list-item').forEach(row => {
            row.addEventListener('click', (e) => {
                // 行内按钮已有各自处理，此处跳过以免重复执行
                if (e.target.closest('button')) return;
                const id = parseInt(row.dataset.id);
                this.loadArticleToEditor(id);
            });
        });
    },

    // 把文章载入内联编辑器
    loadArticleToEditor(id) {
        const articles = ArticleService.getAllArticles();
        const article = articles.find(a => a.id === id);
        if (!article) {
            Utils.showToast(UI.editor.articleNotFound, true);
            return;
        }
        this.currentEditId = id;
        document.getElementById('editArticleId').textContent = id;
        document.getElementById('editArticleTitle').value = article.title || '';
        document.getElementById('editArticleCategory').value = article.category || '';
        document.getElementById('editArticleContent').value = article.content || '';
        // visible 缺省视为可见，与后端语义保持一致
        document.getElementById('editArticleVisible').checked = article.visible !== false;
        document.getElementById('articleEditor').style.display = 'block';
        document.getElementById('deleteArticleBtn').style.display = 'inline-block';
        document.getElementById('articleEditor').scrollIntoView({ behavior: 'smooth', block: 'center' });
    },

    // 清空编辑器并收起，进入「新建」状态
    resetEditor() {
        this.currentEditId = null;
        document.getElementById('editArticleId').textContent = '';
        document.getElementById('editArticleTitle').value = '';
        document.getElementById('editArticleCategory').value = '';
        document.getElementById('editArticleContent').value = '';
        document.getElementById('editArticleVisible').checked = true;
        document.getElementById('articleEditor').style.display = 'none';
        document.getElementById('deleteArticleBtn').style.display = 'none';
    },

    // 保存文章：有 currentEditId 走更新，否则新建
    // 保存后强制重拉数据并广播两个事件，让目录树与卡片列表各自刷新
    async saveArticle() {
        const title = document.getElementById('editArticleTitle').value.trim();
        const category = document.getElementById('editArticleCategory').value.trim() || '未分类';
        const content = document.getElementById('editArticleContent').value;
        const visible = document.getElementById('editArticleVisible').checked;
        if (!title) {
            Utils.showToast(UI.editor.titleRequired, true);
            return;
        }
        const id = this.currentEditId;
        const payload = { title, content, category, visible };
        try {
            let result;
            if (id) {
                result = await ApiClient.put(`/api/articles/${id}`, payload);
            } else {
                result = await ApiClient.post('/api/articles', payload);
            }
            Utils.showToast(id ? UI.notification.articleSaved : UI.notification.articleCreated(title), false);
            await ArticleService.fetchArticles(true);
            this.renderList();
            this.resetEditor();
            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, {});
            EventBus.emit(EVENTS.ARTICLE_DATA_LOADED);
        } catch (err) {
            Utils.showToast(UI.notification.articleSaveFailed + err.message, true);
        }
    },

    // 删除文章：不可撤销，故二次确认
    async deleteArticle(id) {
        if (!confirm(UI.notification.articleDeleteConfirm)) return;
        try {
            await ApiClient.delete(`/api/articles/${id}`);
            Utils.showToast(UI.notification.articleDeleted, false);
            await ArticleService.fetchArticles(true);
            this.renderList();
            // 删除的恰是正在编辑的文章时需收起编辑器，避免残留已失效的编辑态
            if (this.currentEditId === id) this.resetEditor();
            EventBus.emit(EVENTS.ARTICLE_VISIBILITY_CHANGED, {});
            EventBus.emit(EVENTS.ARTICLE_DATA_LOADED);
        } catch (err) {
            Utils.showToast(UI.notification.articleDeleteFailed + err.message, true);
        }
    },

    // 在 document 上以委托方式绑定工具条动作
    // 用委托而非绑定具体按钮：本文模块的按钮可能由面板重建，委托可避免重复绑定
    bindEvents() {
        document.addEventListener('click', (e) => {
            const target = e.target.closest('[data-action]');
            if (!target) return;
            const action = target.dataset.action;
            if (action === 'new-article') {
                this.resetEditor();
                document.getElementById('articleEditor').style.display = 'block';
                document.getElementById('deleteArticleBtn').style.display = 'none';
                document.getElementById('editArticleId').textContent = '';
                document.getElementById('editArticleTitle').focus();
            } else if (action === 'save-article') {
                this.saveArticle();
            } else if (action === 'cancel-edit-article') {
                this.resetEditor();
            } else if (action === 'delete-article') {
                // 待删 id 从编辑器的只读字段读取，即当前正在编辑的那篇
                const id = parseInt(document.getElementById('editArticleId').textContent);
                if (id) this.deleteArticle(id);
            } else if (action === 'refresh-articles') {
                ArticleService.fetchArticles(true).then(() => {
                    this.renderList();
                    Utils.showToast(UI.notification.refreshSuccess, false);
                });
            }
        });
    }
};
