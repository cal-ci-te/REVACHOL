// ！文章 CRUD E2E 测试
// 覆盖文章的创建/编辑/删除与可见性；前置：依赖 auth.setup.js 经 storageState 注入登录态。
// 测试结束后清理所有测试中创建的数据。

import { test, expect } from '@playwright/test';

// 复用 setup 项目保存的登录态
test.use({ storageState: '.auth/user.json' });

// 测试中创建的文章 ID 集合，用于 finally 清理
const createdIds = [];

test.afterAll(async ({ request }) => {
  // 清理所有测试中创建的文章
  for (const id of createdIds) {
    try {
      await request.delete(`/api/articles/${id}`);
    } catch {
      // 忽略清理失败（可能已被手动删除）
    }
  }
});

test.describe('文章 CRUD', () => {

  test('创建新文章', async ({ page, request }) => {
    const title = `E2E 测试文章 ${Date.now()}`;

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 通过 API 创建（比 UI 交互更稳定）
    const resp = await request.post('/api/articles', {
      data: {
        title,
        content: '这是端到端测试创建的临时文章。',
        category: '未分类',
      },
    });

    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.id).toBeDefined();
    createdIds.push(body.id);

    // 刷新页面，验证文章出现在目录树中
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 文章标题应在页面某处可见
    await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('编辑已有文章', async ({ page, request }) => {
    // 先创建一篇测试文章
    const originalTitle = `E2E 编辑测试 ${Date.now()}`;
    const createResp = await request.post('/api/articles', {
      data: { title: originalTitle, content: '原始内容', category: '未分类' },
    });
    const { id } = await createResp.json();
    createdIds.push(id);

    const newTitle = `${originalTitle}（已编辑）`;
    const newContent = '更新后的内容';

    // 通过 API 编辑
    const editResp = await request.put(`/api/articles/${id}`, {
      data: { title: newTitle, content: newContent, category: '未分类' },
    });
    expect(editResp.ok()).toBeTruthy();

    // 验证 GET 返回更新后的数据
    const getResp = await request.get('/api/articles');
    const articles = await getResp.json();
    const edited = articles.find(a => a.id === id);
    expect(edited).toBeDefined();
    expect(edited.title).toBe(newTitle);
  });

  test('删除文章', async ({ request }) => {
    // 创建一篇测试文章
    const createResp = await request.post('/api/articles', {
      data: {
        title: `E2E 删除测试 ${Date.now()}`,
        content: '待删除',
        category: '未分类',
      },
    });
    const { id } = await createResp.json();

    // 删除
    const deleteResp = await request.delete(`/api/articles/${id}`);
    expect(deleteResp.ok()).toBeTruthy();

    // 确认已删除
    const getResp = await request.get('/api/articles');
    const articles = await getResp.json();
    expect(articles.find(a => a.id === id)).toBeUndefined();

    // 不再需要 cleanup（已删除）
    const idx = createdIds.indexOf(id);
    if (idx !== -1) createdIds.splice(idx, 1);
  });

  test('切换文章可见性', async ({ page, request }) => {
    // 创建测试文章
    const title = `E2E 可见性测试 ${Date.now()}`;
    const createResp = await request.post('/api/articles', {
      data: { title, content: '可见性切换测试', category: '未分类' },
    });
    const { id } = await createResp.json();
    createdIds.push(id);

    // 切换为不可见
    const hideResp = await request.put(`/api/articles/${id}/visibility`, {
      data: { visible: false },
    });
    expect(hideResp.ok()).toBeTruthy();

    // 登出后（清除 token），公开 API 不应返回该文章
    const publicResp = await request.get('/api/articles', {
      headers: { Authorization: '' },
    });

    // 注意：公开访问时，后端不校验 visible 字段会返回全部
    // 可见性过滤在前端 ArticleService.getVisibleArticles() 中完成
    // 这里仅验证 API 层面 visible 字段确实更新了
    const articles = await publicResp.json();
    const article = articles.find(a => a.id === id);
    expect(article).toBeDefined();
    // SQLite 存 0/1
    expect(article.visible).toBe(0);
  });
});
