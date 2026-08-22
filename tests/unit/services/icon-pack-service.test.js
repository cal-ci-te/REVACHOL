// 图标包服务单测（mock ApiClient 与 processor）
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../../js/services/api-client.js', () => ({
  ApiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../js/services/icon-pack-processor.js', () => ({
  inspectZipFile: vi.fn(),
  buildNormalizedZip: vi.fn(),
}));

import { ApiClient } from '../../../js/services/api-client.js';
import { inspectZipFile, buildNormalizedZip } from '../../../js/services/icon-pack-processor.js';
import { IconPackService } from '../../../js/services/icon-pack-service.js';

describe('IconPackService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    IconPackService._statusCache = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updatePackThemes', () => {
    it('empty themeIds rejects without request', async () => {
      await expect(IconPackService.updatePackThemes('pack1', [])).rejects.toThrow();
      expect(ApiClient.put).not.toHaveBeenCalled();
    });

    it('valid themeIds calls PUT and clears cache', async () => {
      ApiClient.put.mockResolvedValue({ success: true });
      IconPackService._statusCache = { themes: {} };
      await IconPackService.updatePackThemes('pack1', ['dark']);
      expect(ApiClient.put).toHaveBeenCalledWith('/api/icon-packs/pack1/themes', { themeIds: ['dark'] });
      expect(IconPackService._statusCache).toBeNull();
    });
  });

  describe('uploadPack', () => {
    it('does not call ApiClient.post when inspect has errors', async () => {
      inspectZipFile.mockResolvedValue({ errors: ['PNG 签名校验失败'], warnings: [] });
      const file = { name: 'x.zip' };
      await expect(IconPackService.uploadPack(file, 'test', ['dark'])).rejects.toThrow();
      expect(ApiClient.post).not.toHaveBeenCalled();
    });

    it('calls ApiClient.post with normalized base64 on success', async () => {
      inspectZipFile.mockResolvedValue({ errors: [], warnings: [] });
      buildNormalizedZip.mockResolvedValue({
        generateAsync: vi.fn().mockResolvedValue('ZGF0YQ=='),
      });
      ApiClient.post.mockResolvedValue({ id: 'pack1', name: 'test', themes: ['dark'] });

      const file = { name: 'x.zip' };
      await IconPackService.uploadPack(file, 'test', ['dark']);
      expect(buildNormalizedZip).toHaveBeenCalledWith(file);
      expect(ApiClient.post).toHaveBeenCalledWith(
        '/api/icon-packs',
        { name: 'test', themeIds: ['dark'], zipBase64: 'ZGF0YQ==' },
        { timeout: 60000 }
      );
      expect(IconPackService._statusCache).toBeNull();
    });
  });

  describe('loadStatus / loadPacks / deletePack', () => {
    it('loadStatus caches when force=false', async () => {
      const status = { themes: {} };
      ApiClient.get.mockResolvedValue(status);
      const first = await IconPackService.loadStatus(false);
      const second = await IconPackService.loadStatus(false);
      expect(first).toBe(status);
      expect(second).toBe(status);
      expect(ApiClient.get).toHaveBeenCalledTimes(1);
    });

    it('loadStatus(force=true) refetches', async () => {
      ApiClient.get.mockResolvedValue({ themes: {} });
      await IconPackService.loadStatus(true);
      await IconPackService.loadStatus(true);
      expect(ApiClient.get).toHaveBeenCalledTimes(2);
    });

    it('loadPacks calls GET /api/icon-packs', async () => {
      ApiClient.get.mockResolvedValue([]);
      const result = await IconPackService.loadPacks();
      expect(ApiClient.get).toHaveBeenCalledWith('/api/icon-packs');
      expect(result).toEqual([]);
    });

    it('deletePack calls DELETE and clears cache', async () => {
      ApiClient.delete.mockResolvedValue({ success: true });
      IconPackService._statusCache = {};
      await IconPackService.deletePack('pack1');
      expect(ApiClient.delete).toHaveBeenCalledWith('/api/icon-packs/pack1');
      expect(IconPackService._statusCache).toBeNull();
    });
  });
});
