// ！贴纸安全工具
// MIME 校验、SSRF 限制、SVG 清洗、CSS URL 转义。
// MIME 校验拆同步与异步两条路径：assertSafeStickerData 与普通 http/https URL 默认不发起网络请求，仅做同步白名单/语法检查；
// 只有显式 allowFetch 的异步校验才受 SSRF 约束（禁止重定向、拒绝私网/元地址、超时）。
// 内部模块，不对外导出。
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

// 解析 data URL
// 手工切分 header 而不依赖 URL 解析：data URL 内容可能极长且含特殊字符，URL 构造易抛错
// 非法（非字符串、缺 data: 前缀、缺逗号）返回 null，交由调用方决定拒绝或放行
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

// 同步校验 data URL 的 MIME 类型与长度
// 全程无网络请求：可在渲染前安全调用，不会引入 IO 延迟或外部依赖
export function validateDataUrlMimeType(src) {
  const parsed = parseDataUrl(src);
  if (!parsed) return false;
  if (src.length > MAX_DATA_URL_LENGTH) return false;
  return DATA_URL_MIME_TYPES.includes(parsed.mime);
}

// 从 URL 文本中提取主机名（不含端口）
// 剥掉 IPv6 字面量的方括号：`[::1]` 与 `::1` 需归一为同一形式才能命中前缀黑名单
function extractHostname(url) {
  return url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
}

// 判断 URL 是否命中 SSRF 拦截规则
// 只做字面量判断，不解 DNS：前端无法完全阻止 DNS rebinding，故拦截为最佳努力而非保证
// 返回拦截原因字符串，null 表示未拦截（便于上层记录，也避免与 false 混淆）
function checkSsrfLiteral(url) {
  const hostname = extractHostname(url);
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return 'blocked-metadata-address';
  }
  if (/^[0-9.]+$/.test(hostname)) {
    if (isBlockedIp(hostname)) return 'blocked-private-ip';
  }
  if (hostname.includes(':')) {
    if (isBlockedIp(hostname)) return 'blocked-private-ipv6';
  }
  return null;
}

// 异步校验 http/https 资源的 MIME 类型（遵守 SSRF 限制）
// 默认不发请求：allowFetch 未显式为 true 时，http/https 仅视为语法通过，
// 避免渲染路径意外触发外部请求（隐私与性能）
// 重定向策略由 SSRF_MAX_REDIRECTS 派生：为 0 时用 manual，靠 opaqueredirect 识别并拒绝跳转
// 超时兜底防止挂起的请求占住校验流程；异常与超时统一返回 false，不向上抛
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
    if (res.type === 'opaqueredirect') return false;
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    return contentType === '' || DATA_URL_MIME_TYPES.includes(contentType);
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// 同步安全断言（不发起任何网络请求）
// 校验协议白名单、data URL MIME 白名单与危险协议；普通 http/https 只做协议与语法检查
// 不安全时抛错而非返回 false：调用方若漏判返回值就会渲染未校验内容，抛错无法被忽略
export function assertSafeStickerData(data) {
  const src = data && typeof data === 'object' ? data.src : data;
  if (typeof src !== 'string' || src.length === 0) {
    throw new Error('Sticker security: src 不能为空');
  }

  let url;
  try {
    url = new URL(src);
  } catch {
    // 同源相对路径（/api/...）与协议相对路径（//host/...）在部分环境（jsdom、无 base）无法直接解析；
    // 统一用占位 origin 解析，仅为完成协议白名单校验，不做任何请求
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

  // 危险协议单独判定：data:text/html 之类即便落在 data: 分支也必须拦下
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

// 清洗序列化 SVG：按黑名单移除危险元素、属性与协议
// 默认用 DOMParser 解析；DOMParser 不可用时返回空串（拒绝）而非放行，安全默认失败
// 允许 options.backend 注入 DOMPurify 等实现，接口只需 sanitize(input)
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

  // XML 解析失败时 DOMParser 不抛错而是生成 <parsererror>，必须显式识别
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
        // 非 # 开头的引用必须落在协议白名单内，否则移除
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

  // 移除指向外部资源的 <use>（仅保留文档内 # 引用）
  root.querySelectorAll('use').forEach((node) => {
    const href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
    if (href && !href.startsWith('#')) {
      node.parentNode && node.parentNode.removeChild(node);
    }
  });

  // 移除 <style> 中的外链 url(...)，保留内部 #id 引用
  root.querySelectorAll('style').forEach((node) => {
    node.textContent = (node.textContent || '').replace(/url\(\s*["']?(?!\s*#)[^)"']+["']?\s*\)/gi, '');
  });

  return new XMLSerializer().serializeToString(root);
}

// 清洗 SVG data URL：解码 → sanitizeSvg → 重新编码
// 非 SVG 的 data URL 原样返回（不在本函数职责内）；解码或清洗失败返回 '' 表示拒绝
// 保留原有编码形态（base64 仍 base64、utf8 仍 utf8），避免改变调用方后续处理方式
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

// 转义 CSS url(...) token 中的特殊字符，防止 CSS 注入
// 已存在的合法百分号编码（%xx）不二次转义，否则会破坏原有编码
// 控制字符、空白、引号、反斜杠、括号一律百分号编码；输出须配合引号使用（url("<escaped>")）
export function escapeCssUrl(url) {
  if (typeof url !== 'string') return '';
  const hex = '0123456789ABCDEF';
  let out = '';
  for (let i = 0; i < url.length; i++) {
    const ch = url[i];
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
