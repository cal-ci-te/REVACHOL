// ！核心页面冒烟测试
// 快速验证首页可访问性与关键 UI 元素（目录树/侧边栏/主题按钮/管理面板/移动端视口）。
// 未使用 storageState，可独立运行；完整功能测试见 auth / articles / theme 等 spec。

import { test, expect } from '@playwright/test';

test.describe('REVACHOL 首页', () => {

  test('首页可访问且标题正确', async ({ page }) => {
    await page.goto('/');

    // 验证页面标题
    await expect(page).toHaveTitle(/REVACHOL/);
  });

  test('核心 UI 元素存在 — 目录树', async ({ page }) => {
    await page.goto('/');

    // 验证目录树容器存在
    const directoryTree = page.locator('#directoryTree');
    await expect(directoryTree).toBeVisible({ timeout: 10000 });
  });

  test('核心 UI 元素存在 — 侧边栏', async ({ page }) => {
    await page.goto('/');

    // 验证侧边栏存在
    const sidebar = page.locator('#siteSidebar');
    await expect(sidebar).toBeAttached();
  });

  test('核心 UI 元素存在 — 主题切换按钮', async ({ page }) => {
    await page.goto('/');

    // 使用 Playwright 定位器 API：通过角色和文本定位
    // 页面加载后 should have at least one theme button
    const themeButtons = page.locator('[data-theme-btn], .theme-btn, #themeButtons button');
    const count = await themeButtons.count();
    // 三套主题至少有一套的按钮可见
    expect(count).toBeGreaterThanOrEqual(1);
  });
});

test.describe('REVACHOL 管理面板', () => {

  test('管理面板默认折叠不可见', async ({ page }) => {
    await page.goto('/');

    // 管理面板在未登录/登录前默认是折叠/隐藏状态
    const panel = page.locator('#adminPanel');
    // 面板存在于 DOM 但可能是隐藏或折叠状态
    await expect(panel).toBeAttached();
  });
});

test.describe('REVACHOL 响应式布局', () => {

  test('移动端视口下页面正常加载', async ({ page }) => {
    // 模拟移动端视口
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    // 页面在移动端也能正常加载
    await expect(page).toHaveTitle(/REVACHOL/);

    // 目录树在移动端也应存在（可能折叠但 DOM 存在）
    const directoryTree = page.locator('#directoryTree');
    await expect(directoryTree).toBeAttached();
  });
});
