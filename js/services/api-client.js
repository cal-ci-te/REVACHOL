// HTTP API 客户端。支持请求/响应拦截器链，自动超时（10s），JSON/FormData 自动处理。
// 选择自研 fetch 封装而非 Axios：项目仅 ~10 个 API 端点，Axios (~30KB) 的拦截器/取消/进度等功能
// 在此项目场景中均为冗余。拦截器模式保留了未来切换为 Axios 的接口兼容性。
import { CONFIG } from '../config.js';

/**
 * 从响应体中提取可读的错误信息
 * 按优先级匹配：后端 error 字段 → 通用 message 字段 → 纯文本 → 状态码友好信息 → 兜底
 */
function extractErrorMessage(data, status) {
  // 1. REVACHOL 后端标准格式 { error: '...' }
  if (data?.error && typeof data.error === 'string') {
    return data.error;
  }
  // 2. 通用 API 格式 { message: '...' }（兼容第三方）
  if (data?.message && typeof data.message === 'string') {
    return data.message;
  }
  // 3. 纯文本响应
  if (typeof data === 'string') {
    return data;
  }
  // 4. 对象但无标准字段 → 序列化为 JSON 字符串
  if (data && typeof data === 'object') {
    return JSON.stringify(data);
  }
  // 5. 根据状态码生成友好信息
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
  // 6. 绝对兜底：null/undefined/非标准对象 → 转为字符串
  return String(data || `HTTP ${status}`);
}

export class ApiError extends Error {
  constructor(status, message, data = null) {
    // 确保 message 始终是字符串
    const safeMessage = typeof message === 'string' ? message : String(message);
    super(safeMessage);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.code = data?.code || null;
  }

  /** 是否为认证错误（需重新登录） */
  isAuthError() {
    return this.status === 401 || this.status === 403;
  }

  /** 是否为可重试错误（网络超时 / 服务器繁忙） */
  isRetryable() {
    return this.status === 408 || this.status === 429 || this.status >= 500;
  }
}

export const ApiClient = {
  _requestInterceptors: [],
  _responseInterceptors: [],

  useRequestInterceptor(handler) { this._requestInterceptors.push(handler); },
  useResponseInterceptor(onFulfilled, onRejected) { this._responseInterceptors.push({ onFulfilled, onRejected }); },

  async request(endpoint, options = {}) {
    let config = { endpoint, options };
    for (const interceptor of this._requestInterceptors) { config = await interceptor(config); }

    const { endpoint: finalEndpoint, options: finalOptions } = config;
    const url = (CONFIG.API_BASE_URL || '') + finalEndpoint;

    const headers = { 'Content-Type': 'application/json', ...finalOptions.headers };
    if (finalOptions.body instanceof FormData) delete headers['Content-Type'];

    // 支持可选超时：options.timeout（毫秒），默认保持 10s；从传给 fetch 的选项中剔除
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
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request(endpoint, { ...options, method: 'POST', body });
  },
  put(endpoint, data, options = {}) {
    const body = data instanceof FormData ? data : JSON.stringify(data);
    return this.request(endpoint, { ...options, method: 'PUT', body });
  },
  delete(endpoint, options = {}) { return this.request(endpoint, { ...options, method: 'DELETE' }); },
};
