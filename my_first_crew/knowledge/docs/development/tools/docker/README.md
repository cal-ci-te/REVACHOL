# Docker Compose — 容器化环境

> 版本：v1.20.0 | 更新：2026-08-20

用于本地开发和部署的容器化方案，一键启动前后端双容器 + 可选 E2E 测试容器，并内置 Crew Dashboard（CrewAI Web UI）。

## 服务概览

| 服务 | 镜像 | 端口 | 职责 |
|------|------|:--:|------|
| `backend` | `node:22-bookworm-slim` | `9999` | REST API + SQLite + 文件存储 + Crew Python 子进程 |
| `frontend` | `node:22-bookworm-slim` | `3000` | Vite dev server（开发/预览）+ WebSocket 代理 |
| `playwright-tests` | `playwright:v1.48.0-noble` | — | E2E 自动化测试（一次性容器） |

## 快速开始

```bash
# 构建并后台启动
docker compose up -d --build

# 停止（保留数据）
docker compose down

# 停止并清空数据（⚠️ 数据库和贴纸被删除）
docker compose down -v

# 查看运行状态
docker compose ps

# 查看实时日志
docker compose logs -f
```

服务就绪后：
- 前端：`http://localhost:3000`
- 后端 API：`http://localhost:9999/api/`
- Crew Dashboard：`http://localhost:3000/crew-dashboard.html`
- 默认管理员密码：`admin123`（可通过环境变量 `ADMIN_PASSWORD` 修改）

### Crew Dashboard

登录后填写需求即可触发 CrewAI 四 Agent 流水线：

1. 打开 `/crew-dashboard.html`，管理员登录
2. 输入需求描述，勾选 **dry-run** 先验证配置
3. 页面通过 WebSocket 实时展示 Agent 状态卡片 / 日志流 / 执行回放 / Token 统计
4. 真实执行后结构化输出写入宿主机 `./output/`（`*_parsed.json`）

### 安全说明

- 端口默认绑定 `127.0.0.1`（仅本地访问）。如需外部访问，修改 `docker-compose.yml` 中 `${BIND_ADDR:-127.0.0.1}` 或设置环境变量 `BIND_ADDR=0.0.0.0`
- 后端容器以 `node` 非特权用户运行
- 管理员密码通过环境变量注入，不进入代码仓库
- `my_first_crew/.env`（模型 API Key）不复制进镜像，运行时通过 `./my_first_crew` 绑定挂载提供

## 配置说明

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 服务编排、端口、卷、环境变量 |
| `Dockerfile` | 后端镜像（Node 22 + Python 3.11 + CrewAI venv + 非 root） |
| `Dockerfile.frontend` | 前端镜像（Vite dev server + 原生模块编译工具链） |
| `Dockerfile.test` | E2E 测试镜像（Playwright + 编译工具链） |

关键环境变量（`docker-compose.yml` / `.env`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BIND_ADDR` | `127.0.0.1` | 端口绑定地址，云服务器设为 `0.0.0.0` |
| `STORAGE_TYPE` | `local` | 存储模式，可选 `local` 或 `rustfs` |
| `DB_PATH` | `/app/data/revachol.db` | 数据库文件路径 |
| `VITE_BACKEND_URL` | `http://backend:9999` | Vite 代理目标（Docker 内部网络） |
| `CREWAI_DISABLE_ASYNC` | `1` | 关闭 CrewAI 异步客户端 |
| `PYTHONUNBUFFERED` | `1` | Python stdout 实时刷新（NDJSON 按行解析） |
| `CREW_PYTHON` | `/app/my_first_crew/.venv/bin/python` | 容器内 venv Python 路径 |
| `CREW_DIR` | `/app/my_first_crew` | Crew 脚本目录 |
| `CREW_OUTPUT_DIR` | `/app/my_first_crew/output` | 结构化输出目录 |

## 数据持久化

命名卷 + 绑定挂载：

| 卷/挂载 | 挂载路径 | 内容 |
|------|----------|------|
| `revachol_data` | `/app/data` | SQLite 数据库文件（`revachol.db`） |
| `revachol_uploads` | `/app/uploads` | 贴纸图片文件（本地存储模式） |
| `./my_first_crew` | `/app/my_first_crew` | CrewAI 源码 + `.env`（绑定挂载） |
| `/app/my_first_crew/.venv` | 匿名卷 | 镜像内 Linux venv（防止宿主机 Windows `.venv` 覆盖） |
| `./output` | `/app/my_first_crew/output` | Crew 结构化输出（`*_parsed.json`，绑定挂载） |

## E2E 测试容器构建说明

### 背景

`playwright-tests` 服务基于微软官方 Playwright 镜像 `mcr.microsoft.com/playwright:v1.48.0-noble` 构建。该镜像预装了 Chromium 浏览器及系统运行时依赖（libgtk、libnss 等），是运行 Playwright 测试的标准环境。

### 原生模块依赖

