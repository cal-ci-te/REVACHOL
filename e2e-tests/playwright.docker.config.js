// Docker 专用 Playwright 配置
// 继承基础 playwright.config.js，覆盖容器环境特有设置

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // ★ 修复：本配置文件位于 /app/e2e-tests/ 目录下，testDir 相对配置文件目录解析。
  // 原 './e2e-tests' 会解析为 /app/e2e-tests/e2e-tests（不存在）导致 "No tests found"。
  // 改为 '.' 指向 /app/e2e-tests/（测试文件实际所在目录）。
  testDir: '.',

  // 明确匹配测试文件
  testMatch: '**/*.spec.js',
  testIgnore: ['**/playwright.docker.config.js', '**/node_modules/**'],

  // 容器环境稍慢，适当放宽超时
  timeout: 60 * 1000,
  expect: {
    timeout: 15 * 1000,
  },

  // 容器内始终使用 1 个 worker（避免 sql.js 并发写冲突）
  workers: 1,

  // CI 模式在容器内始终启用
  retries: 1,

  // 报告格式：HTML + list
  // outputFolder 相对配置文件目录解析，'../playwright-report' 输出到 /app/playwright-report
  // （docker-compose 将宿主机 ./playwright-report 挂载到该路径）
  reporter: [
    ['html', { outputFolder: '../playwright-report', open: 'never' }],
    ['list'],
  ],

  // 全局测试配置
  use: {
    // 前端容器在 Docker 网络中的地址
    baseURL: process.env.BASE_URL || 'http://frontend:3000',

    // 容器内始终无头模式
    headless: true,

    // 截图：仅失败时截取（容器内无法打开浏览器查看）
    screenshot: 'only-on-failure',

    // 录像：失败时保留，方便事后排查
    video: 'retain-on-failure',

    // 追踪：失败时记录
    trace: 'retain-on-failure',
  },

  // 项目配置：setup → chromium 依赖链
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        headless: true,
        storageState: '/app/.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // Docker Compose 环境中前端服务已独立运行，不启动 webServer
  // 测试容器通过网络别名 frontend:3000 访问前端
  webServer: undefined,
});
