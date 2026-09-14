// ！贴纸 E2E 测试
// 覆盖贴纸上传/位置更新/删除与公开列表接口；前置：依赖 auth.setup.js 注入登录态。

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';
import path from 'path';

test.use({ storageState: '.auth/user.json' });

const createdDecoIds = [];

test.afterAll(async ({ request }) => {
  for (const id of createdDecoIds) {
    try { await request.delete(`/api/decos/${id}`); } catch {
      // 清理失败可忽略：贴纸可能已被手动删除
    }
  }
});

test.describe('贴纸管理', () => {

  test('获取贴纸列表（公开接口）', async ({ request }) => {
    // GET /api/decos 无需登录
    const resp = await request.get('/api/decos');
    expect(resp.ok()).toBeTruthy();

    const decos = await resp.json();
    expect(Array.isArray(decos)).toBe(true);
  });

  test('上传贴纸', async ({ request }) => {
    // 生成一个 1×1 的粉色像素 WebP 作为最小测试图片
    // WebP 32×32 纯色图 base64（最小有效 WebP）
    const miniWebPBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vpMGAA=';

    const resp = await request.post('/api/decos', {
      data: {
        name: `E2E 测试贴纸 ${Date.now()}`,
        image: `data:image/webp;base64,${miniWebPBase64}`,
      },
    });

    expect(resp.ok()).toBeTruthy();
    const body = await resp.json();
    expect(body.id).toBeDefined();
    createdDecoIds.push(body.id);
  });

  test('更新贴纸位置', async ({ request }) => {
    // 先上传一个
    const miniWebPBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vpMGAA=';
    const createResp = await request.post('/api/decos', {
      data: {
        name: `E2E 位置测试 ${Date.now()}`,
        image: `data:image/webp;base64,${miniWebPBase64}`,
      },
    });
    const { id } = await createResp.json();
    createdDecoIds.push(id);

    // 更新位置
    const newPosition = { top: '100px', left: '200px' };
    const updateResp = await request.put(`/api/decos/${id}`, {
      data: { position: newPosition },
    });
    expect(updateResp.ok()).toBeTruthy();

    // 验证更新结果
    const getResp = await request.get('/api/decos');
    const decos = await getResp.json();
    const updated = decos.find(d => d.id === id);
    expect(updated).toBeDefined();
    expect(updated.position).toEqual(newPosition);
  });

  test('删除贴纸', async ({ request }) => {
    // 上传一个
    const miniWebPBase64 = 'UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAgA0JaQAA3AA/vpMGAA=';
    const createResp = await request.post('/api/decos', {
      data: {
        name: `E2E 删除测试 ${Date.now()}`,
        image: `data:image/webp;base64,${miniWebPBase64}`,
      },
    });
    const { id } = await createResp.json();

    // 删除
    const deleteResp = await request.delete(`/api/decos/${id}`);
    expect(deleteResp.ok()).toBeTruthy();

    // 确认已删除
    const getResp = await request.get('/api/decos');
    const decos = await getResp.json();
    expect(decos.find(d => d.id === id)).toBeUndefined();
  });
});
