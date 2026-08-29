/**
 * 贴纸 id 生成器 — 基于 crypto.getRandomValues，熵 ≥128 bit，带唯一性冲突重试。
 *
 * @internal 仅供 js/business/sticker 内部使用，不对外导出。
 */

/** 默认前缀。 */
export const DEFAULT_ID_PREFIX = 'stk_';

/** 默认最大重试次数（防死循环）。 */
export const DEFAULT_MAX_ATTEMPTS = 8;

/**
 * base64url 编码（无 padding、URL 安全）。
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * 生成一个高熵唯一 id。
 * @param {Iterable<string>} [existingIds] - 已存在的 id 集合（用于冲突重试）
 * @param {{ prefix?: string, maxAttempts?: number }} [options]
 * @returns {string}
 * @throws {Error} 达到最大重试次数仍冲突时抛出
 */
export function generateId(existingIds = [], options = {}) {
  const prefix = options.prefix ?? DEFAULT_ID_PREFIX;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const used = new Set(existingIds);

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('generateId: 当前环境缺少 crypto.getRandomValues');
  }

  let attempts = 0;
  while (attempts < maxAttempts) {
    const bytes = new Uint8Array(16); // 128 bit
    crypto.getRandomValues(bytes);
    const id = prefix + base64urlEncode(bytes);
    if (!used.has(id)) return id;
    attempts += 1;
  }
  throw new Error('generateId: 达到最大重试次数仍无法生成唯一 id');
}

export default { generateId, base64urlEncode, DEFAULT_ID_PREFIX };
