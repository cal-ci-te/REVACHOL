// ！EventBus 边界补充测试
// 补充 tests/core/event-bus.test.js 未覆盖的边界：emit 无注册事件、once/off 边界、错误隔离、链式调用。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../../js/core/event-bus.js';

describe('EventBus — 补充测试', () => {

  beforeEach(() => {
    EventBus.clear();
  });

  // emit 边界：无注册事件 / 无回调
  describe('emit — 无注册场景', () => {
    it('对未注册的事件 emit 不应报错', () => {
      expect(() => EventBus.emit('never_registered')).not.toThrow();
    });

    it('对已清空回调的事件 emit 不应报错', () => {
      const fn = vi.fn();
      EventBus.on('temp', fn);
      EventBus.off('temp');
      // 此时 'temp' 的 _events 已删除
      expect(() => EventBus.emit('temp')).not.toThrow();
    });

    it('emit 无 data 参数时回调收到 undefined', () => {
      const fn = vi.fn();
      EventBus.on('test', fn);
      EventBus.emit('test');
      expect(fn).toHaveBeenCalledWith(undefined);
    });
  });

  // once — 更完整的边界测试
  describe('once — 边界情况', () => {
    it('once 回调应只被调用一次，即使多个 emit', () => {
      const fn = vi.fn();
      EventBus.once('test', fn);
      EventBus.emit('test', 'a');
      EventBus.emit('test', 'b');
      EventBus.emit('test', 'c');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenCalledWith('a');
    });

    it('同事件同时注册 once 和 on：once 只触发一次，on 每次都触发', () => {
      const onceFn = vi.fn();
      const onFn = vi.fn();
      EventBus.once('test', onceFn);
      EventBus.on('test', onFn);

      EventBus.emit('test', 1);
      EventBus.emit('test', 2);
      EventBus.emit('test', 3);

      expect(onceFn).toHaveBeenCalledTimes(1);
      expect(onFn).toHaveBeenCalledTimes(3);
    });

    it('once 回调在触发前可通过 off(event) 移除', () => {
      const fn = vi.fn();
      EventBus.once('test', fn);
      EventBus.off('test');
      EventBus.emit('test');
      expect(fn).not.toHaveBeenCalled();
    });
  });

  // off — 更完整的边界
  describe('off — 更完整的边界', () => {
    it('off 移除多个相同回调中的一个（只移除指定回调，保留其他同名事件）', () => {
      const fn1 = vi.fn();
      const fn2 = vi.fn();
      EventBus.on('test', fn1);
      EventBus.on('test', fn2);

      EventBus.off('test', fn1);
      EventBus.emit('test');

      expect(fn1).not.toHaveBeenCalled();
      expect(fn2).toHaveBeenCalledTimes(1);
    });

    it('off 不存在的回调不影响其他回调', () => {
      const fn = vi.fn();
      const missing = vi.fn();
      EventBus.on('test', fn);
      // missing 未注册
      EventBus.off('test', missing);
      EventBus.emit('test');
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  // 错误隔离验证
  describe('错误隔离', () => {
    it('一个回调抛错不阻塞后续 emit（恢复后仍可正常 emit）', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badFn = vi.fn(() => { throw new Error('boom'); });
      const goodFn = vi.fn();
      EventBus.on('test', badFn);
      EventBus.on('test', goodFn);

      EventBus.emit('test');
      expect(badFn).toHaveBeenCalledTimes(1);
      expect(goodFn).toHaveBeenCalledTimes(1);

      // 第二次 emit 所有回调仍被调用（包括 badFn）
      EventBus.emit('test');
      expect(badFn).toHaveBeenCalledTimes(2);
      expect(goodFn).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  // 链式调用验证
  describe('链式调用', () => {
    it('on → once → emit 链式', () => {
      const fn = vi.fn();
      const result = EventBus
        .on('a', vi.fn())
        .once('b', fn)
        .emit('b', 'data');
      // emit 不返回 this（现有实现无返回值），但前两个应链式
      // emit 无返回值
      expect(result).toBeUndefined();
    });

    it('clear 后仍可正常注册和使用', () => {
      const fn = vi.fn();
      EventBus.on('old', fn);
      EventBus.clear();
      EventBus.on('new', fn);
      EventBus.emit('new', 'data');
      expect(fn).toHaveBeenCalledWith('data');
    });
  });
});
