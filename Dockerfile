# REVACHOL 后端镜像：Node.js API + CrewAI Python 子进程
# 基于 node:22-bookworm-slim（glibc）：
#   - Alpine(musl) 下 lancedb==0.30.0（crewai 1.15.16 依赖）没有 musllinux wheel，
#     会导致 pip 无法解析依赖；Debian slim 提供 manylinux wheel，兼容性最好。
#   - bookworm 自带 Python 3.11，满足 crewai==1.15.16 的 Requires-Python >=3.10,<3.14。
#
# 构建说明：
#   - my_first_crew/.venv 在镜像内创建（Linux），与宿主机 Windows .venv 隔离；
#   - docker-compose 使用匿名卷 /app/my_first_crew/.venv 保留镜像内 venv，
#     避免宿主机 my_first_crew 目录绑定挂载覆盖它；
#   - my_first_crew/.env 不复制进镜像（密钥），运行时通过绑定挂载提供。

FROM node:22-bookworm-slim

WORKDIR /app

# ---- 系统依赖：Python3 / pip / venv / git / 编译工具链 ----
# build-essential + make + g++：bcrypt / better-sqlite3 等 Node 原生模块
# 与部分 Python wheel 需要本地编译；必须放在 COPY package*.json 之前，
# 确保 npm install 时 node-gyp 能找到 g++/make/python3（利用 Docker 层缓存）。
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3 \
        python3-pip \
        python3-venv \
        git \
        build-essential \
        make \
        g++ \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/python3 /usr/local/bin/python \
    && ln -sf /usr/bin/pip3 /usr/local/bin/pip

# ---- Node 依赖（生产模式，利用层缓存） ----
COPY package*.json ./
RUN npm install --production

# ---- Python 依赖（先复制 requirements.txt 单独安装，利用层缓存） ----
COPY my_first_crew/requirements.txt ./my_first_crew/requirements.txt
RUN python3 -m venv /app/my_first_crew/.venv \
    && /app/my_first_crew/.venv/bin/pip install --no-cache-dir --upgrade pip \
    && /app/my_first_crew/.venv/bin/pip install --no-cache-dir -r /app/my_first_crew/requirements.txt \
    # uv/uvx：document_admin 的 Git MCP 服务器（mcp-server-git）通过 uvx 启动
    && /app/my_first_crew/.venv/bin/pip install --no-cache-dir uv

# ---- 项目源码 ----
COPY backend/ ./
COPY my_first_crew/ ./my_first_crew/

# ---- 可执行权限 + 数据/输出目录 ----
RUN chmod +x /app/my_first_crew/run_revachol_crew.py \
    && mkdir -p /app/my_first_crew/output /app/data /app/uploads/decos \
    && chown -R node:node /app/my_first_crew /app/data /app/uploads

# ---- 运行时环境 ----
ENV DB_PATH=/app/data/revachol.db
ENV PORT=9999
ENV CREWAI_DISABLE_ASYNC=1
ENV PYTHONUNBUFFERED=1
# 显式指定容器内 Linux venv Python（后端 resolvePython 优先读取此变量）
ENV CREW_PYTHON=/app/my_first_crew/.venv/bin/python
# 将 venv bin 加入 PATH，确保 uvx 可直接调用
ENV PATH="/app/my_first_crew/.venv/bin:${PATH}"

USER node
EXPOSE 9999
CMD ["node", "server.cjs"]
