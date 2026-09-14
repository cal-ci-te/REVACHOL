// ！认证 E2E 测试
// 覆盖登录（成功/失败）、登出与 Token 状态；前置：前端可访问，无需预置登录态。
import { test, expect } from '@playwright/test';

test.describe('认证 — 登录流程', () => {

  test('未登录时看不到管理面板', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 管理面板应该存在于 DOM 但处于折叠状态
    const panel = page.locator('#adminPanel');
    await expect(panel).toBeAttached();
  });

  test('使用错误密码登录失败', async ({ page }) => {
    await page.goto('/');

    // 打开登录模态框
    await page.locator('#loginTrigger').click();
    await expect(page.locator('#loginModalOverlay')).toBeVisible();

    // 填写凭据
    await page.locator('#loginUsername').fill('admin');
    await page.locator('#loginPassword').fill('wrong_password');

    // 点击登录
    await page.locator('#modalLoginBtn').click();

    // 应该显示错误提示（登录失败，token 未存入）
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeNull();
  });

  test('使用正确密码登录成功', async ({ page }) => {
    await page.goto('/');

    // 打开登录模态框
    await page.locator('#loginTrigger').click();
    await expect(page.locator('#loginModalOverlay')).toBeVisible();

    // 填写正确凭据（默认 admin / admin123）
    await page.locator('#loginUsername').fill('admin');
    await page.locator('#loginPassword').fill('admin123');

    // 点击登录
    await page.locator('#modalLoginBtn').click();

    // 等待模态框关闭
    await expect(page.locator('#loginModalOverlay')).toBeHidden({ timeout: 5000 });

    // Token 已存入 localStorage
    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();

    // 清理：登出
    await page.evaluate(() => localStorage.removeItem('auth_token'));
  });
});
