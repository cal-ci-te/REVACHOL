// ！图片压缩工具测试
// 覆盖 compressImage 的 Promise 结构与错误处理；前置：jsdom 无 canvas，无法验证真实压缩结果。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { compressImage } from '../../../js/utils/image.js';

describe('image utils', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return a Promise', () => {
    const file = new File(['x'], 'test.png', { type: 'image/png' });
    const result = compressImage(file);
    expect(result).toBeInstanceOf(Promise);
    // 避免未处理的 rejection 影响测试（jsdom 无 canvas，可能 reject）
    result.catch(() => {});
  });

  it('should reject when FileReader fails', async () => {
    const OrigFileReader = global.FileReader;
    global.FileReader = class {
      readAsDataURL() {
        if (this.onerror) this.onerror(new Error('read fail'));
      }
    };
    try {
      const file = new File(['x'], 'test.png', { type: 'image/png' });
      await expect(compressImage(file)).rejects.toBeInstanceOf(Error);
    } finally {
      global.FileReader = OrigFileReader;
    }
  });
});
