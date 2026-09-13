#!/usr/bin/env bash
# ！后端健康检查
# 独立的健康探针：既可直接判定 /api/health，也可 --wait 轮询等服务就绪，
# 供本地排查与 CI 前置步骤复用；不依赖 jq，只用 curl + grep。
# 用法：
#   bash scripts/test-health.sh              # 单次检查，返回退出码
#   bash scripts/test-health.sh --json       # 输出 JSON 格式
#   bash scripts/test-health.sh --wait       # 等待服务就绪（最多 60s）
#   bash scripts/test-health.sh --help       # 显示帮助
#
# 退出码：
#   0 — 服务健康（status: "ok"）
#   1 — 服务异常（degraded / unreachable / 超时）

set -euo pipefail

# 配置（可通过环境变量覆盖）
# 地址与轮询参数外提，便于在不改脚本的情况下复用到其它端口或环境
HEALTH_URL="${HEALTH_URL:-http://localhost:9999/api/health}"
# --wait 最大等待秒数
MAX_WAIT="${MAX_WAIT:-60}"
# 轮询间隔秒数
RETRY_INTERVAL="${RETRY_INTERVAL:-2}"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
# NC 即 No Color，重置序列；每处彩色输出后都要接它，否则后续终端文字会串色
NC='\033[0m'

# 日志一律写 stderr：--json 模式要求 stdout 只含 JSON，日志混入会污染输出
log_info()  { echo -e "${BLUE}[INFO]${NC}  $*" >&2; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*" >&2; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# 参数
JSON_MODE=false
WAIT_MODE=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json) JSON_MODE=true ;;
    --wait) WAIT_MODE=true ;;
    --help|-h)
      echo "REVACHOL 健康检查脚本"
      echo ""
      echo "用法: bash scripts/test-health.sh [选项]"
      echo ""
      echo "选项:"
      echo "  --json      以 JSON 格式输出健康状态"
      echo "  --wait      等待服务就绪（最多 ${MAX_WAIT}s，间隔 ${RETRY_INTERVAL}s）"
      echo "  --help      显示此帮助"
      echo ""
      echo "环境变量:"
      echo "  HEALTH_URL        健康检查地址（默认 http://localhost:9999/api/health）"
      echo "  MAX_WAIT          最大等待秒数（默认 60）"
      echo "  RETRY_INTERVAL    轮询间隔秒数（默认 2）"
      echo ""
      echo "退出码:  0 = 健康  1 = 异常"
      exit 0
      ;;
    *)
      log_error "未知参数: $1（使用 --help 查看帮助）"
      exit 2
      ;;
  esac
  shift
done

# 单次检查
# 判据是「HTTP 200 且响应体 status 为 ok」：只看状态码会漏掉 degraded 的降级响应
check_health() {
  local response http_code curl_exit

  # -s 静默 -w 输出 HTTP 状态码 -o 响应体写临时文件 --max-time 限超时，
  # 避免服务半开时把整个脚本拖死
  response=$(mktemp)
  http_code=$(curl -s -o "$response" -w "%{http_code}" --max-time 5 "$HEALTH_URL" 2>/dev/null) || {
    curl_exit=$?
    rm -f "$response"
    return 1
  }

  if [[ "$http_code" != "200" ]]; then
    rm -f "$response"
    return 1
  fi

  # 用 grep 提取 status 字段而不依赖 jq：本脚本要能在未装 jq 的 CI 镜像里跑
  local status_line
  status_line=$(grep -o '"status"[[:space:]]*:[[:space:]]*"[^"]*"' "$response" 2>/dev/null || true)
  rm -f "$response"

  if echo "$status_line" | grep -q '"ok"'; then
    return 0
  fi
  return 1
}

# 等待模式
if $WAIT_MODE; then
  log_info "等待服务就绪 ($HEALTH_URL)..."
  # 既有缺陷（本次仅登记不改）：local 在函数外使用，bash 会报
  # 「can only be used in a function」并以非 0 退出，--wait 模式实际不可用
  local elapsed=0
  while [[ $elapsed -lt $MAX_WAIT ]]; do
    if check_health; then
      log_ok "服务就绪（耗时 ${elapsed}s）"

      if $JSON_MODE; then
        curl -s --max-time 5 "$HEALTH_URL"
      else
        echo "✅ 服务健康 (200)"
      fi
      exit 0
    fi
    sleep "$RETRY_INTERVAL"
    elapsed=$((elapsed + RETRY_INTERVAL))
    echo -n "." >&2
  done

  echo "" >&2
  log_error "服务在 ${MAX_WAIT}s 内未就绪"
  exit 1
fi

# 单次检查模式
if check_health; then
  if $JSON_MODE; then
    curl -s --max-time 5 "$HEALTH_URL"
  else
    echo "✅ 服务健康 (200)"
  fi
  exit 0
else
  if $JSON_MODE; then
    echo '{"status":"unreachable","error":"health check failed"}'
  else
    echo "❌ 服务异常"
  fi
  exit 1
fi
