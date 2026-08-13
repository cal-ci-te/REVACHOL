// tests/unit/admin/panel/action-delegator.test.js
// 测试动作分发器：注册、批量注册、事件绑定、事件分发、销毁
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionDelegator } from '../../../../js/admin/panel/action-delegator.js';

describe('ActionDelegator', () => {
  beforeEach(() => {
    ActionDelegator._container = null;
    ActionDelegator._handlers = {};
    ActionDelegator._boundEvents = false;
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a handler', () => {
      const fn = vi.fn();
      ActionDelegator.register('test-action', fn);
      expect(ActionDelegator._handlers['test-action']).toBe(fn);
    });

    it('should warn for non-function handler', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ActionDelegator.register('bad', 'not-a-function');
      expect(ActionDelegator._handlers['bad']).toBeUndefined();
      warn.mockRestore();
    });

    it('should warn when overwriting existing handler', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      ActionDelegator.register('dup', vi.fn());
      ActionDelegator.register('dup', vi.fn());
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  describe('registerAll', () => {
    it('should register multiple handlers', () => {
      ActionDelegator.registerAll({ a: vi.fn(), b: vi.fn() });
      expect(Object.keys(ActionDelegator._handlers)).toHaveLength(2);
    });
  });

  describe('init / destroy', () => {
    it('should error when container is null', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      ActionDelegator.init(null);
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });

    it('should bind events on init', () => {
      const el = document.createElement('div');
      ActionDelegator.init(el);
      expect(ActionDelegator._boundEvents).toBe(true);
      expect(ActionDelegator._container).toBe(el);
    });

    it('should destroy and clear handlers', () => {
      const el = document.createElement('div');
      ActionDelegator.register('x', vi.fn());
      ActionDelegator.init(el);
      ActionDelegator.destroy();
      expect(ActionDelegator._boundEvents).toBe(false);
      expect(ActionDelegator._handlers).toEqual({});
      expect(ActionDelegator._container).toBeNull();
    });
  });

  describe('_handleEvent', () => {
    it('should call handler for data-action element', () => {
      const fn = vi.fn();
      ActionDelegator.register('my-action', fn);
      const btn = document.createElement('button');
      btn.dataset.action = 'my-action';
      ActionDelegator._handleEvent({
        target: btn,
        type: 'click',
        preventDefault: vi.fn(),
      });
      expect(fn).toHaveBeenCalled();
    });

    it('should warn for unregistered action', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const btn = document.createElement('button');
      btn.dataset.action = 'unknown';
      ActionDelegator._handleEvent({
        target: btn,
        type: 'click',
        preventDefault: vi.fn(),
      });
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });

    it('should catch handler errors', () => {
      const err = vi.spyOn(console, 'error').mockImplementation(() => {});
      ActionDelegator.register('throwing', () => {
        throw new Error('boom');
      });
      const btn = document.createElement('button');
      btn.dataset.action = 'throwing';
      ActionDelegator._handleEvent({
        target: btn,
        type: 'click',
        preventDefault: vi.fn(),
      });
      expect(err).toHaveBeenCalled();
      err.mockRestore();
    });
  });
});
