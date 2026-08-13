// tests/unit/services/custom-icon.test.js
// 测试自定义图标管理器：getIcon/setIcon/removeIcon/applyIcon/init/createUploadHandler
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CustomIconManager } from '../../../js/services/custom-icon.js';

function createManager(overrides = {}) {
  return new CustomIconManager({
    storageKey: 'test_icon',
    containerSelector: '#icon-container',
    imgSelector: '#icon-img',
    fallbackSelector: '#icon-fallback',
    eventName: 'test:icon-changed',
    ...overrides,
  });
}

describe('CustomIconManager', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `
      <div id="icon-container">
        <img id="icon-img" />
        <span id="icon-fallback">🎭</span>
      </div>
    `;
    global.EventBus = { emit: vi.fn() };
  });

  afterEach(() => {
    delete global.EventBus;
  });

  describe('getIcon / setIcon / removeIcon', () => {
    it('should store and retrieve icon dataUrl', () => {
      const m = createManager();
      m.setIcon('data:image/png;base64,AAA');
      expect(m.getIcon()).toBe('data:image/png;base64,AAA');
    });

    it('should remove icon when setIcon called with falsy', () => {
      const m = createManager();
      m.setIcon('data:image/png;base64,AAA');
      m.setIcon(null);
      expect(m.getIcon()).toBeNull();
    });

    it('should emit event on setIcon', () => {
      const m = createManager();
      m.setIcon('data:x');
      expect(global.EventBus.emit).toHaveBeenCalledWith('test:icon-changed', {
        dataUrl: 'data:x',
      });
    });

    it('should not emit event when eventName is null', () => {
      const m = createManager({ eventName: null });
      m.setIcon('data:x');
      expect(global.EventBus.emit).not.toHaveBeenCalled();
    });
  });

  describe('applyIcon', () => {
    it('should show custom icon and hide fallback', () => {
      const m = createManager();
      m.applyIcon('data:image/png;base64,AAA');
      expect(document.getElementById('icon-img').style.display).toBe('');
      expect(document.getElementById('icon-fallback').style.display).toBe('none');
      expect(
        document.getElementById('icon-container').classList.contains('has-custom')
      ).toBe(true);
    });

    it('should hide icon and show fallback when no icon', () => {
      const m = createManager();
      m.applyIcon(null);
      expect(document.getElementById('icon-img').style.display).toBe('none');
      expect(document.getElementById('icon-fallback').style.display).toBe('');
      expect(
        document.getElementById('icon-container').classList.contains('has-custom')
      ).toBe(false);
    });
  });

  describe('init', () => {
    it('should set default src when no stored icon', () => {
      const m = createManager({ defaultSrc: 'images/default.png' });
      m.init();
      expect(
        document.getElementById('icon-img').getAttribute('src')
      ).toBe('images/default.png');
    });

    it('should hide icon when no src available', () => {
      const m = createManager({ defaultSrc: null });
      m.init();
      expect(document.getElementById('icon-img').style.display).toBe('none');
      expect(document.getElementById('icon-fallback').style.display).toBe('');
    });
  });

  describe('createUploadHandler', () => {
    it('should ignore non-image files', () => {
      const m = createManager();
      const handler = m.createUploadHandler();
      const setSpy = vi.spyOn(m, 'setIcon');
      handler({ type: 'text/plain' });
      expect(setSpy).not.toHaveBeenCalled();
    });

    it('should ignore null file', () => {
      const m = createManager();
      const handler = m.createUploadHandler();
      const setSpy = vi.spyOn(m, 'setIcon');
      handler(null);
      expect(setSpy).not.toHaveBeenCalled();
    });
  });
});
