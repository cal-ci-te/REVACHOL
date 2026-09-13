// ！Vitest 单测配置
// 测试运行实际读取的配置（Vitest 优先取 vitest.config.js，而非 vite.config.js）。
import { defineConfig } from 'vitest/config';
import viteConfig from './vite.config.js';

export default defineConfig({
  // 注意：vite.config.js 用 defineConfig(fn) 导出的是一个函数，
  // 而展开函数只会得到空对象（函数自身没有可枚举属性），
  // 所以此处并未真正继承 Vite 的 alias 与 plugins。如需复用，
  // 应先调用该函数（传入 mode）再展开其返回值。
  ...viteConfig,
  test: {
    // 被测代码大量操作 DOM，故用 jsdom 而非 node 环境
    environment: "jsdom",
    // 注意：该模式会同时收集 tests/core 与 tests/unit 下的同名文件
    // （app-state / event-bus / article-service / auth 各存在两份，待专项清理）
    include: ["tests/**/*.{test,spec}.js"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      // 只统计业务代码：测试自身与 tests/ 不计入覆盖率
      include: ["js/**/*.js"],
      exclude: [
        "js/**/*.{test,spec}.js",
        "tests/**",
        "**/node_modules/**",
        "**/dist/**",
      ],
    },
    // 注入 describe / it / expect 为全局，省去每个测试文件重复导入
    globals: true,
    setupFiles: [],
  },
});