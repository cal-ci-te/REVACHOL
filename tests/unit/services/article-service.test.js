// tests/unit/services/article-service.test.js
// 补充 ArticleService 分类管理与目录树构建测试（数据层无网络依赖部分）
import { describe, it, expect, beforeEach } from 'vitest';
import { ArticleService } from '../../../js/services/article-service.js';

describe('ArticleService — 分类与目录树', () => {
  beforeEach(() => {
    ArticleService._data = [];
    ArticleService.cache = { data: null, timestamp: null };
    ArticleService._categories = [];
    ArticleService._initialCategoriesLoaded = false;
    localStorage.clear();
  });

  describe('getCategoryTree', () => {
    it('should build nested tree from flat categories', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
        { id: 'b', name: 'B', parent: null },
      ];
      const tree = ArticleService.getCategoryTree();
      expect(tree).toHaveLength(2);
      const a = tree.find((n) => n.name === 'A');
      expect(a.children).toHaveLength(1);
      expect(a.children[0].name).toBe('A1');
    });

    it('should return empty array when no categories', () => {
      expect(ArticleService.getCategoryTree()).toEqual([]);
    });
  });

  describe('getCategoryChildren / getCategoryParent', () => {
    it('should return direct children', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
        { id: 'a2', name: 'A2', parent: 'a' },
      ];
      expect(ArticleService.getCategoryChildren('a')).toHaveLength(2);
      expect(ArticleService.getCategoryChildren('nonexistent')).toEqual([]);
    });

    it('should return parent id', () => {
      ArticleService._categories = [{ id: 'a1', name: 'A1', parent: 'a' }];
      expect(ArticleService.getCategoryParent('a1')).toBe('a');
      expect(ArticleService.getCategoryParent('missing')).toBeUndefined();
    });
  });

  describe('findCategoryById', () => {
    it('should find category by id or return null', () => {
      ArticleService._categories = [{ id: 'x', name: 'X', parent: null }];
      expect(ArticleService.findCategoryById('x').name).toBe('X');
      expect(ArticleService.findCategoryById('missing')).toBeNull();
    });
  });

  describe('addCategory', () => {
    it('should add a root category', () => {
      expect(ArticleService.addCategory('NewCat')).toBe(true);
      expect(ArticleService._categories.some((c) => c.name === 'NewCat')).toBe(true);
    });

    it('should reject duplicate name', () => {
      ArticleService.addCategory('Dup');
      expect(ArticleService.addCategory('Dup')).toBe(false);
    });

    it('should reject empty name', () => {
      expect(ArticleService.addCategory('   ')).toBe(false);
    });
  });

  describe('moveCategory', () => {
    it('should move category to new parent', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
        { id: 'b', name: 'B', parent: null },
      ];
      expect(ArticleService.moveCategory('a1', 'b')).toBe(true);
      expect(ArticleService.findCategoryById('a1').parent).toBe('b');
    });

    it('should reject moving to itself', () => {
      ArticleService._categories = [{ id: 'a', name: 'A', parent: null }];
      expect(ArticleService.moveCategory('a', 'a')).toBe(false);
    });

    it('should reject circular move', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
      ];
      expect(ArticleService.moveCategory('a', 'a1')).toBe(false);
    });
  });

  describe('renameCategory', () => {
    it('should rename and migrate child parent refs', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
      ];
      ArticleService._data = [{ id: 1, category: 'a' }];
      expect(ArticleService.renameCategory('a', 'Renamed')).toBe(true);
      expect(ArticleService.findCategoryById('Renamed').name).toBe('Renamed');
      expect(ArticleService.findCategoryById('a1').parent).toBe('Renamed');
      expect(ArticleService._data[0].category).toBe('Renamed');
    });
  });

  describe('setCategoriesOrder / reparent / remove', () => {
    it('should set root category order', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null, sort_order: 0 },
        { id: 'b', name: 'B', parent: null, sort_order: 1 },
      ];
      ArticleService.setCategoriesOrder(['b', 'a']);
      expect(ArticleService.findCategoryById('b').sort_order).toBe(0);
      expect(ArticleService.findCategoryById('a').sort_order).toBe(1);
    });

    it('should reparent children', () => {
      ArticleService._categories = [
        { id: 'a1', name: 'A1', parent: 'a' },
        { id: 'a2', name: 'A2', parent: 'a' },
      ];
      ArticleService.reparentCategoryChildren('a', 'b');
      expect(ArticleService.findCategoryById('a1').parent).toBe('b');
    });

    it('should remove category entry by id', () => {
      ArticleService._categories = [{ id: 'a', name: 'A', parent: null }];
      expect(ArticleService.removeCategoryEntry('a')).toBe(true);
      expect(ArticleService.findCategoryById('a')).toBeNull();
    });

    it('should batch remove categories by ids', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'b', name: 'B', parent: null },
      ];
      ArticleService.removeCategoriesByIds(['a']);
      expect(ArticleService.findCategoryById('a')).toBeNull();
      expect(ArticleService.findCategoryById('b')).not.toBeNull();
    });
  });

  describe('removeCategory', () => {
    it('should remove category and its descendants', () => {
      ArticleService._categories = [
        { id: 'a', name: 'A', parent: null },
        { id: 'a1', name: 'A1', parent: 'a' },
        { id: 'b', name: 'B', parent: null },
      ];
      expect(ArticleService.removeCategory('a')).toBe(true);
      expect(ArticleService.findCategoryById('a')).toBeNull();
      expect(ArticleService.findCategoryById('a1')).toBeNull();
      expect(ArticleService.findCategoryById('b')).not.toBeNull();
    });
  });

  describe('buildDirectoryTree', () => {
    it('should build tree with folders and articles', () => {
      ArticleService._categories = [
        { id: 'cat1', name: 'Cat1', parent: null, sort_order: 0 },
      ];
      const articles = [
        { id: 1, title: 'A1', category: 'cat1' },
        { id: 2, title: 'A2', category: 'cat1' },
      ];
      const tree = ArticleService.buildDirectoryTree(articles);
      expect(tree).toHaveLength(1);
      expect(tree[0].type).toBe('folder');
      expect(tree[0].children).toHaveLength(2);
      expect(tree[0].children[0].type).toBe('article');
    });

    it('should sort folders by sort_order then pinyin', () => {
      ArticleService._categories = [
        { id: 'b', name: 'Beta', parent: null, sort_order: 1 },
        { id: 'a', name: 'Alpha', parent: null, sort_order: 0 },
      ];
      const tree = ArticleService.buildDirectoryTree([]);
      expect(tree.map((n) => n.name)).toEqual(['Alpha', 'Beta']);
    });
  });

  describe('addArticleToCache', () => {
    it('should add article to cache without duplicate', () => {
      ArticleService._data = [{ id: 1 }];
      ArticleService.addArticleToCache({ id: 2 });
      expect(ArticleService.getAllArticles()).toHaveLength(2);
      ArticleService.addArticleToCache({ id: 2 });
      expect(ArticleService.getAllArticles()).toHaveLength(2);
    });
  });

  describe('getArticlesByCategory / isVisible / getStats', () => {
    it('should return all for "all"', () => {
      ArticleService._data = [{ id: 1, category: 'x' }, { id: 2, category: 'y' }];
      expect(ArticleService.getArticlesByCategory('all')).toHaveLength(2);
    });

    it('should filter by category', () => {
      ArticleService._data = [{ id: 1, category: 'x' }, { id: 2, category: 'y' }];
      expect(ArticleService.getArticlesByCategory('x')).toHaveLength(1);
    });

    it('should determine visibility', () => {
      ArticleService._data = [{ id: 1, visible: true }, { id: 2, visible: false }];
      expect(ArticleService.isVisible(1)).toBe(true);
      expect(ArticleService.isVisible(2)).toBe(false);
      expect(ArticleService.isVisible(99)).toBe(false);
    });

    it('should compute stats', () => {
      ArticleService._categories = [{ id: 'a', name: 'A', parent: null }];
      ArticleService._data = [
        { id: 1, visible: true },
        { id: 2, visible: false },
      ];
      const stats = ArticleService.getStats();
      expect(stats.total).toBe(2);
      expect(stats.visible).toBe(1);
      expect(stats.hidden).toBe(1);
      expect(stats.categories).toBe(1);
    });
  });

  describe('saveSnapshot / restoreSnapshot', () => {
    it('should save and restore state', () => {
      ArticleService._data = [{ id: 1, title: 'X' }];
      ArticleService._categories = [{ id: 'a', name: 'A', parent: null }];
      const snap = ArticleService.saveSnapshot();

      ArticleService._data = [];
      ArticleService._categories = [];
      ArticleService.restoreSnapshot(snap);

      expect(ArticleService._data).toEqual([{ id: 1, title: 'X' }]);
      expect(ArticleService._categories).toEqual([
        { id: 'a', name: 'A', parent: null },
      ]);
    });

    it('should do nothing when snapshot is null', () => {
      ArticleService._data = [{ id: 1 }];
      ArticleService.restoreSnapshot(null);
      expect(ArticleService._data).toEqual([{ id: 1 }]);
    });
  });
});
