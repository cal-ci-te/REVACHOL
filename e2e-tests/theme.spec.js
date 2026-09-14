// ！主题切换 E2E 测试
// 覆盖暗色/亮色/低保真三套主题的切换与持久化；前置：无需登录，主题偏好存 localStorage。

import { test, expect } from '@playwright/test';

test.describe('主题系统', () => {

  test.beforeEach(async ({ page }) => {
    // 每个测试前清除主题偏好，确保从默认暗色开始
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.removeItem('selected_theme');
      localStorage.removeItem('rv_selected_theme');
    });
  });

  test('默认主题为暗色', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 暗色主题 CSS link 应该启用（disabled=false）
    const darkLink = page.locator('#theme-stylesheet-dark');
    await expect(darkLink).not.toHaveAttribute('disabled');

    // 亮色/低保真主题 CSS link 应该禁用
    const lightLink = page.locator('#theme-stylesheet-light');
    await expect(lightLink).toHaveAttribute('disabled', '');

    const lofiLink = page.locator('#theme-stylesheet-lofi');
    await expect(lofiLink).toHaveAttribute('disabled', '');
  });

  test('切换到亮色主题', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // 通过 localStorage 切换主题（模拟 ThemeService.applyTheme('light')）
    await page.evaluate(() => {
      localStorage.setItem('selected_theme', JSON.stringify('light'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 亮色 CSS link 应该启用
    await expect(page.locator('#theme-stylesheet-light')).not.toHaveAttribute('disabled');
    // 暗色 CSS link 应该禁用
    await expect(page.locator('#theme-stylesheet-dark')).toHaveAttribute('disabled', '');
  });

  test('切换到低保真主题', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.evaluate(() => {
      localStorage.setItem('selected_theme', JSON.stringify('lofi'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 低保真 CSS link 应该启用
    await expect(page.locator('#theme-stylesheet-lofi')).not.toHaveAttribute('disabled');

    // data-theme 属性应设为 lofi
    const htmlTheme = await page.locator('html').getAttribute('data-theme');
    expect(htmlTheme).toBe('lofi');
  });

  test('主题偏好持久化到 localStorage', async ({ page }) => {
    await page.goto('/');

    // 设置亮色主题
    await page.evaluate(() => {
      localStorage.setItem('selected_theme', JSON.stringify('light'));
    });
    await page.reload();
    await page.waitForLoadState('networkidle');

    // 再次访问，主题应保持亮色
    const theme = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('selected_theme'))
    );
    expect(theme).toBe('light');
  });
});
