// tests/unit/utils/broadcast-helper.test.js
// 测试 BroadcastChannel 封装：初始化、消息收发、过滤分发、清理
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BroadcastHelper } from '../../../js/utils/broadcast-helper.js';

class MockBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    this.posted = [];
    this.closed = false;
  }
  postMessage(data) {
    this.posted.push(data);
  }
  close() {
    this.closed = true;
  }
}

describe('BroadcastHelper', () => {
  let OrigBC;

  beforeEach(() => {
    OrigBC = global.BroadcastChannel;
    global.BroadcastChannel = MockBroadcastChannel;
    BroadcastHelper.close();
    vi.clearAllMocks();
  });

  afterEach(() => {
    global.BroadcastChannel = OrigBC;
    BroadcastHelper.close();
  });

  describe('init', () => {
    it('should create a channel', () => {
      BroadcastHelper.init('test');
      expect(BroadcastHelper._channel).toBeInstanceOf(MockBroadcastChannel);
      expect(BroadcastHelper._channel.name).toBe('test');
    });

    it('should not recreate when name unchanged', () => {
      BroadcastHelper.init('test');
      const first = BroadcastHelper._channel;
      BroadcastHelper.init('test');
      expect(BroadcastHelper._channel).toBe(first);
    });

    it('should handle BroadcastChannel unavailable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.BroadcastChannel = class {
        constructor() {
          throw new Error('unavailable');
        }
      };
      BroadcastHelper.init('test');
      expect(BroadcastHelper._channel).toBeNull();
      warn.mockRestore();
    });
  });

  describe('on', () => {
    it('should register a listener and return unsubscribe fn', () => {
      const cb = vi.fn();
      const off = BroadcastHelper.on('msg', cb);
      expect(BroadcastHelper._listeners).toHaveLength(1);
      off();
      expect(BroadcastHelper._listeners).toHaveLength(0);
    });
  });

  describe('send', () => {
    it('should post a typed message', () => {
      BroadcastHelper.init('test');
      BroadcastHelper.send('hello', { x: 1 });
      const posted = BroadcastHelper._channel.posted;
      expect(posted).toHaveLength(1);
      expect(posted[0].type).toBe('hello');
      expect(posted[0].payload).toEqual({ x: 1 });
    });

    it('should no-op when channel is null', () => {
      expect(() => BroadcastHelper.send('hello')).not.toThrow();
      expect(BroadcastHelper._channel).toBeNull();
    });
  });

  describe('_dispatch', () => {
    it('should dispatch to matching string filter', () => {
      const cb = vi.fn();
      BroadcastHelper.on('hello', cb);
      BroadcastHelper._dispatch({ type: 'hello', payload: {} });
      expect(cb).toHaveBeenCalled();
    });

    it('should dispatch to matching function filter', () => {
      const cb = vi.fn();
      BroadcastHelper.on((d) => d.type === 'x', cb);
      BroadcastHelper._dispatch({ type: 'x' });
      expect(cb).toHaveBeenCalled();
    });

    it('should ignore messages with no type', () => {
      const cb = vi.fn();
      BroadcastHelper.on('hello', cb);
      BroadcastHelper._dispatch(null);
      BroadcastHelper._dispatch({});
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('should close channel and clear listeners', () => {
      BroadcastHelper.init('test');
      BroadcastHelper.on('x', () => {});
      BroadcastHelper.close();
      expect(BroadcastHelper._channel).toBeNull();
      expect(BroadcastHelper._listeners).toHaveLength(0);
    });
  });
});
