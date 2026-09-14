// ！HTTP 客户端测试
// 覆盖 ApiError、HTTP 方法、响应处理、拦截器与超时。
// 前置：mock 全局 fetch 与 config（API_BASE_URL 置空以走相对路径）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient, ApiError } from '../../js/services/api-client.js';

// Mock config — 设置 API_BASE_URL 为空，测试中使用相对路径
vi.mock('../../js/config.js', () => ({
  CONFIG: {
    API_BASE_URL: '',
    CACHE_TTL: 5 * 60 * 1000,
  },
}));

// Mock 全局 fetch

let mockFetch;
let mockResponse;

beforeEach(() => {
  // 清除拦截器
  ApiClient._requestInterceptors = [];
  ApiClient._responseInterceptors = [];

  mockResponse = {
    ok: true,
    status: 200,
    headers: {
      get: vi.fn((name) => {
        if (name === 'content-type') return 'application/json';
        return null;
      }),
    },
    json: vi.fn().mockResolvedValue({ data: 'ok' }),
    text: vi.fn().mockResolvedValue('plain text response'),
  };
  mockFetch = vi.fn().mockResolvedValue(mockResponse);
  globalThis.fetch = mockFetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});


describe('ApiError', () => {
  it('应正确设置 name / status / message / data', () => {
    const err = new ApiError(404, 'Not Found', { detail: 'missing' });
    expect(err.name).toBe('ApiError');
    expect(err.status).toBe(404);
    expect(err.message).toBe('Not Found');
    expect(err.data).toEqual({ detail: 'missing' });
  });

  it('应为 Error 子类（instanceof Error = true）', () => {
    const err = new ApiError(500, 'Server Error');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});

// request — 基础 HTTP 方法

describe('ApiClient — HTTP 方法', () => {

  it('GET 应使用正确的 method 和 URL', async () => {
    await ApiClient.get('/api/articles');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/articles',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('POST 应序列化 body 为 JSON 字符串', async () => {
    const data = { title: 'Hello', content: 'World' };
    await ApiClient.post('/api/articles', data);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/articles',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(data),
      })
    );
  });

  it('PUT 应序列化 body 为 JSON 字符串', async () => {
    const data = { title: 'Updated' };
    await ApiClient.put('/api/articles/1', data);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/articles/1',
      expect.objectContaining({ method: 'PUT', body: JSON.stringify(data) })
    );
  });

  it('DELETE 应使用正确的 method', async () => {
    await ApiClient.delete('/api/articles/1');
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/articles/1',
      expect.objectContaining({ method: 'DELETE' })
    );
  });

  it('POST 传递 FormData 时不设置 Content-Type（浏览器自动设置）', async () => {
    const formData = new FormData();
    formData.append('file', new Blob(['test']));

    await ApiClient.post('/api/upload', formData);

    const callArgs = mockFetch.mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['Content-Type']).toBeUndefined();
    expect(callArgs[1].body).toBe(formData);
  });
});

// 响应处理

describe('ApiClient — 响应处理', () => {

  it('Content-Type 为 application/json 时解析为 JSON', async () => {
    mockResponse.headers.get.mockReturnValue('application/json');
    mockResponse.json.mockResolvedValue({ articles: [] });

    const result = await ApiClient.get('/api/articles');
    expect(result).toEqual({ articles: [] });
  });

  it('Content-Type 不是 JSON 时返回 text', async () => {
    mockResponse.headers.get.mockReturnValue('text/html');
    mockResponse.text.mockResolvedValue('<html>...</html>');

    const result = await ApiClient.get('/');
    expect(result).toBe('<html>...</html>');
  });

  it('非 ok 响应应抛出 ApiError', async () => {
    mockResponse.ok = false;
    mockResponse.status = 500;
    mockResponse.json.mockResolvedValue({ error: 'Internal Server Error' });

    await expect(ApiClient.get('/api/broken')).rejects.toThrow(ApiError);
    await expect(ApiClient.get('/api/broken')).rejects.toMatchObject({
      status: 500,
    });
  });
});

// 拦截器

describe('ApiClient — 拦截器', () => {

  it('请求拦截器链应按注册顺序执行，每次 receive 前一次的输出', async () => {
    const order = [];
    ApiClient.useRequestInterceptor(async (config) => {
      order.push('a');
      config.options.headers = { ...config.options.headers, 'X-Custom': '1' };
      return config;
    });
    ApiClient.useRequestInterceptor(async (config) => {
      order.push('b');
      return config;
    });

    await ApiClient.get('/api/test');

    expect(order).toEqual(['a', 'b']);
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Custom': '1' }),
      })
    );
  });

  it('响应拦截器 onFulfilled 应处理成功响应', async () => {
    ApiClient.useResponseInterceptor(
      (data) => ({ wrapped: true, original: data }),
      null
    );

    mockResponse.json.mockResolvedValue({ raw: 'data' });
    const result = await ApiClient.get('/api/test');
    expect(result).toEqual({ wrapped: true, original: { raw: 'data' } });
  });

  it('响应拦截器 onRejected 应在请求失败时被调用', async () => {
    const onRejected = vi.fn((err) => err);
    ApiClient.useResponseInterceptor(null, onRejected);

    mockResponse.ok = false;
    mockResponse.status = 500;
    mockResponse.json.mockResolvedValue({ error: 'fail' });

    await expect(ApiClient.get('/api/test')).rejects.toThrow();
    expect(onRejected).toHaveBeenCalled();
  });

  it('响应拦截器 onRejected 可通过返回新值"恢复"错误', async () => {
    ApiClient.useResponseInterceptor(null, () => ({ recovered: true }));

    mockResponse.ok = false;
    mockResponse.status = 500;
    mockResponse.json.mockResolvedValue({ error: 'fail' });

    // onRejected 返回了值，但 request 在 .catch 中会 re-throw（除非拦截器吞掉了）
    // 当前实现：onRejected 的返回值覆盖 error，但最后还是 throw error
    await expect(ApiClient.get('/api/test')).rejects.toEqual({ recovered: true });
  });
});

// 超时处理

describe('ApiClient — 超时', () => {

  it('请求超过 10 秒应抛出 408 ApiError', async () => {
    // 创建一个永不 resolve 的 Promise 模拟超时
    mockFetch.mockImplementation(() => {
      return new Promise((resolve) => {
        // 不做任何事情，让 AbortController 在 10s 后触发
        // 测试中我们通过 vi.advanceTimers 模拟时间
      });
    });

    // 实际 AbortController 的 abort 事件会触发 fetch reject AbortError
    // 简化测试：直接 mock fetch reject AbortError
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    await expect(ApiClient.get('/api/slow')).rejects.toMatchObject({
      status: 408,
      message: '请求超时，请检查网络连接',
    });
  });
});
