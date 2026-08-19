# Docker Compose — 容器化环境

> 版本：v1.17.0 | 更新：2026-08-03

用于本地开发和部署的容器化方案，一键启动前后端双容器 + 可选 E2E 测试容器。

## 服务概览

| 服务 | 镜像 | 端口 | 职责 |
|------|------|:--:|------|
| `backend` | `node:22-alpine` | `9999` | REST API + SQLite + 文件存储 |
| `frontend` | `node:22-alpine` | `3000` | Vite dev server（开发/预览） |
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
- 默认管理员密码：`admin123`（可通过环境变量 `ADMIN_PASSWORD` 修改）

### 安全说明

- 端口默认绑定 `127.0.0.1`（仅本地访问）。如需外部访问，修改 `docker-compose.yml` 中 `${BIND_ADDR:-127.0.0.1}` 或设置环境变量 `BIND_ADDR=0.0.0.0`
- 后端容器以 `node` 非特权用户运行
- 管理员密码通过环境变量注入，不进入代码仓库

## 配置说明

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | 服务编排、端口、卷、环境变量 |
| `Dockerfile` | 后端镜像（Node 22、非 root 用户） |
| `Dockerfile.frontend` | 前端镜像（Vite 开发服务器） |
| `Dockerfile.test` | E2E 测试镜像（Playwright + 编译工具链） |

关键环境变量（`docker-compose.yml`）：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `BIND_ADDR` | `127.0.0.1` | 端口绑定地址，云服务器设为 `0.0.0.0` |
| `STORAGE_TYPE` | `local` | 存储模式，可选 `local` 或 `rustfs` |
| `DB_PATH` | `/app/data/revachol.db` | 数据库文件路径 |
| `VITE_BACKEND_URL` | `http://backend:9999` | Vite 代理目标（Docker 内部网络） |

## 数据持久化

两个命名卷用于持久化数据：

| 卷名 | 挂载路径 | 内容 |
|------|----------|------|
| `revachol_data` | `/app/data` | SQLite 数据库文件（`revachol.db`） |
| `revachol_uploads` | `/app/uploads` | 贴纸图片文件（本地存储模式） |

这些卷在 `docker compose down` 后仍然保留。重置所有数据：`docker compose down -v`。

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

一个自然的想法是：先用 `node:22-alpine` 安装依赖，再把 `node_modules` 复制到 Playwright 镜像。但这**不可行**：

- 后端 Dockerfile 使用 `node:22-alpine`，其 C 运行时库为 **musl libc**
- Playwright 镜像基于 Ubuntu Noble（**glibc**）
- `bcrypt` 编译出的 `.node` 原生二进制与 libc 绑定 —— musl 编译的二进制在 glibc 系统上无法加载（`Error: invalid ELF header`）

要用多阶段构建，第一阶段必须使用 glibc 发行版（如 `node:22` 基于 Debian），但这会拉入 ~1GB 基础镜像，与直接在 Playwright 镜像中安装编译工具的增量（约 200MB，安装后清理）相比并无优势，且增加维护复杂度。

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
4. **健康检查**：`/api/health` 端点已就绪，可直接接入容器编排（K8s liveness probe）或外部监控
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
