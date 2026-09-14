// ！防抖节流工具测试
// 覆盖 js/utils/function.js 的 debounce / throttle；前置：无（用 vi.useFakeTimers 控制时间）。

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle } from '../../js/utils/function.js';

describe('debounce', () => {

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('应在等待时间内只执行最后一次调用', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced();
    debounced();
    debounced();

    // 快进 99ms — 还不应执行
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();

    // 快进到 100ms — 应执行最后一次
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('应正确传递参数', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);

    debounced('a', 1, { key: 'val' });
    vi.advanceTimersByTime(50);

    expect(fn).toHaveBeenCalledWith('a', 1, { key: 'val' });
  });

  it('应正确绑定 this 上下文', () => {
    const obj = {
      value: 42,
      getValue() { return this.value; },
    };
    const fn = vi.fn(function () { return this.value; });
    obj.debouncedGet = debounce(fn, 50);

    obj.debouncedGet();
    vi.advanceTimersByTime(50);

    // 验证 this 绑定到调用者 obj
    expect(fn.mock.results[0].value).toBe(42);
  });

  it('每次调用应重置等待计时器', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);

    debounced(1);
    vi.advanceTimersByTime(50);

    // 重置计时器
    debounced(2);
    vi.advanceTimersByTime(50);
    // 仍不应执行
    expect(fn).not.toHaveBeenCalled();

    // 总共又过了 100ms
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(1);
    // 最后一次调用的参数
    expect(fn).toHaveBeenCalledWith(2);
  });

  it('快速连续调用 10 次，只执行最后一次', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);

    for (let i = 0; i < 10; i++) {
      debounced(i);
    }

    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(9);
  });
});

describe('throttle', () => {

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('首次调用应立即执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled('first');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');
  });

  it('在 limit 时间内的后续调用应被忽略', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    throttled(2);
    throttled(3);

    // 只应执行第 1 次
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('limit 时间后可以再次执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    throttled(1);
    vi.advanceTimersByTime(100);

    throttled(2);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(1, 1);
    expect(fn).toHaveBeenNthCalledWith(2, 2);
  });

  it('应正确传递参数到首次执行', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    throttled('a', 'b', 'c');
    expect(fn).toHaveBeenCalledWith('a', 'b', 'c');
  });

  it('应正确绑定 this 上下文', () => {
    const obj = {
      multiplier: 10,
      compute(x) { return x * this.multiplier; },
    };
    const fn = vi.fn(function (x) { return x * this.multiplier; });
    obj.throttledCompute = throttle(fn, 100);

    obj.throttledCompute(5);
    expect(fn.mock.results[0].value).toBe(50);
  });

  it('间隔 3 次 limit 时间后应执行 4 次（首次 + 3 次）', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 50);

    // 立即执行
    throttled('t0');
    vi.advanceTimersByTime(50);

    // 执行
    throttled('t1');
    vi.advanceTimersByTime(50);

    // 执行
    throttled('t2');
    vi.advanceTimersByTime(50);

    // 执行
    throttled('t3');

    expect(fn).toHaveBeenCalledTimes(4);
    expect(fn).toHaveBeenNthCalledWith(1, 't0');
    expect(fn).toHaveBeenNthCalledWith(2, 't1');
    expect(fn).toHaveBeenNthCalledWith(3, 't2');
    expect(fn).toHaveBeenNthCalledWith(4, 't3');
  });

  it('在 limit 周期内多次调用只执行第一次，其他被丢弃', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 200);

    throttled(1);
    vi.advanceTimersByTime(50);
    throttled(2);
    vi.advanceTimersByTime(50);
    throttled(3);
    vi.advanceTimersByTime(50);
    throttled(4);
    vi.advanceTimersByTime(50);

    // 只应执行第 1 次（在 t=0 时），后续 3 次都被节流
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(1);
  });

  it('节流结束后第一次调用立即执行（不是等待下一次limit）', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);

    // 立即执行
    throttled('a');
    // 远远超过 limit
    vi.advanceTimersByTime(150);

    // 立即执行（不在节流期内）
    throttled('b');
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenNthCalledWith(2, 'b');
  });
});
