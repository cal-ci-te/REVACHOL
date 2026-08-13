// tests/unit/admin/panel/article-manager.test.js
// 测试文章管理面板：列表渲染、编辑器加载/重置、保存、删除
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../js/core/app-state.js', () => ({
  AppState: { get: vi.fn() },
}));
vi.mock('../../../../js/core/event-bus.js', () => ({
  EventBus: { on: vi.fn(), emit: vi.fn() },
}));
vi.mock('../../../../js/core/event-constants.js', () => ({
  EVENTS: {
    ARTICLE_VISIBILITY_CHANGED: 'article:visibility-changed',
    ARTICLE_DATA_LOADED: 'article:data-loaded',
    AUTH_LOGGED_IN: 'auth:logged-in',
  },
}));
vi.mock('../../../../js/services/article-service.js', () => ({
  ArticleService: { getAllArticles: vi.fn(), fetchArticles: vi.fn() },
}));
vi.mock('../../../../js/services/api-client.js', () => ({
  ApiClient: { put: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../../../js/utils/ui-strings.js', () => ({
  UI: {
    notification: {
      loginRequired: 'login required',
      articleEmpty: 'empty',
      articleSaved: 'saved',
      articleCreated: (t) => `created ${t}`,
      articleDeleted: 'deleted',
      articleDeleteConfirm: 'confirm?',
      articleSaveFailed: 'save failed ',
      articleDeleteFailed: 'delete failed ',
      refreshSuccess: 'refreshed',
    },
    admin: { articleEmpty: 'empty' },
    editor: { titleRequired: 'title required', articleNotFound: 'not found' },
    common: { edit: 'edit', delete: 'delete' },
  },
}));
vi.mock('../../../../js/utils.js', () => ({
  Utils: { escapeHtml: (s) => String(s), showToast: vi.fn() },
}));

import { AdminArticleManager } from '../../../../js/admin/panel/article-manager.js';
import { AppState } from '../../../../js/core/app-state.js';
import { ArticleService } from '../../../../js/services/article-service.js';
import { ApiClient } from '../../../../js/services/api-client.js';
import { Utils } from '../../../../js/utils.js';

function setupEditorDom() {
  document.body.innerHTML = `
    <div id="articleManagementList"></div>
    <div id="editArticleId"></div>
    <input id="editArticleTitle" />
    <input id="editArticleCategory" />
    <textarea id="editArticleContent"></textarea>
    <input id="editArticleVisible" type="checkbox" />
    <div id="articleEditor"></div>
    <button id="deleteArticleBtn"></button>
  `;
}

describe('AdminArticleManager', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    AdminArticleManager.currentEditId = null;
    vi.clearAllMocks();
    // jsdom 未实现 scrollIntoView，需要打桩
    Element.prototype.scrollIntoView = () => {};
  });

  describe('renderList', () => {
    it('should show login required for guest', () => {
      document.body.innerHTML = '<div id="articleManagementList"></div>';
      AppState.get.mockReturnValue(false);
      AdminArticleManager.renderList();
      expect(document.getElementById('articleManagementList').innerHTML).toContain(
        'login required'
      );
    });

    it('should show empty message when no articles', () => {
      document.body.innerHTML = '<div id="articleManagementList"></div>';
      AppState.get.mockReturnValue(true);
      ArticleService.getAllArticles.mockReturnValue([]);
      AdminArticleManager.renderList();
      expect(document.getElementById('articleManagementList').innerHTML).toContain(
        'empty'
      );
    });

    it('should render grouped articles', () => {
      document.body.innerHTML = '<div id="articleManagementList"></div>';
      AppState.get.mockReturnValue(true);
      ArticleService.getAllArticles.mockReturnValue([
        { id: 1, title: 'Title A', category: 'Cat1', visible: true },
        { id: 2, title: 'Title B', category: 'Cat2', visible: false },
      ]);
      AdminArticleManager.renderList();
      const html = document.getElementById('articleManagementList').innerHTML;
      expect(html).toContain('Cat1');
      expect(html).toContain('Cat2');
      expect(html).toContain('Title B');
    });

    it('should return early when container missing', () => {
      AppState.get.mockReturnValue(true);
      ArticleService.getAllArticles.mockReturnValue([{ id: 1 }]);
      expect(() => AdminArticleManager.renderList()).not.toThrow();
    });
  });

  describe('loadArticleToEditor', () => {
    it('should show toast when article not found', () => {
      ArticleService.getAllArticles.mockReturnValue([]);
      AdminArticleManager.loadArticleToEditor(99);
      expect(Utils.showToast).toHaveBeenCalled();
    });

    it('should populate editor fields', () => {
      setupEditorDom();
      ArticleService.getAllArticles.mockReturnValue([
        { id: 1, title: 'T', category: 'C', content: 'Body', visible: true },
      ]);
      AdminArticleManager.loadArticleToEditor(1);
      expect(document.getElementById('editArticleTitle').value).toBe('T');
      expect(AdminArticleManager.currentEditId).toBe(1);
    });
  });

  describe('resetEditor', () => {
    it('should reset fields and state', () => {
      setupEditorDom();
      AdminArticleManager.currentEditId = 1;
      AdminArticleManager.resetEditor();
      expect(AdminArticleManager.currentEditId).toBeNull();
      expect(document.getElementById('editArticleTitle').value).toBe('');
      expect(document.getElementById('articleEditor').style.display).toBe('none');
    });
  });

  describe('saveArticle', () => {
    it('should show toast when title missing', async () => {
      setupEditorDom();
      await AdminArticleManager.saveArticle();
      expect(Utils.showToast).toHaveBeenCalled();
    });

    it('should create article via POST when no current id', async () => {
      setupEditorDom();
      document.getElementById('editArticleTitle').value = 'New Title';
      document.getElementById('editArticleCategory').value = 'Cat';
      document.getElementById('editArticleContent').value = 'Body';
      document.getElementById('editArticleVisible').checked = true;
      AdminArticleManager.currentEditId = null;
      ApiClient.post.mockResolvedValue({ id: 1 });
      ArticleService.fetchArticles.mockResolvedValue([]);

      await AdminArticleManager.saveArticle();

      expect(ApiClient.post).toHaveBeenCalledWith('/api/articles', {
        title: 'New Title',
        content: 'Body',
        category: 'Cat',
        visible: true,
      });
      expect(ApiClient.put).not.toHaveBeenCalled();
    });

    it('should update article via PUT when current id set', async () => {
      setupEditorDom();
      document.getElementById('editArticleTitle').value = 'Updated';
      document.getElementById('editArticleCategory').value = 'Cat';
      document.getElementById('editArticleContent').value = 'Body';
      document.getElementById('editArticleVisible').checked = true;
      AdminArticleManager.currentEditId = 5;
      ApiClient.put.mockResolvedValue({});
      ArticleService.fetchArticles.mockResolvedValue([]);

      await AdminArticleManager.saveArticle();

      expect(ApiClient.put).toHaveBeenCalledWith('/api/articles/5', {
        title: 'Updated',
        content: 'Body',
        category: 'Cat',
        visible: true,
      });
    });
  });

  describe('deleteArticle', () => {
    it('should delete via API and refresh', async () => {
      setupEditorDom();
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
      ApiClient.delete.mockResolvedValue({});
      ArticleService.fetchArticles.mockResolvedValue([]);

      await AdminArticleManager.deleteArticle(3);

      expect(ApiClient.delete).toHaveBeenCalledWith('/api/articles/3');
      confirmSpy.mockRestore();
    });

    it('should do nothing when confirm cancelled', async () => {
      const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
      await AdminArticleManager.deleteArticle(3);
      expect(ApiClient.delete).not.toHaveBeenCalled();
      confirmSpy.mockRestore();
    });
  });
});
