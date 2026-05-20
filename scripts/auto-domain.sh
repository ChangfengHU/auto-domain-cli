#!/usr/bin/env bash
# auto-domain — 一键为本地服务分配 *.vyibc.com 公网域名
# 用法: bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 [--name=myapp]

set -euo pipefail

CACHE_DIR="$HOME/.auto-domain"
CONFIG_FILE="$CACHE_DIR/config"
AGENT_JS="$CACHE_DIR/agent.js"
AGENT_PKG="$CACHE_DIR/package.json"
AGENT_URL="https://skill.vyibc.com/agent.js"
AUTO_DOMAIN_SERVER="${AUTO_DOMAIN_SERVER:-wss://tunnel-api.chxyka.ccwu.cc}"

mkdir -p "$CACHE_DIR"

# ── 解析参数 ──────────────────────────────────────────────
PORT=""
NAME=""
TOKEN=""
RESET=0

for arg in "$@"; do
  case "$arg" in
    --port=*)  PORT="${arg#--port=}"  ;;
    --name=*)  NAME="${arg#--name=}"  ;;
    --token=*) TOKEN="${arg#--token=}" ;;
    --reset)   RESET=1 ;;
    -h|--help)
      echo "用法: bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) [选项]"
      echo ""
      echo "选项:"
      echo "  --port=PORT    本地服务端口 (必填)"
      echo "  --name=NAME    自定义子域名 (可选，随机生成)"
      echo "  --token=TOKEN  访问令牌 (可选，会保存到本地配置)"
      echo "  --reset        清除本地缓存和配置重新初始化"
      echo ""
      echo "示例:"
      echo "  bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp"
      exit 0 ;;
  esac
done

# ── 重置 ──────────────────────────────────────────────────
if [[ "$RESET" == "1" ]]; then
  rm -rf "$CACHE_DIR"
  mkdir -p "$CACHE_DIR"
  echo "🗑  已清除缓存和配置"
fi

# ── 读取配置 ──────────────────────────────────────────────
[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE" 2>/dev/null || true

# ── Token ─────────────────────────────────────────────────
if [[ -z "$TOKEN" ]]; then
  TOKEN="${AUTO_DOMAIN_TOKEN:-}"
fi

if [[ -n "$TOKEN" ]]; then
  echo "AUTO_DOMAIN_TOKEN=$TOKEN" > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
fi

# ── 端口 ──────────────────────────────────────────────────
if [[ -z "$PORT" ]]; then
  read -rp "本地服务端口 (默认 3000): " PORT
  PORT="${PORT:-3000}"
fi

# ── 检查 Node.js ──────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "❌ 需要 Node.js (≥18)，请先安装: https://nodejs.org" >&2
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
if [[ "$NODE_VER" -lt 18 ]]; then
  echo "❌ Node.js 版本过低 (当前 v${NODE_VER})，需要 v18+" >&2
  exit 1
fi

# ── 下载 / 更新 agent ─────────────────────────────────────
if [[ ! -f "$AGENT_JS" ]]; then
  echo "⬇️  正在下载 auto-domain agent..."
  curl -fsSL "$AGENT_URL" -o "$AGENT_JS"
  echo '{"name":"auto-domain-agent","dependencies":{"ws":"^8.18.0"}}' > "$AGENT_PKG"
  echo "📦 安装依赖..."
  (cd "$CACHE_DIR" && npm install --silent --prefer-offline 2>/dev/null)
  echo "✅ 初始化完成"
  echo ""
fi

# ── 启动隧道 ──────────────────────────────────────────────
ARGS="--port=$PORT"
[[ -n "$TOKEN" ]] && ARGS="$ARGS --token=$TOKEN"
[[ -n "$NAME" ]] && ARGS="$ARGS --name=$NAME"
[[ -n "${AUTO_DOMAIN_SERVER:-}" ]] && ARGS="$ARGS --server=$AUTO_DOMAIN_SERVER"

echo "🚇 正在连接 auto-domain 隧道..."
echo ""

exec node "$AGENT_JS" $ARGS
