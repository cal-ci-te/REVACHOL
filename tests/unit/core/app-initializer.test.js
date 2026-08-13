// tests/unit/core/app-initializer.test.js
// 测试应用启动编排：模块注册、拓扑排序、初始化流程、状态查询
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppInitializer } from '../../../js/core/app-initializer.js';
import { EventBus } from '../../../js/core/event-bus.js';
import { EVENTS } from '../../../js/core/event-constants.js';

describe('AppInitializer', () => {
  beforeEach(() => {
    AppInitializer._modules = [];
    AppInitializer._initialized = false;
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a module with defaults', () => {
      const initFn = vi.fn();
      const result = AppInitializer.register('config', initFn);
      expect(result).toBe(AppInitializer);
      expect(AppInitializer._modules).toHaveLength(1);
      expect(AppInitializer._modules[0]).toMatchObject({
        name: 'config',
        init: initFn,
        dependencies: [],
        loaded: false,
      });
    });

    it('should register dependencies', () => {
      AppInitializer.register('ui', vi.fn(), ['config', 'eventBus']);
      expect(AppInitializer._modules[0].dependencies).toEqual(['config', 'eventBus']);
    });

    it('should default dependencies to empty array', () => {
      AppInitializer.register('x', vi.fn());
      expect(AppInitializer._modules[0].dependencies).toEqual([]);
    });
  });

  describe('_topologicalSort', () => {
    it('should order dependencies before dependents', () => {
      const order = [];
      AppInitializer.register('a', () => order.push('a'), ['b']);
      AppInitializer.register('b', () => order.push('b'), []);
      const sorted = AppInitializer._topologicalSort();
      expect(sorted.map((m) => m.name)).toEqual(['b', 'a']);
    });

    it('should preserve order for independent modules', () => {
      AppInitializer.register('a', vi.fn());
      AppInitializer.register('b', vi.fn());
      const sorted = AppInitializer._topologicalSort();
      expect(sorted.map((m) => m.name)).toEqual(['a', 'b']);
    });

    it('should throw on circular dependency', () => {
      AppInitializer.register('a', vi.fn(), ['b']);
      AppInitializer.register('b', vi.fn(), ['a']);
      expect(() => AppInitializer._topologicalSort()).toThrow(/循环依赖/);
    });
  });

  describe('start', () => {
    it('should initialize modules in topological order', () => {
      const order = [];
      AppInitializer.register('a', () => order.push('a'), ['b']);
      AppInitializer.register('b', () => order.push('b'), []);
      AppInitializer.start();
      expect(order).toEqual(['b', 'a']);
      expect(AppInitializer._initialized).toBe(true);
    });

    it('should mark modules as loaded', () => {
      AppInitializer.register('a', vi.fn());
      AppInitializer.start();
      expect(AppInitializer._modules[0].loaded).toBe(true);
    });

    it('should skip when already initialized', () => {
      AppInitializer._initialized = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      AppInitializer.start();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('should continue when a module throws', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const second = vi.fn();
      AppInitializer.register('bad', () => { throw new Error('boom'); });
      AppInitializer.register('good', second);
      AppInitializer.start();
      expect(second).toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });

    it('should emit APP_STARTED event', () => {
      const emitSpy = vi.spyOn(EventBus, 'emit');
      AppInitializer.register('a', vi.fn());
      AppInitializer.start();
      expect(emitSpy).toHaveBeenCalledWith(EVENTS.APP_STARTED);
      emitSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('should return pending status before start', () => {
      AppInitializer.register('a', vi.fn());
      expect(AppInitializer.getStatus()).toEqual({ a: '⏳' });
    });

    it('should return loaded status after start', () => {
      AppInitializer.register('a', vi.fn());
      AppInitializer.start();
      expect(AppInitializer.getStatus()).toEqual({ a: '✅' });
    });
  });
});
