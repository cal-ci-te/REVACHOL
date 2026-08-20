// 拼图组件适配器
// 将 Puzzle 包装为 ComponentManager 标准组件。
// init: 检测设备（移动端跳过）。mount: 创建拼图实例。unmount: 销毁 Canvas 和 DOM。
import { initPuzzle } from '../puzzle/Puzzle.js';

export var puzzleComponent = {
  name: 'puzzle',

  config: {
    dependencies: [],
    desktopOnly: true,
    requiresAuth: false,
  },

  init: async function () {
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      console.log('[puzzle-component] init: 移动端，跳过拼图组件');
      return null;
    }
    console.log('[puzzle-component] init: 桌面端，准备初始化拼图');
    return { ready: true };
  },

  mount: async function (instance) {
    if (!instance || !instance.ready) {
      console.log('[puzzle-component] mount: 跳过（移动端或 init 返回 null）');
      return instance;
    }

    try {
      const puzzle = await initPuzzle({ x: 525, y: 450 });
      console.log('[puzzle-component] mount: 拼图已创建');
      return puzzle;
    } catch (err) {
      console.error('[puzzle-component] mount 失败:', err);
      throw err;
    }
  },

  unmount: async function (instance) {
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
      console.log('[puzzle-component] unmount: 拼图已销毁');
    }
    return instance;
  },
};

export default puzzleComponent;
