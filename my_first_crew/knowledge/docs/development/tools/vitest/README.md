# Vitest — 单元测试

基于 Vitest + jsdom 的单元测试框架，配置复用 Vite 构建管线。

## 快速开始

```bash
# 运行全部测试
npm test

# 运行测试 + 生成覆盖率报告（coverage/ 目录）
npm run test:coverage

# 监听模式：文件变更自动重新运行
npm run test:watch

# 运行单个测试文件
npx vitest run tests/utils.test.js
```

## 配置说明

| 文件 | 说明 |
|------|------|
| `vitest.config.js` | 继承 `vite.config.js`，追加测试配置 |
| `tests/` | 测试文件目录 |

关键配置项（`vitest.config.js`）：

| 配置 | 值 | 说明 |
|------|-----|------|
| `environment` | `jsdom` | 模拟浏览器 DOM 环境 |
| `include` | `tests/**/*.{test,spec}.js` | 测试文件匹配模式 |
| `coverage.provider` | `v8` | V8 原生覆盖率（无需额外依赖） |
| `coverage.include` | `js/**/*.js` | 覆盖率统计范围 |
| `globals` | `true` | `describe`/`it`/`expect` 无需显式导入 |

## 常见问题

### 测试报 `document is not defined`

确保 `vitest.config.js` 中 `environment` 设为 `"jsdom"`。[REVIEW] 当前配置已设置，若单个测试需要 node 环境，可在文件顶部添加 `// @vitest-environment node`。

### 覆盖率显示 0%

检查 `coverage.include` 路径是否匹配源码目录。当前配置为 `js/**/*.js`，确认新增测试文件放入 `tests/` 目录。

### `npm test` 提示找不到 vitest

确认已执行 `npm install`。[REVIEW] vitest 位于 `devDependencies`，生产环境 `npm install --production` 不会安装。
