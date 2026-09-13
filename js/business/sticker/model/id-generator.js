// ！贴纸 ID 生成
// 基于 crypto.getRandomValues 生成 ≥128 bit 熵的 ID，并在已存在集合上做冲突重试。
// 用 crypto 而非 Math.random：Math.random 可预测且熵不足，ID 若可预测会导致贴纸被越权覆盖。
// 内部模块，不对外导出。

// 默认前缀
export const DEFAULT_ID_PREFIX = 'stk_';

// 默认最大重试次数（防死循环）
export const DEFAULT_MAX_ATTEMPTS = 8;

// base64url 编码
// 去掉 '=' 补齐并用 -/_ 替换 +//：结果可直接放进 URL 与选择器而无须转义
export function base64urlEncode(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 生成唯一 ID（达最大重试次数仍冲突则抛错）
export function generateId(existingIds = [], options = {}) {
  const prefix = options.prefix ?? DEFAULT_ID_PREFIX;
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const used = new Set(existingIds);

  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('generateId: 当前环境缺少 crypto.getRandomValues');
  }

  let attempts = 0;
  while (attempts < maxAttempts) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const id = prefix + base64urlEncode(bytes);
    if (!used.has(id)) return id;
    attempts += 1;
  }
  throw new Error('generateId: 达到最大重试次数仍无法生成唯一 id');
}

export default { generateId, base64urlEncode, DEFAULT_ID_PREFIX };
