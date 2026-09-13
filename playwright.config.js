// ！Playwright 端到端测试配置
// 仅使用 Chromium，支持本地开发与 CI 两种运行模式。
//
// 测试项目依赖链：setup（登录 → 保存 storageState）→ chromium（继承登录态）
// auth.setup.js 通过 /api/auth/login 取 Token 存入 .auth/user.json，
// 其余各 spec 经 storageState 复用该登录态，避免每个文件重复登录。

import { defineConfig, devices } from '@playwright/test';

// CI=true 时改用无头模式并增加重试
const isCI = process.env.CI === 'true';

export default defineConfig({
  testDir: './e2e-tests',

  // 单条测试 30 秒；expect 另设 10 秒，便于区分「断言失败」与「用例整体卡住」
  timeout: 30 * 1000,
  expect: {
    timeout: 10 * 1000,
  },

  // CI 机器较慢，失败重试 2 次；本地不重试，以便立刻暴露问题
  retries: isCI ? 2 : 0,

  // 强制单 worker：sql.js 的写入不是并发安全的，多 worker 会互相覆盖数据库
  workers: 1,

  // 报告用 HTML，且不覆盖 outputDir——playwright-archive 依赖默认目录名
  reporter: [['html', { open: 'never' }]],

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    screenshot: 'only-on-failure',

    // CI 保留录像用于归档回放；本地关闭以省磁盘与时间
    video: isCI ? 'retain-on-failure' : 'off',

    trace: 'retain-on-failure',
  },

  projects: [
    // setup 只跑一次，产出的登录态供 chromium 项目复用
    {
      name: 'setup',
      testMatch: /auth\.setup\.js/,
    },
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // CI 无头；本地有头，便于观察与调试
        headless: isCI ? true : false,
        storageState: '.auth/user.json',
      },
      dependencies: ['setup'],
    },
  ],

  // 开发服务器始终配置：reuseExistingServer 使服务已在运行时不再重复启动。
  // 本地自动起 Vite dev server；CI / Docker 下若端口已可达则直接复用。
  webServer: {
    command: 'npm run dev',
    url: process.env.BASE_URL || 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 60 * 1000,
    // stderr 走管道：保留启动失败的输出，便于定位端口占用等问题
    stderr: 'pipe',
  },
});
