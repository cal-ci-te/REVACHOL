#!/usr/bin/env bash
# ============================================================
# REVACHOL Docker E2E 测试启动脚本
# 功能：构建测试镜像 → 启动依赖服务 → 运行测试 → 归档报告
# 用法：bash scripts/run-e2e-in-docker.sh [options]
#
# 选项：
#   --build       强制重新构建测试镜像
#   --archive     测试完成后自动归档报告到 run-history/
#   --serve       测试完成后启动 playwright-archive 仪表盘（端口 3200）
#   --ci          CI 模式：测试失败立即退出，不启动仪表盘
#   --help        显示帮助
# ============================================================

set -euo pipefail

# ---- 颜色输出 ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info()  { echo -e "${BLUE}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- 默认配置 ----
BUILD_FLAG=""
DO_ARCHIVE=false
DO_SERVE=false
CI_MODE=false

# ---- 解析参数 ----
while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)   BUILD_FLAG="--build" ;;
    --archive) DO_ARCHIVE=true ;;
    --serve)   DO_SERVE=true ;;
    --ci)      CI_MODE=true; DO_ARCHIVE=true ;;
    --help)
      echo "用法: bash scripts/run-e2e-in-docker.sh [--build] [--archive] [--serve] [--ci]"
      echo ""
      echo "  --build     强制重新构建测试镜像"
      echo "  --archive   测试完成后归档报告到 run-history/"
      echo "  --serve     测试后启动 playwright-archive 仪表盘（http://localhost:3200）"
      echo "  --ci        CI 模式：测试失败立即退出，自动归档"
      exit 0
      ;;
    *)
      log_error "未知参数: $1"
      exit 1
      ;;
  esac
  shift
done

# ---- 预检查：Docker 是否运行 ----
log_info "检查 Docker 环境..."
if ! docker info > /dev/null 2>&1; then
  log_error "Docker 未运行或权限不足，请启动 Docker Desktop"
  exit 1
fi
log_ok "Docker 运行中"

# ---- 预创建宿主机报告目录 ----
# bind mount 会覆盖镜像内的 chown，需在宿主机侧确保目录对容器内 pwuser(UID 1000) 可写
log_info "创建宿主机报告目录..."
mkdir -p playwright-report test-results run-history
chmod 777 playwright-report test-results run-history
log_ok "报告目录已就绪"

# ---- 确保依赖服务运行 ----
log_info "检查依赖服务状态..."
if ! docker compose ps backend 2>/dev/null | grep -q "Up"; then
  log_info "后端未运行，启动依赖服务..."
  docker compose up -d backend frontend
else
  log_info "依赖服务已在运行"
fi

# ---- 等待服务就绪 ----
log_info "等待前端服务就绪 (http://localhost:3000)..."
MAX_RETRIES=30
RETRY=0
while [[ $RETRY -lt $MAX_RETRIES ]]; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null | grep -q "200\|302\|304"; then
    log_ok "前端服务就绪 (尝试 $((RETRY+1)) 次)"
    break
  fi
  RETRY=$((RETRY + 1))
  sleep 2
done

if [[ $RETRY -eq $MAX_RETRIES ]]; then
  log_error "前端服务在 ${MAX_RETRIES} 次尝试后仍未就绪"
  log_info "请检查: docker compose logs frontend"
  exit 1
fi

log_info "等待后端服务就绪 (http://localhost:9999)..."
RETRY=0
while [[ $RETRY -lt $MAX_RETRIES ]]; do
  if curl -s -o /dev/null -w "%{http_code}" http://localhost:9999/api/articles 2>/dev/null | grep -q "200"; then
    log_ok "后端服务就绪 (尝试 $((RETRY+1)) 次)"
    break
  fi
  RETRY=$((RETRY + 1))
  sleep 2
done

if [[ $RETRY -eq $MAX_RETRIES ]]; then
  log_error "后端服务在 ${MAX_RETRIES} 次尝试后仍未就绪"
  log_info "请检查: docker compose logs backend"
  exit 1
fi

# ---- 构建并运行测试 ----
log_info "构建并运行 Playwright 测试容器..."
TEST_EXIT_CODE=0

docker compose run --rm \
  ${BUILD_FLAG} \
  -v "$(pwd)/playwright-report:/app/playwright-report" \
  -v "$(pwd)/test-results:/app/test-results" \
  -v "$(pwd)/run-history:/app/run-history" \
  playwright-tests \
  || TEST_EXIT_CODE=$?

# ---- 输出测试结果 ----
echo ""
if [[ $TEST_EXIT_CODE -eq 0 ]]; then
  log_ok "========================================"
  log_ok "  全部 E2E 测试通过！"
  log_ok "========================================"
else
  log_error "========================================"
  log_error "  E2E 测试失败 (exit code: $TEST_EXIT_CODE)"
  log_error "========================================"
fi

# ---- 归档报告（可选） ----
if $DO_ARCHIVE; then
  log_info "归档测试报告到 run-history/ ..."
  if [[ -d "playwright-report" ]]; then
    npx playwright-archive --archive 2>/dev/null || log_warn "playwright-archive 归档失败（可能未安装）"
    log_ok "报告已归档"
  else
    log_warn "未找到 playwright-report/ 目录，跳过归档"
  fi
fi

# ---- 启动仪表盘（可选） ----
if $DO_SERVE; then
  log_info "启动 playwright-archive 仪表盘 (http://localhost:3200) ..."
  npx playwright-archive --serve 2>/dev/null &
  ARCHIVE_PID=$!
  log_ok "仪表盘已启动 (PID: $ARCHIVE_PID)"
  log_info "按 Ctrl+C 停止仪表盘"
  # 在 CI 模式下不等待
  if ! $CI_MODE; then
    wait $ARCHIVE_PID 2>/dev/null || true
  fi
fi

echo ""
log_info "报告文件位置:"
log_info "  最新报告:   $(pwd)/playwright-report/"
log_info "  测试结果:   $(pwd)/test-results/"
log_info "  历史归档:   $(pwd)/run-history/"
log_info "  HTML 报告:  file://$(pwd)/playwright-report/index.html"

if $DO_SERVE; then
  log_info "  仪表盘:     http://localhost:3200"
fi

# 以测试结果作为脚本退出码
exit $TEST_EXIT_CODE
