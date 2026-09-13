// ！HTTP API 客户端
// 统一 fetch 封装：请求/响应拦截器链、10s 自动超时、JSON/FormData 自动处理。
// 选择自研而非 Axios：项目仅约 10 个 API 端点，Axios（≈30KB）的拦截器/取消/进度等能力在此场景均冗余；
// 保留拦截器模式以兼容未来切换为 Axios 的接口形态。

import { CONFIG } from '../config.js';

// 提取可读的错误信息
// 按优先级匹配：后端 error 字段 → 通用 message 字段 → 纯文本 → 对象序列化 → 状态码友好信息 → 兜底
function extractErrorMessage(data, status) {
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }
  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }
  if (typeof data === 'string') {
    return data;
  }
  if (data && typeof data === 'object') {
    return JSON.stringify(data);
  }
  // 对象无标准字段时按状态码给出可读文案，优于裸露 HTTP 码
  const statusMessages = {
    400: '请求参数有误',
    401: '登录已过期，请重新登录',
    403: '没有权限执行此操作',
    404: '请求的资源不存在',
    408: '请求超时，请重试',
    409: '数据冲突，请刷新后重试',
    429: '请求过于频繁，请稍后重试',
    500: '服务器内部错误，请稍后重试',
    502: '服务暂不可用，请稍后重试',
    503: '服务正在维护中，请稍后重试',
  };
  if (statusMessages[status]) {
    return statusMessages[status];
  }
  return String(data || `HTTP ${status}`);
}

export class ApiError extends Error {
  constructor(status, message, data = null) {
    // 归一化为字符串：error 字段可能为对象，直接给 super 会产生 "[object Object]"
    const safeMessage = typeof message === 'string' ? message : String(message);
    super(safeMessage);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code || null;
  }

  // 判断是否为认证错误
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  // 判断是否可重试
  // 超时、限流、服务端错误可重试；4xx 参数类错误重试无意义
  isRetryable() {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export const ApiClient = {
  _requestInterceptors: [],
  _responseInterceptors: [],

  // 注册请求拦截器
  useRequestInterceptor(handler) { this._requestInterceptors.push(handler); },
  // 注册响应拦截器
  useResponseInterceptor(onFulfilled, onRejected) { this._responseInterceptors.push({ onFulfilled, onRejected }); },

  // 发起请求
  async request(endpoint, options = {}) {
    let config = { endpoint, options };
    for (const interceptor of this._requestInterceptors) { config = await interceptor(config); }

    const { endpoint: finalEndpoint, options: finalOptions } = config;
    const url = (CONFIG.API_BASE_URL || '') + finalEndpoint;

    const headers = { 'Content-Type': 'application/json', ...finalOptions.headers };
    // FormData 需由浏览器自带 boundary，手写 Content-Type 会导致后端解析失败
    if (finalOptions.body instanceof FormData) delete headers['Content-Type'];

    // timeout 为本封装的扩展项，需在使用前从传给 fetch 的选项中剔除，避免非法参数
    const timeout = typeof finalOptions.timeout === 'number' ? finalOptions.timeout : 10000;
    const fetchOptions = { ...finalOptions };
    delete fetchOptions.timeout;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, { credentials: 'include', ...fetchOptions, headers, signal: controller.signal });
      clearTimeout(timeoutId);
      let data = (response.headers.get('content-type') || '').includes('application/json')
        ? await response.json() : await response.text();
      if (!response.ok) {
        const message = extractErrorMessage(data, response.status);
        throw new ApiError(response.status, message, data);
      }

      for (const interceptor of this._responseInterceptors) {
        if (interceptor.onFulfilled) data = await interceptor.onFulfilled(data, response);
      }
      return data;
    } catch (caughtError) {
      // 超时同样走 reject 链：统一转成 408 ApiError，调用方无需区分 AbortError
      clearTimeout(timeoutId);
      let error = caughtError;
      if (error.name === 'AbortError') {
        error = new ApiError(408, '请求超时，请检查网络连接');
      }
      for (const interceptor of this._responseInterceptors) {
        if (interceptor.onRejected) error = await interceptor.onRejected(error);
      }
      throw error;
    }
  },

  get(endpoint, options = {}) { return this.request(endpoint, { ...options, method: 'GET' }); },
  post(endpoint, data, options = {}) {
    // FormData 直接透传；其余类型序列化为 JSON 字符串
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request(endpoint, { ...options, method: 'POST', body });
  },
  put(endpoint, data, options = {}) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request(endpoint, { ...options, method: 'PUT', body });
  },
  delete(endpoint, options = {}) { return this.request(endpoint, { ...options, method: 'DELETE' }); },
};
