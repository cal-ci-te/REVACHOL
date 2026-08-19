# Node 18 → 22 依赖兼容性审查报告

> 审查日期：2026-07-20
> 项目版本：v1.7.0
> 审查范围：`package.json` 全量依赖、`backend/` 全部 22 个 `.cjs` 文件、`js/` 源代码

---

## 一、原生模块扫描

### 生产依赖（`npm install --production`）— 后端容器

| 依赖 | 类型 | 原生模块 | 风险 |
|------|------|:---:|:---:|
| `sql.js@1.14.1` | 纯 WASM | 否 | 🟢 无 |
| `ws@8.21.1` | 纯 JS + 可选原生 | 可选 `bufferutil`/`utf-8-validate` | 🟢 未安装，自动回退纯 JS |
| `@aws-sdk/client-s3@3.1089.0` | 纯 TypeScript | 否 | 🟢 无 |
| `dotenv@17.4.2` | 纯 JS | 否 | 🟢 无 |
| `@errpulse/node@0.7.0` | 纯 JS（未声明 engines） | 否 | 🟢 无 |
| `busboy@1.6.0` | 纯 JS | 否 | 🟢 无 |

**生产依赖结论：0 个原生模块。** 后端容器完全不受 Node ABI 版本影响。

### 开发依赖 — 前端容器

| 依赖 | 原生模块 | 平台 |
|------|:---:|------|
| `@rolldown/binding-*.node` | 是（Vite 7 捆绑器） | win32-x64-msvc / linux-x64-musl |
| `@rollup/rollup-*.node` | 是（Rollup） | win32-x64 / linux-x64 |
| `vite@7.3.6` | — | engines: `^20.19.0 \|\| >=22.12.0` |
| `vitest@4.1.10` | — | engines: `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` |

> Vite 7 和 Vitest 4 均显式声明支持 Node 22。Rolldown/Rollup 提供跨平台预编译 `.node` 二进制（含 `linux-x64-musl`），Alpine 构建不受影响。

---

## 二、API 兼容性审查

对全部 22 个后端 `.cjs` 文件逐项扫描：

| 检查项 | Node 18 → 22 变化 | 代码状态 | 影响 |
|--------|-------------------|----------|:--:|
| `url.parse()` | v11 弃用 | 已在 v1.4 迁移为 `new URL()` | 无 |
| `Buffer()` 构造 | v10 起不推荐 `new Buffer()` | 全部使用 `Buffer.from()` | 无 |
| `String.prototype.substr()` | ES2015 弃用 | 3 处使用 `substr(2, 6)` | 无（JS 语言级弃用，V8 永不删除） |
| `fs.writeFileSync` / `readFileSync` | 无破坏性变更 | 标准用法 | 无 |
| `fs.existsSync` | 无变更 | 无 | 无 |
| `http.createServer` | 无变更 | 无 | 无 |
| `process.env` | 无变更 | 无 | 无 |
| Stream `on('data')` / `on('end')` | 无变更 | 无 | 无 |

**API 兼容性结论：零破坏性变更。**

---

## 三、sql.js 专项风险评估

```
sql.js v1.14.1
├── 实现方式：纯 JavaScript + WASM（无原生绑定）
├── Node.js ABI 依赖：无
├── Buffer/ArrayBuffer 处理：Uint8Array ↔ Buffer.from() 标准转换
├── 已知风险（均已规避）：
│   ├── WASM BLOB 序列化损坏 (Windows) → 图片改为文件系统存储
│   ├── stmt.run(params) 不执行 INSERT → 统一 escapeSql() + db.exec()
│   └── stmt.bind() 未调用 → queryAll() 修复
└── Node 22 新增风险：无。sql.js 不依赖任何 Node 版本特定 API
```

**结论**：sql.js 是此项目中最安全的组件。WASM 层完全独立于 Node 版本，现有的 Buffer 转换代码在 Node 22 行为一致。

---

## 四、依赖引擎声明汇总

| 包 | `engines` 声明 | Node 22 兼容 |
|----|---------------|:--:|
| `vite@7.3.6` | `^20.19.0 \|\| >=22.12.0` | ✅ |
| `vitest@4.1.10` | `^20.0.0 \|\| ^22.0.0 \|\| >=24.0.0` | ✅ |
| `@aws-sdk/client-s3@3.1089.0` | `>=20.0.0` | ✅ |
| `dotenv@17.4.2` | `>=12` | ✅ |
| `ws@8.21.1` | `>=10.0.0` | ✅ |
| `sql.js@1.14.1` | 未声明（无限制） | ✅ |
| `@errpulse/node@0.7.0` | 未声明（无限制） | ✅ |

---

## 五、测试清单（升级后必测）

| 优先级 | 测试项 | 原因 |
|:--:|--------|------|
| P0 | 后端启动：`node server.cjs`，确认数据库初始化成功 | 基础验证 |
| P0 | 数据库写入：通过 API 创建文章，确认持久化 | sql.js 写入路径 |
| P0 | 贴纸上传：上传图片，确认存储 + 数据库记录 | Buffer.from() + 文件 I/O 路径 |
| P0 | 前端启动：`npm run dev` 正常启动 | Rolldown 原生二进制 |
| P1 | 贴纸图片读取：`GET /api/decos/:id/image` 返回正确二进制 | Storage adapter + Buffer 转换 |
| P1 | WebSocket 连接 | ws 库纯 JS 回退模式 |
| P1 | 文章 CRUD 全流程 | 完整数据库交互 |
| P1 | 草稿保存 + 过期清理 | 日期计算 + DELETE 操作 |
| P1 | `npm test` 全部通过 | Vitest 兼容性 |
| P2 | 主题切换、管理面板功能 | CSS/UI 逻辑，与 Node 无关 |

---

## 六、迁移结论

```
风险评估：🟢 极低风险
建议：     ✅ 可以立即迁移
改动量：   两处 Dockerfile 镜像声明，一个字面量变更
```

**理由**：

- 后端容器 `--production` 安装 5 个纯 JS/WASM 依赖，**零 ABI 耦合**
- 前端 Vite/Vitest 已显式声明 Node 22 支持
- 代码中无 Node 22 已删除或行为变更的 API
- 所有 Buffer/文件系统操作使用标准非弃用模式
- sql.js 纯 WASM，Node 版本升级对其完全透明

**改动清单**：

| 文件 | 改动 |
|------|------|
| `Dockerfile` | `FROM node:18-alpine` → `FROM node:22-alpine` |
| `Dockerfile.frontend` | `FROM node:18-alpine` → `FROM node:22-alpine` |

**注意事项**：

- `Dockerfile.frontend` 构建时 Rolldown 需下载 Alpine（musl）预编译二进制，首次构建可能较慢（与 Node 版本无关）
- 建议升级后在 Docker 环境中执行 P0/P1 测试清单
