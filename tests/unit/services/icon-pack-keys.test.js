// 图标包键名注册表单测
import { describe, it, expect } from 'vitest';
import {
  ICON_PACK_KEYS,
  ICON_PACK_KEY_MAP,
  ICON_PACK_KEY_SET,
  ICON_PACK_SIZE_RANGE,
  ICON_PACK_MAX_DIM,
  ICON_PACK_LIMITS,
  ICON_PACK_THEME_IDS,
} from '../../../js/services/icon-pack-keys.js';
import { UI } from '../../../js/utils/ui-strings.js';
import { ThemeService } from '../../../js/services/theme-service.js';

describe('icon-pack-keys', () => {
  it('共 33 个键且 key/slot 唯一', () => {
    expect(ICON_PACK_KEYS).toHaveLength(33);
    const keys = ICON_PACK_KEYS.map((k) => k.key);
    const slots = ICON_PACK_KEYS.map((k) => k.slot);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(slots).size).toBe(slots.length);
    expect(ICON_PACK_KEY_SET.size).toBe(33);
  });

  it('size range 合法且 maxDim 与 range.max 一致', () => {
    expect(ICON_PACK_SIZE_RANGE.min).toBeGreaterThan(0);
    expect(ICON_PACK_SIZE_RANGE.min).toBeLessThan(ICON_PACK_SIZE_RANGE.max);
    expect(ICON_PACK_MAX_DIM).toBe(ICON_PACK_SIZE_RANGE.max);
    expect(ICON_PACK_LIMITS.maxEntries).toBeGreaterThan(0);
    expect(ICON_PACK_LIMITS.maxFileBytes).toBeGreaterThan(0);
    expect(ICON_PACK_LIMITS.maxTotalBytes).toBeGreaterThan(ICON_PACK_LIMITS.maxFileBytes);
  });

  it('box-item-* 键集合与 UI.magicBox.items id 集合完全一致', () => {
    const boxItemKeys = ICON_PACK_KEYS.filter((k) => k.key.startsWith('box-item-')).map((k) => k.key.replace('box-item-', ''));
    const itemIds = UI.magicBox.items.map((item) => item.id);
    expect([...boxItemKeys].sort()).toEqual([...itemIds].sort());
  });

  it('theme-* 键集合与 ThemeService.getThemes() 的 id 集合一致', () => {
    const themeKeys = ICON_PACK_KEYS.filter((k) => k.key.startsWith('theme-')).map((k) => k.key.replace('theme-', ''));
    const themeIds = ThemeService.getThemes().map((t) => t.id);
    expect([...themeKeys].sort()).toEqual([...themeIds].sort());
  });

  it('arrow 键存在且唯一', () => {
    const arrowKeys = ICON_PACK_KEYS.filter((k) => k.key === 'arrow');
    expect(arrowKeys).toHaveLength(1);
    expect(arrowKeys[0].slot).toBe('arrow');
  });

  it('deco-* 六键存在且与 1.1.2 映射一致', () => {
    const decoMap = {
      'deco-style': 'deco:style',
      'deco-duplicate': 'deco:duplicate',
      'deco-rename': 'deco:rename',
      'deco-edit-pos': 'deco:editPos',
      'deco-download': 'deco:download',
      'deco-delete': 'deco:delete',
    };
    Object.entries(decoMap).forEach(([key, slot]) => {
      expect(ICON_PACK_KEY_MAP[key]).toBeTruthy();
      expect(ICON_PACK_KEY_MAP[key].slot).toBe(slot);
    });
  });

  it('键名全部匹配 ^[a-z0-9-]+$', () => {
    ICON_PACK_KEYS.forEach((k) => {
      expect(k.key).toMatch(/^[a-z0-9-]+$/);
    });
  });

  it('ICON_PACK_THEME_IDS 与三个主题一致', () => {
    expect([...ICON_PACK_THEME_IDS].sort()).toEqual(['dark', 'light', 'lofi']);
  });
});
