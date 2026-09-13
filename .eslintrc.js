// ！旧版 ESLint 配置（已废弃，不会被加载）
// 本文件是 eslintrc 格式，而仓库已迁移到 flat config（见 eslint.config.js）。
// ESLint 10 一旦发现 eslint.config.js 便不再读取 .eslintrc.js，故此处配置实际不生效；
// 其中 5 条规则已手工同步到 eslint.config.js。保留仅为对照历史，确认无用后可整体删除。
export default {
  env: {
    browser: true,
    es2022: true,
    node: true
  },
  extends: ['eslint:recommended', 'prettier'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  rules: {
    'no-var': 'error',
    'prefer-const': 'warn',
    'eqeqeq': ['error', 'always'],
    'no-unused-vars': 'warn',
    'no-console': 'off'
  }
};
