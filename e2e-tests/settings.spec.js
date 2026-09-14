// ！站点设置 E2E 测试
// 覆盖设置的修改、读取与持久化，以及未授权访问应返回 401；前置：依赖 auth.setup.js 注入登录态。

import { test, expect } from '@playwright/test';

test.use({ storageState: '.auth/user.json' });

const originalSettings = {};
const modifiedKeys = [];

test.beforeAll(async ({ request }) => {
  // 保存原始设置值，用于恢复
  const resp = await request.get('/api/settings');
  if (resp.ok()) {
    const settings = await resp.json();
    Object.assign(originalSettings, settings);
  }
});

test.afterAll(async ({ request }) => {
  // 恢复被修改的原始设置值
  if (modifiedKeys.length > 0) {
    const restore = {};
    for (const key of modifiedKeys) {
      if (originalSettings[key] !== undefined) {
        restore[key] = originalSettings[key];
      }
    }
    if (Object.keys(restore).length > 0) {
      await request.put('/api/settings', { data: restore });
    }
  }
});

test.describe('站点设置', () => {

  test('读取站点设置', async ({ request }) => {
    const resp = await request.get('/api/settings');
    expect(resp.ok()).toBeTruthy();

    const settings = await resp.json();
    expect(typeof settings).toBe('object');
  });

  test('修改站点设置', async ({ request }) => {
    const testKey = 'e2e_test_key';
    const testValue = `test_value_${Date.now()}`;

    const resp = await request.put('/api/settings', {
      data: { [testKey]: testValue },
    });

    expect(resp.ok()).toBeTruthy();

    // 验证设置已持久化
    const getResp = await request.get('/api/settings');
    const settings = await getResp.json();
    expect(settings[testKey]).toBe(testValue);

    // 记录需恢复的键
    modifiedKeys.push(testKey);
  });

  test('未登录不能修改设置', async ({ request }) => {
    // 创建一个不带 Authorization 头的请求上下文
    const resp = await request.put('/api/settings', {
      data: { unauthorized_key: 'should_fail' },
      headers: { Authorization: '' },
    });

    // 应该返回 401
    expect(resp.status()).toBe(401);
  });
});
