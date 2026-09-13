// ！拼图组件适配
// 把 Puzzle 包装成 ComponentManager 标准组件：组件负责设备判定与生命周期，拼图逻辑在 puzzle/ 下。
import { initPuzzle } from '../puzzle/Puzzle.js';

export var puzzleComponent = {
  name: 'puzzle',

  config: {
    dependencies: [],
    desktopOnly: true,
    requiresAuth: false,
  },

  // 判定设备并返回占位实例
  // 移动端返回 null：拼图为拖拽交互，窄屏下与页面滚动冲突
  init: async function () {
    const isMobile = window.innerWidth <= 600;
    if (isMobile) {
      console.log('[puzzle-component] init: 移动端，跳过拼图组件');
      return null;
    }
    console.log('[puzzle-component] init: 桌面端，准备初始化拼图');
    return { ready: true };
  },

  // 创建拼图
  mount: async function (instance) {
    if (!instance || !instance.ready) {
      console.log('[puzzle-component] mount: 跳过（移动端或 init 返回 null）');
      return instance;
    }

    try {
      // 起点固定在右上角附近，避开侧边栏与文章卡片
      const puzzle = await initPuzzle({ x: 525, y: 450 });
      console.log('[puzzle-component] mount: 拼图已创建');
      return puzzle;
    } catch (err) {
      console.error('[puzzle-component] mount 失败:', err);
      throw err;
    }
  },

  // 销毁拼图
  unmount: async function (instance) {
    if (instance && typeof instance.destroy === 'function') {
      instance.destroy();
      console.log('[puzzle-component] unmount: 拼图已销毁');
    }
    return instance;
  },
};

export default puzzleComponent;
