/**
 * 贴纸安全工具 — MIME 校验、SSRF 限制、SVG 清洗、CSS URL 转义。
 *
 * - MIME 校验拆分：同步 `validateDataUrlMimeType` 与可选异步 `fetchAndValidateMimeType`。
 * - `assertSafeStickerData` 仅同步，不发起任何网络请求。
 * - 普通 http/https URL 默认不触发 fetch，仅做同步白名单/语法检查。
 * - 异步校验遵守 SSRF 限制（禁止重定向、拒绝私网/元地址、超时）。
 *
 * @internal 仅供 js/business/sticker/security 内部使用，不对外导出。
 */
import {
  ALLOWED_IMAGE_PROTOCOLS,
  DATA_URL_MIME_TYPES,
  MAX_DATA_URL_LENGTH,
  SSRF_MAX_REDIRECTS,
  SSRF_REQUEST_TIMEOUT_MS,
  SVG_MIME_TYPE,
  SVG_ALLOWED_HREF_PROTOCOLS,
  SVG_FORBIDDEN_ATTR_PREFIXES,
  SVG_FORBIDDEN_PROTOCOLS,
  SVG_FORBIDDEN_TAGS,
  isBlockedIp,
} from './security-constants.js';

/**
 * 解析 data URL，返回 { mime, isBase64, data }；非法返回 null。
 * @param {string} src
 * @returns {{ mime: string, isBase64: boolean, data: string } | null}
 */
export function parseDataUrl(src) {
  if (typeof src !== 'string' || !src.startsWith('data:')) return null;
  const comma = src.indexOf(',');
  if (comma < 0) return null;
  const header = src.slice(5, comma);
  const data = src.slice(comma + 1);
  let mime = '';
  let isBase64 = false;
  const parts = header.split(';');
  if (parts[0]) mime = parts[0].toLowerCase();
  if (parts.includes('base64')) isBase64 = true;
  return { mime, isBase64, data };
}

/**
 * 同步校验 data URL 的 MIME 类型与长度（无任何网络请求）。
 * @param {string} src
 * @returns {boolean}
 */
export function validateDataUrlMimeType(src) {
  const parsed = parseDataUrl(src);
  if (!parsed) return false;
  if (src.length > MAX_DATA_URL_LENGTH) return false;
  return DATA_URL_MIME_TYPES.includes(parsed.mime);
}

/**
 * 从 URL 文本中提取主机名（不含端口）。
 * @param {URL} url
 * @returns {string}
 */
function extractHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

/**
 * 判断 URL 是否命中 SSRF 拦截规则（基于字面 IP/特殊地址，最佳努力）。
 * @param {URL} url
 * @returns {string | null} 返回拦截原因，null 表示未拦截
 */
function checkSsrfLiteral(url) {
  const hostname = extractHostname(url);
  // 特殊地址（云元数据、保留主机名）
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return 'blocked-metadata-address';
  }
  // 字面 IP：直接按前缀判断
  if (/^[0-9.]+$/.test(hostname)) {
    if (isBlockedIp(hostname)) return 'blocked-private-ip';
  }
  // IPv6 字面量
  if (hostname.includes(':')) {
    if (isBlockedIp(hostname)) return 'blocked-private-ipv6';
  }
  return null;
}

/**
 * 异步校验 http/https 资源的 MIME 类型（遵守 SSRF 限制）。
 *
 * 注意：前端无法完全阻止 DNS rebinding，私有 IP 拦截为最佳努力；
 * 默认不自动跟随重定向，拒绝私网/元地址，设置超时。
 *
 * @param {string} src - 贴纸资源地址（http/https）
 * @param {{ timeoutMs?: number, fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<boolean>}
 */
