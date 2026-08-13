// tests/unit/admin/panel/palette.test.js
// 测试色卡列表渲染：空状态、色卡渲染、应用/删除按钮绑定
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../js/admin/panel/index.js', () => ({
  AdminPanel: { renderPalettes: null },
}));
vi.mock('../../../../js/services/texture.js', () => ({
  Texture: { palettes: [], applyPalette: vi.fn(), deletePalette: vi.fn() },
}));
vi.mock('../../../../js/services/notification-service.js', () => ({
  NotificationService: {
    showToast: vi.fn(),
    messages: {
      paletteDeleteConfirm: 'confirm?',
      moduleNotLoaded: 'not loaded',
      paletteApplied: (n) => `applied ${n}`,
    },
  },
}));
vi.mock('../../../../js/utils.js', () => ({
  Utils: { escapeHtml: (s) => String(s) },
}));
vi.mock('../../../../js/utils/ui-strings.js', () => ({
  UI: {
    admin: {
      paletteEmpty: 'empty',
      paletteApply: 'apply',
      paletteDelete: 'delete',
    },
  },
}));

import { AdminPanel } from '../../../../js/admin/panel/index.js';
import { Texture } from '../../../../js/services/texture.js';
import { NotificationService } from '../../../../js/services/notification-service.js';
import '../../../../js/admin/panel/palette.js';

describe('AdminPanel.renderPalettes', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('should return early when container missing', () => {
    Texture.palettes = [];
    expect(() => AdminPanel.renderPalettes()).not.toThrow();
  });

  it('should render empty message when no palettes', () => {
    document.body.innerHTML = '<div id="paletteList"></div>';
    Texture.palettes = [];
    AdminPanel.renderPalettes();
    expect(document.getElementById('paletteList').innerHTML).toContain('empty');
  });

  it('should render solid and gradient palettes', () => {
    document.body.innerHTML = '<div id="paletteList"></div>';
    Texture.palettes = [
      { id: 'p1', name: 'Palette One', mode: 'solid', colors: ['#111111'] },
      {
        id: 'p2',
        name: 'Palette Two',
        mode: 'gradient',
        colors: ['#111', '#222'],
        direction: 'to right',
      },
    ];
    AdminPanel.renderPalettes();
    const html = document.getElementById('paletteList').innerHTML;
    expect(html).toContain('Palette One');
    expect(html).toContain('Palette Two');
    expect(html).toContain('linear-gradient');
    expect(document.querySelectorAll('.apply-palette').length).toBe(2);
    expect(document.querySelectorAll('.delete-palette').length).toBe(2);
  });

  it('should apply palette on apply button click', () => {
    document.body.innerHTML = '<div id="paletteList"></div>';
    Texture.palettes = [
      { id: 'p1', name: 'P', mode: 'solid', colors: ['#123456'] },
    ];
    AdminPanel.renderPalettes();
    document.querySelector('.apply-palette').click();
    expect(Texture.applyPalette).toHaveBeenCalledWith('p1');
    expect(NotificationService.showToast).toHaveBeenCalled();
  });

  it('should delete palette on delete button click (confirmed)', () => {
    document.body.innerHTML = '<div id="paletteList"></div>';
    Texture.palettes = [
      { id: 'p1', name: 'P', mode: 'solid', colors: ['#123456'] },
    ];
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true);
    AdminPanel.renderPalettes();
    document.querySelector('.delete-palette').click();
    expect(Texture.deletePalette).toHaveBeenCalledWith('p1');
    confirmSpy.mockRestore();
  });

  it('should not delete when confirm cancelled', () => {
    document.body.innerHTML = '<div id="paletteList"></div>';
    Texture.palettes = [
      { id: 'p1', name: 'P', mode: 'solid', colors: ['#123456'] },
    ];
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(false);
    AdminPanel.renderPalettes();
    document.querySelector('.delete-palette').click();
    expect(Texture.deletePalette).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
