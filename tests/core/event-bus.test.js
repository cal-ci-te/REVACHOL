// ！EventBus 基础行为测试
// 覆盖 on/emit/off/once/clear 与回调异常隔离；前置：无（纯内存模块，无 mock）。
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { EventBus } from '../../js/core/event-bus.js';

describe('EventBus', () => {
  beforeEach(() => {
    // 每个测试前清除所有事件
    EventBus.clear();
  });

  // on 和 emit
  describe('on and emit', () => {
    it('should call callback when event is emitted', () => {
      const fn = vi.fn();
      EventBus.on('test_event', fn);

      EventBus.emit('test_event');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass data to callback', () => {
      const fn = vi.fn();
      const data = { message: 'hello', count: 42 };

      EventBus.on('test_event', fn);
      EventBus.emit('test_event', data);

      expect(fn).toHaveBeenCalledWith(data);
    });

    it('should call multiple callbacks for same event', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      EventBus.on('test_event', fn1);
      EventBus.on('test_event', fn2);

      EventBus.emit('test_event');

      expect(fn1).toHaveBeenCalledTimes(1);
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('should not call callbacks for different events', () => {
      const fn = vi.fn();
      EventBus.on('event_a', fn);

      EventBus.emit('event_b');
      expect(fn).not.toHaveBeenCalled();
    });

    it('should support chaining', () => {
      const result = EventBus.on('event1', vi.fn()).on('event2', vi.fn());
      expect(result).toBe(EventBus);
    });
  });

  describe('off', () => {
    it('should remove specific callback', () => {
      const fn = vi.fn();
      EventBus.on('test_event', fn);

      EventBus.emit('test_event');
      expect(fn).toHaveBeenCalledTimes(1);

      EventBus.off('test_event', fn);
      EventBus.emit('test_event');
      // 不再被调用
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should remove all callbacks for an event when no callback specified', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      EventBus.on('test_event', fn1);
      EventBus.on('test_event', fn2);

      EventBus.off('test_event');
      EventBus.emit('test_event');

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });

    it('should do nothing if event does not exist', () => {
      const result = EventBus.off('non_existent_event');
      expect(result).toBe(EventBus);
    });

    it('should support chaining', () => {
      const result = EventBus.off('event');
      expect(result).toBe(EventBus);
    });
  });

  describe('once', () => {
    it('should call callback only once', () => {
      const fn = vi.fn();
      EventBus.once('test_event', fn);

      EventBus.emit('test_event');
      EventBus.emit('test_event');
      EventBus.emit('test_event');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should pass data to callback', () => {
      const fn = vi.fn();
      const data = { once: true };

      EventBus.once('test_event', fn);
      EventBus.emit('test_event', data);

      expect(fn).toHaveBeenCalledWith(data);
    });

    it('should support chaining', () => {
      const result = EventBus.once('event', vi.fn());
      expect(result).toBe(EventBus);
    });
  });

  describe('clear', () => {
    it('should remove all events', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      EventBus.on('event1', fn1);
      EventBus.on('event2', fn2);

      EventBus.clear();

      EventBus.emit('event1');
      EventBus.emit('event2');

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).not.toHaveBeenCalled();
    });

    it('should support chaining', () => {
      const result = EventBus.clear();
      expect(result).toBe(EventBus);
    });
  });

  describe('error handling', () => {
    it('should handle callback errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fn = vi.fn().mockImplementation(() => {
        throw new Error('Callback error');
      });

      EventBus.on('test_event', fn);
      // 应该不抛出错误
      expect(() => EventBus.emit('test_event')).not.toThrow();

      consoleSpy.mockRestore();
    });

    it('should continue calling other callbacks after one fails', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const failingFn = vi.fn().mockImplementation(() => {
        throw new Error('Fail');
      });
      const successFn = vi.fn();

      EventBus.on('test_event', failingFn);
      EventBus.on('test_event', successFn);

      EventBus.emit('test_event');

      expect(failingFn).toHaveBeenCalled();
      expect(successFn).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('multiple events', () => {
    it('should handle multiple events independently', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();

      EventBus.on('event_a', fn1);
      EventBus.on('event_b', fn2);

      EventBus.emit('event_a', 'data_a');
      expect(fn1).toHaveBeenCalledWith('data_a');
      expect(fn2).not.toHaveBeenCalled();

      EventBus.emit('event_b', 'data_b');
      expect(fn2).toHaveBeenCalledWith('data_b');
    });
  });
});