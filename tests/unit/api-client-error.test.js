// ！ApiClient 错误处理测试
// 覆盖错误信息提取、ApiError 辅助方法与边界情况；前置：mock js/services/api-client.js。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError } from '../../js/services/api-client.js';

describe('ApiClient 错误处理', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
    ApiClient._requestInterceptors = [];
    ApiClient._responseInterceptors = [];
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // 错误信息提取
  describe('错误信息提取', () => {

    it('应正确提取后端 { error: "..." } 格式', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Token 已过期' }),
      });

      try {
        await ApiClient.get('/api/articles');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.message).toBe('Token 已过期');
        expect(err.status).toBe(401);
      }
    });

    it('应正确提取 { message: "..." } 格式（兼容性）', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => ({ message: '文章不存在' }),
      });

      try {
        await ApiClient.get('/api/articles/999');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('文章不存在');
      }
    });

    it('应正确处理纯文本错误响应', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'text/plain' },
        text: async () => 'Internal Server Error',
        json: async () => { throw new Error('Invalid JSON'); },
      });

      try {
        await ApiClient.get('/api/articles');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('Internal Server Error');
      }
    });

    it('应在无响应体且 408 时使用友好信息', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 408,
        headers: { get: () => 'application/json' },
        json: async () => null,
      });

      try {
        await ApiClient.get('/api/articles');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('请求超时，请重试');
      }
    });

    it('应在无响应体 404 时使用友好信息', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: { get: () => 'application/json' },
        json: async () => null,
      });

      try {
        await ApiClient.get('/api/missing');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('请求的资源不存在');
      }
    });

    it('应处理网络层面的错误', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      try {
        await ApiClient.get('/api/articles');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('Network error');
      }
    });

    it('应处理 AbortError 为 408 超时', async () => {
      global.fetch = vi.fn().mockRejectedValue(
        Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
      );

      try {
        await ApiClient.get('/api/slow');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiError);
        expect(err.status).toBe(408);
        expect(err.message).toBe('请求超时，请检查网络连接');
      }
    });
  });

  // ApiError 辅助方法
  describe('ApiError 辅助方法', () => {

    it('isAuthError() — 401 和 403 应返回 true', async () => {
      for (const status of [401, 403]) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: 'Auth error' }),
        });

        try {
          await ApiClient.get('/api/test');
          throw new Error('应该抛出错误');
        } catch (err) {
          expect(err.isAuthError()).toBe(true);
          expect(err.isRetryable()).toBe(false);
        }
      }
    });

    it('isRetryable() — 408/429/5xx 应返回 true', async () => {
      for (const status of [408, 429, 500, 502, 503]) {
        global.fetch = vi.fn().mockResolvedValue({
          ok: false,
          status,
          headers: { get: () => 'application/json' },
          json: async () => ({ error: 'Server error' }),
        });

        try {
          await ApiClient.get('/api/test');
          throw new Error('应该抛出错误');
        } catch (err) {
          expect(err.isRetryable()).toBe(true);
        }
      }
    });

    it('400 不应标记为 auth error 也不应标记为 retryable', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: 'Bad request' }),
      });

      try {
        await ApiClient.get('/api/test');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.isAuthError()).toBe(false);
        expect(err.isRetryable()).toBe(false);
      }
    });
  });

  // 边界情况
  describe('边界情况', () => {

    it('data 是数组时应序列化为 JSON 字符串', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        headers: { get: () => 'application/json' },
        json: async () => ({ errors: ['标题不能为空', '内容不能为空'] }),
      });

      try {
        await ApiClient.get('/api/articles');
        throw new Error('应该抛出错误');
      } catch (err) {
        // 无 error 或 message 字段 → 回退到 JSON.stringify(data)
        expect(err.message).toBe('{"errors":["标题不能为空","内容不能为空"]}');
      }
    });

    it('非标准状态码也正确提取 error 字段', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 418,
        headers: { get: () => 'application/json' },
        json: async () => ({ error: "I'm a teapot" }),
      });

      try {
        await ApiClient.get('/api/coffee');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe("I'm a teapot");
        expect(err.status).toBe(418);
      }
    });

    it('后端 error 优先于 message（两者同时存在时）', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        headers: { get: () => 'application/json' },
        json: async () => ({
          error: '后端错误详情',
          message: '通用错误',
        }),
      });

      try {
        await ApiClient.get('/api/test');
        throw new Error('应该抛出错误');
      } catch (err) {
        expect(err.message).toBe('后端错误详情');
      }
    });
  });
});
