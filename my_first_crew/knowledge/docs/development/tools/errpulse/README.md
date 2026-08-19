# ErrPulse — 本地错误监控

开源错误监控工具，在本地开发时收集前后端异常并展示仪表盘。

## 概述

项目已集成 ErrPulse SDK：
- 后端：`@errpulse/node`（`backend/server.cjs` 中 `init()`）
- 前端：`@errpulse/vite`（Vite 插件，自动拦截 fetch 错误）

**默认连接 `localhost:3800`**。ErrPulse 服务端需自行启动（`npx errpulse-server` 或从源码部署），项目当前不打包 ErrPulse 服务端。

## 快速开始

```bash
# [REVIEW] 启动 ErrPulse 服务端（如果可用）
npx errpulse-server

# 启动项目后，访问仪表盘
# http://localhost:3800
```

## 状态说明

| 场景 | 行为 |
|------|------|
| ErrPulse 服务运行中 | 错误自动上报，仪表盘可查看 |
| ErrPulse 服务未启动 | SDK 静默失败，不影响业务功能 |
| Docker 环境 | 后端容器内 `localhost:3800` 不可达，错误上报被跳过 |

## 常见问题

### 控制台大量 `ERR_CONNECTION_REFUSED localhost:3800`

正常现象。`@errpulse/vite` 插件拦截 fetch 请求并尝试上报，ErrPulse 未运行时显示此错误。不影响功能，可忽略。

### 如何关闭 ErrPulse

后端：修改 `server.cjs` 中 `init()` 的 `enabled` 为 `false`。
前端：当前 Vite 插件无开关配置，需从 `vite.config.js` 的 plugins 数组中移除 `errpulse()`。