export async function fetchAndValidateMimeType(src, options = {}) {
  const allowFetch = options.allowFetch === true;
  const timeoutMs = options.timeoutMs ?? SSRF_REQUEST_TIMEOUT_MS;

  let url;
  try {
    url = new URL(src);
  } catch {
    return false;
  }

  if (url.protocol === 'data:') {
    return validateDataUrlMimeType(src);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;

  // 默认不发起任何网络请求：仅做同步协议/语法检查（http/https 视为语法通过）
  if (!allowFetch) return true;

  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetchAndValidateMimeType: 当前环境不支持 fetch');
  }

  const ssrfReason = checkSsrfLiteral(url);
  if (ssrfReason) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url.toString(), {
      redirect: SSRF_MAX_REDIRECTS === 0 ? 'manual' : 'follow',
      signal: controller.signal,
    });
    if (res.type === 'opaqueredirect') return false; // 重定向被拒绝
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return contentType === '' || DATA_URL_MIME_TYPES.includes(contentType);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 同步安全断言；不发起任何网络请求。
 *
 * 校验：协议白名单、data URL MIME 白名单、危险协议拒绝。
 * 普通 http/https URL 仅做协议与语法检查，不触发 fetch。
 *
 * @param {unknown} data - 待校验的贴纸数据（含 src）
 * @returns {boolean}
 * @throws {Error} 数据不安全时抛出异常
 */
export function assertSafeStickerData(data) {
  const src = data && typeof data === 'object' ? data.src : data;
  if (typeof src !== 'string' || src.length === 0) {
    throw new Error('Sticker security: src 不能为空');
  }

  let url;
  try {
    url = new URL(src);
  } catch {
    // 兼容同源相对路径（如 /api/decos/...）与协议相对路径（//host/...）
    // 浏览器中 new URL('/api/x') 通常可解析，但某些环境（jsdom/无 base）会失败；
    // 统一用占位 origin 解析，仅用于协议白名单校验。
    if (typeof src === 'string' && (src.startsWith('/') || src.startsWith('//'))) {
      try {
        url = new URL(src, 'http://sticker-local.invalid');
      } catch {
        throw new Error('Sticker security: src 不是合法 URL');
      }
    } else {
      throw new Error('Sticker security: src 不是合法 URL');
    }
  }

  if (!ALLOWED_IMAGE_PROTOCOLS.includes(url.protocol)) {
    throw new Error(`Sticker security: 不支持的协议 ${url.protocol}`);
  }

  // 拒绝危险协议（即使在 data: 下）
  if (SVG_FORBIDDEN_PROTOCOLS.some((p) => src.toLowerCase().startsWith(p))) {
    throw new Error('Sticker security: 危险协议被拒绝');
  }

  if (url.protocol === 'data:') {
    if (!validateDataUrlMimeType(src)) {
      throw new Error('Sticker security: data URL MIME 不在白名单或超长');
    }
  }

  return true;
}

/**
 * 从序列化的 SVG 字符串中去除危险元素/属性/协议。
 *
 * 默认使用 DOMParser 解析并按黑名单清洗；若 DOMParser 不可用则返回空串（拒绝）。
 * 可选用 DOMPurify 作为后端（options.backend），后端需提供 sanitize(input) 接口。
 *
 * @param {string} svg - SVG 字符串
 * @param {{ backend?: { sanitize: (input: string) => string } }} [options]
 * @returns {string} 清洗后的 SVG；非法输入返回 ''
 */
