/**
 * 贴纸安全常量 — 单一来源。
 *
 * 所有安全相关的白名单/黑名单、协议、SSRF 地址、超时等常量集中在此模块，
 * 禁止在其他模块中硬编码安全常量。security-utils.js 从本模块读取常量。
 *
 * @internal 仅供 js/business/sticker/security 内部使用，不对外导出。
 */

/** 贴纸允许的图片 MIME 类型（raster）。 */
export const STICKER_IMAGE_MIME_TYPES = Object.freeze([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
]);

/** SVG MIME 类型（默认允许，但必须经 sanitizeSvg 清洗）。 */
export const SVG_MIME_TYPE = 'image/svg+xml';

/** 是否允许 data URL 携带 SVG（开启时必须配套 sanitizeSvg）。 */
export const ALLOW_SVG_DATA_URL = true;

/** data URL 允许的 MIME 类型白名单。 */
export const DATA_URL_MIME_TYPES = Object.freeze(
  ALLOW_SVG_DATA_URL
    ? [...STICKER_IMAGE_MIME_TYPES, SVG_MIME_TYPE]
    : [...STICKER_IMAGE_MIME_TYPES]
);

/** data URL 最大长度（超长视为异常，拒绝）。 */
export const MAX_DATA_URL_LENGTH = 5 * 1024 * 1024; // 5MB

/** SVG 清洗：禁止元素（小写）。 */
export const SVG_FORBIDDEN_TAGS = Object.freeze(['script', 'foreignobject']);

/** SVG 清洗：禁止属性前缀。 */
export const SVG_FORBIDDEN_ATTR_PREFIXES = Object.freeze(['on']);

/** SVG 清洗：危险协议。 */
export const SVG_FORBIDDEN_PROTOCOLS = Object.freeze([
  'javascript:',
  'vbscript:',
  'data:text/html',
  'file:',
]);

/** SVG href/xlink:href 允许的协议白名单（# 表示文档内引用）。 */
export const SVG_ALLOWED_HREF_PROTOCOLS = Object.freeze([
  '#',
  'http:',
  'https:',
  'mailto:',
  'tel:',
]);

/** 允许的图片协议（http/https/data）。 */
export const ALLOWED_IMAGE_PROTOCOLS = Object.freeze(['http:', 'https:', 'data:']);

/** CSS url() token 中需要转义的特殊字符。 */
export const CSS_URL_ESCAPE_CHARS = Object.freeze(['"', "'", '\\', ')', '(', ' ', '\n', '\r', '\t']);

/** SSRF：禁止的私网/保留/链路本地地址前缀（IPv4 文本形式）。 */
export const SSRF_BLOCKED_IP_PREFIXES = Object.freeze([
  '127.',
  '10.',
  '192.168.',
  '172.16.',
  '172.17.',
  '172.18.',
  '172.19.',
  '172.20.',
  '172.21.',
  '172.22.',
  '172.23.',
  '172.24.',
  '172.25.',
  '172.26.',
  '172.27.',
  '172.28.',
  '172.29.',
  '172.30.',
  '172.31.',
  '169.254.',
  '0.',
]);

/** SSRF：禁止的 IPv6 前缀（小写）。 */
export const SSRF_BLOCKED_IPV6_PREFIXES = Object.freeze(['::1', '::', 'fc00:', 'fd00:', 'fe80:', 'fe8:', 'fe9:', 'fea:', 'feb:']);

/** SSRF：云元数据/特殊地址。 */
export const SSRF_BLOCKED_SPECIAL_ADDRESSES = Object.freeze(['169.254.169.254', 'metadata.google.internal']);

/** SSRF：异步请求默认超时（ms）。 */
export const SSRF_REQUEST_TIMEOUT_MS = 8000;

/** SSRF：最大重定向次数（禁止自动重定向）。 */
export const SSRF_MAX_REDIRECTS = 0;

/**
 * 判断是否为 SSRF 应拦截的 IP 文本。
 * @param {string} ip - 解析后的 IP 文本（IPv4 或 IPv6）
 * @returns {boolean} true 表示应拦截
 */
export function isBlockedIp(ip) {
  if (!ip) return true;
  const value = String(ip).toLowerCase();
  if (SSRF_BLOCKED_SPECIAL_ADDRESSES.includes(value)) return true;
  if (SSRF_BLOCKED_IP_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  if (SSRF_BLOCKED_IPV6_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  return false;
}