项目依赖中包含 `bcrypt@5.1.1`（`package.json` → `dependencies`），这是一个 **C++ 原生模块**，使用 `node-gyp` 在 `npm install` 时进行实时编译。

Playwright 官方镜像为了精简体积，**不包含**以下编译工具：

| 缺失工具 | 用途 |
|----------|------|
| `g++` / `build-essential` | C++ 编译器及标准库头文件 |
| `make` | `node-gyp` 构建流程的 Makefile 执行 |
| `python3` | `node-gyp` 配置脚本的运行环境 |

如果不安装这些工具，`npm install` 会在 `bcrypt` 的 `node-pre-gyp` 阶段失败：

```
npm error node-pre-gyp ERR! node -v v20.18.0
npm error node-pre-gyp ERR! node-pre-gyp -v v1.0.11
npm error node-pre-gyp ERR! not ok
```

### 解决方案

`Dockerfile.test` 在 `npm install` 之前显式安装编译工具链（第 14–23 行）：

```dockerfile
# ---- 第 0 层：安装 C++ 编译工具链 ----
# Playwright 官方镜像为精简体积，未包含 g++/make/python3
# 但项目依赖含有原生模块（bcrypt），npm install 时需要 node-gyp 编译
RUN apt-get update && apt-get install -y \
    build-essential \
    python3 \
    g++ \
    make \
    && rm -rf /var/lib/apt/lists/*
```

安装后立即执行 `rm -rf /var/lib/apt/lists/*` 清理 APT 缓存，控制镜像层增量体积。

### 为什么不用多阶段构建？

一个自然的想法是：先用 `node:22-bookworm-slim` 安装依赖，再把 `node_modules` 复制到 Playwright 镜像。技术上可行（后端现为 glibc 的 Debian 基础镜像），但**当前不采用**：

- Playwright 官方镜像已包含 Chromium 与系统运行时依赖，直接在其上安装编译工具（约 200MB，安装后清理）增量最小
- 多阶段构建会额外维护一份“依赖安装阶段”，增加 Dockerfile 复杂度和 CI 缓存策略成本
- `bcrypt` 等原生模块在 Debian/glibc 下编译产物与 Playwright 的 glibc 环境天然兼容，复制方案没有额外收益

**结论**：直接在 Playwright 镜像中安装编译工具是当前最简洁可靠的方案。

### 验证构建

```bash
# 单独构建测试镜像
docker compose build playwright-tests

# 构建并运行测试（后端 + 前端自动启动）
docker compose up -d --build backend frontend
docker compose run --rm playwright-tests

# 运行测试并生成归档
docker compose run --rm playwright-tests --archive
```

构建成功的标志：`npm install` 阶段无 `node-pre-gyp ERR!` 报错，`bcrypt` 模块正常编译。

### 未来新增原生模块

如果 `package.json` 中新增了其他需要编译的原生模块（如 `sharp`、`node-sass`、`sqlite3` 等），`build-essential` 已覆盖这些模块的编译需求，无需额外安装依赖。

## 生产部署建议

当前 Docker Compose 配置面向开发/预览环境。生产部署建议：

1. **前端静态构建**：`npm run build` → Nginx 反向代理静态文件，启用 gzip + 缓存头
2. **HTTPS**：在 Nginx 层配置 Let's Encrypt TLS 证书
3. **S3 存储**：设置 `STORAGE_TYPE=rustfs` 并用环境变量配置 S3 兼容存储的 endpoint/密钥
4. **健康检查**：`/api/health` 与 `/api/crew/status` 端点已就绪，可直接接入容器编排（K8s liveness probe）或外部监控
5. **日志**：当前输出到 stdout/stderr，可通过 Docker 日志驱动收集

## 常见问题

### 端口被占用

```bash
# Windows 查看端口占用
netstat -ano | findstr :3000

# 修改 docker-compose.yml 中端口映射
ports:
  - "3001:3000"  # 宿主机 3001 → 容器 3000
```

### 容器启动后立即退出

```bash
docker compose logs backend  # 查看错误日志
```

常见原因：卷权限问题（旧版本升级后）。解决：`docker compose down -v && docker compose up -d --build`。

### 构建时 npm install 超时

镜像加速已配置 `docker.xuanyuan.me`。若仍超时，检查 Docker Desktop → Settings → Docker Engine 中的 `registry-mirrors` 配置。

### `docker compose up` 后前端无法访问后端

确认 `VITE_BACKEND_URL=http://backend:9999` 环境变量已设置（`docker-compose.yml` 中已配置）。

### 数据库文件在哪？

存储在 Docker 命名卷 `revachol_data` 中。可通过以下方式访问：

```bash
docker compose exec backend ls -la /app/data/
```

### 修改代码后需要重新构建吗？

- `backend` 和 `frontend` 服务配置了 bind mount 卷（`./backend:/app`、`.:/app`），代码修改即时生效
- 如果修改了 `package.json`（新增/更新依赖），需要 `docker compose up -d --build` 重新构建