export function sanitizeSvg(svg, options = {}) {
  if (typeof svg !== 'string' || !svg.trim()) return '';
  if (options.backend && typeof options.backend.sanitize === 'function') {
    return options.backend.sanitize(svg) || '';
  }

  if (typeof DOMParser === 'undefined') return '';

  let doc;
  try {
    doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  } catch {
    return '';
  }

  // DOMParser 解析 XML 错误时会生成 <parsererror>
  if (doc.querySelector('parsererror')) return '';

  const root = doc.documentElement;

  // 移除禁止元素
  root.querySelectorAll('*').forEach((node) => {
    const tag = node.tagName ? node.tagName.toLowerCase() : '';
    if (SVG_FORBIDDEN_TAGS.includes(tag)) {
      node.parentNode && node.parentNode.removeChild(node);
    }
  });

  // 移除禁止属性与危险 href/xlink:href
  root.querySelectorAll('*').forEach((node) => {
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value.toLowerCase();
      if (SVG_FORBIDDEN_ATTR_PREFIXES.some((p) => name.startsWith(p))) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'href' || name === 'xlink:href') {
        if (SVG_FORBIDDEN_PROTOCOLS.some((p) => value.startsWith(p))) {
          node.removeAttribute(attr.name);
          return;
        }
        // 协议白名单校验：非 # 开头且协议不在白名单 → 移除
        if (!value.startsWith('#')) {
          const colon = value.indexOf(':');
          if (colon >= 0) {
            const proto = value.slice(0, colon + 1);
            if (!SVG_ALLOWED_HREF_PROTOCOLS.includes(proto)) {
              node.removeAttribute(attr.name);
            }
          }
        }
      }
    });
  });

  // 移除指向外部资源的 <use>
  root.querySelectorAll('use').forEach((node) => {
    const href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
    if (href && !href.startsWith('#')) {
      node.parentNode && node.parentNode.removeChild(node);
    }
  });

  // 移除外联 <style>（内部 #id 引用保留，外链 url(...) 移除）
  root.querySelectorAll('style').forEach((node) => {
    node.textContent = (node.textContent || '').replace(/url\(\s*["']?(?!\s*#)[^)"']+["']?\s*\)/gi, '');
  });

  return new XMLSerializer().serializeToString(root);
}

/**
 * 清洗 SVG data URL：解码 → sanitizeSvg → 重新编码。
 * 非 SVG data URL 原样返回；清洗结果为空时返回 ''（拒绝）。
 * @param {string} src - data:image/svg+xml;base64,... 或 ;utf8,...
 * @returns {string} 清洗后的 data URL；非法/清洗失败返回 ''
 */
export function sanitizeSvgDataUrl(src) {
  const parsed = parseDataUrl(src);
  if (!parsed || parsed.mime !== SVG_MIME_TYPE) return src;

  let svg;
  try {
    svg = parsed.isBase64 ? atob(parsed.data) : decodeURIComponent(parsed.data);
  } catch {
    return '';
  }
  const clean = sanitizeSvg(svg);
  if (!clean) return '';

  try {
    if (parsed.isBase64) {
      return `data:${parsed.mime};base64,${btoa(clean)}`;
    }
    return `data:${parsed.mime},${encodeURIComponent(clean)}`;
  } catch {
    return '';
  }
}

/**
 * 转义 CSS url(...) token 中的特殊字符，防止 CSS 注入。
 *
 * 已存在的合法百分号编码（%xx）不会二次转义。
 * 输出始终建议配合引号使用：url("<escaped>")。
 *
 * @param {string} url
 * @returns {string}
 */
export function escapeCssUrl(url) {
  if (typeof url !== 'string') return '';
  const hex = '0123456789ABCDEF';
  let out = '';
  for (let i = 0; i < url.length; i++) {
    const ch = url[i];
    // 保留合法百分号编码
    if (
      ch === '%' &&
      i + 2 < url.length + 1 &&
      /^[0-9a-fA-F]{2}$/.test(url.slice(i + 1, i + 3))
    ) {
      out += url.slice(i, i + 3);
      i += 2;
      continue;
    }
    const code = url.charCodeAt(i);
    // 控制字符与空白、引号、反斜杠、括号等一律百分号编码
    if (
      code < 0x20 ||
      code === 0x7f ||
      ch === '"' ||
      ch === "'" ||
      ch === '\\' ||
      ch === '(' ||
      ch === ')' ||
      ch === ' ' ||
      ch === '\n' ||
      ch === '\r' ||
      ch === '\t'
    ) {
      out += '%' + hex[(code >> 4) & 0xf] + hex[code & 0xf];
    } else {
      out += ch;
    }
  }
  return out;
}
