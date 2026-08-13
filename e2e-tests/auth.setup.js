// 登录态 Setup 项目 — 通过 API 直接获取 Token，存入 storageState
// 其他测试项目通过 dependencies: ['setup'] 继承此登录态，避免重复登录
// 后端默认管理员密码：admin / admin123（通过 ADMIN_PASSWORD 环境变量注入）

import { test as setup, expect } from '@playwright/test';
import path from 'path';

// 统一写入 CWD 下的 .auth/user.json（Docker 容器中 CWD=/app → /app/.auth/user.json），
// 与配置中的 storageState 路径保持一致（storageState 相对 CWD 解析）
const AUTH_FILE = path.join(process.cwd(), '.auth', 'user.json');

setup('管理员登录并保存状态', async ({ request, page }) => {
  // 通过 API 直接登录（绕过 UI 模态框，更快更稳定）
  const resp = await request.post('/api/auth/login', {
    data: {
      username: 'admin',
      password: 'admin123',
    },
  });

  expect(resp.ok()).toBeTruthy();
  const body = await resp.json();
  expect(body.token).toBeDefined();
  expect(body.role).toBe('admin');

  // 将 Token 写入页面 localStorage，使前端识别为已登录
  await page.goto('/');
  await page.evaluate((token) => {
    localStorage.setItem('auth_token', token);
    // 清理旧版标记
    localStorage.removeItem('admin_logged_in');
  }, body.token);

  // 刷新页面使 localStorage 生效，前端 AppState 会读取 auth_token 并设为已登录
  await page.reload();
  await page.waitForLoadState('networkidle');

  // 确认管理面板已可见（登录成功标记）
  const panel = page.locator('#adminPanel');
  await expect(panel).toBeAttached({ timeout: 10000 });

  // 保存 storageState（cookie + localStorage）
  await page.context().storageState({ path: AUTH_FILE });
});
