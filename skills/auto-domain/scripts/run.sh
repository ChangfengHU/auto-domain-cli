#!/usr/bin/env bash
# auto-domain unified runner

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$HOME/.auto-domain"
CONFIG_FILE="$CACHE_DIR/config"
AUTO_DOMAIN_SERVER="${AUTO_DOMAIN_SERVER:-wss://tunnel-api.chxyka.ccwu.cc}"
AGENT_URL="${AGENT_URL:-https://skill.vyibc.com/agent.js}"

if [[ -f "$SKILL_DIR/agent/agent.js" ]]; then
  AGENT_DIR="$SKILL_DIR/agent"
  AGENT_JS="$AGENT_DIR/agent.js"
  AGENT_PKG="$AGENT_DIR/package.json"
  AGENT_MODE="installed-skill"
else
  AGENT_DIR="$CACHE_DIR"
  AGENT_JS="$CACHE_DIR/agent.js"
  AGENT_PKG="$CACHE_DIR/package.json"
  AGENT_MODE="direct-cli"
fi

mkdir -p "$CACHE_DIR"

PORT=""
NAME=""
TOKEN=""
RESET=0

for arg in "$@"; do
  case "$arg" in
    --port=*) PORT="${arg#--port=}" ;;
    --name=*) NAME="${arg#--name=}" ;;
    --token=*) TOKEN="${arg#--token=}" ;;
    --reset) RESET=1 ;;
    -h|--help)
      echo "Usage: $0 --port=3000 [--name=myapp] [--token=atd-xxxx] [--reset]"
      exit 0
      ;;
  esac
done

if [[ "$RESET" == "1" ]]; then
  rm -rf "$CACHE_DIR"
  mkdir -p "$CACHE_DIR"
fi

[[ -f "$CONFIG_FILE" ]] && source "$CONFIG_FILE" 2>/dev/null || true

if [[ -z "$TOKEN" ]]; then
  TOKEN="${AUTO_DOMAIN_TOKEN:-}"
fi

if [[ -n "$TOKEN" ]]; then
  echo "AUTO_DOMAIN_TOKEN=$TOKEN" > "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
fi

if [[ -z "$PORT" ]]; then
  read -rp "Local port (default 3000): " PORT
  PORT="${PORT:-3000}"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js >= 18 is required" >&2
  exit 1
fi

NODE_VER=$(node -e "process.stdout.write(process.version.replace('v','').split('.')[0])")
if [[ "$NODE_VER" -lt 18 ]]; then
  echo "Node.js >= 18 is required" >&2
  exit 1
fi

if [[ "$AGENT_MODE" == "direct-cli" && ! -f "$AGENT_JS" ]]; then
  echo "Downloading auto-domain agent..."
  curl -fsSL "$AGENT_URL" -o "$AGENT_JS"
fi

if [[ ! -f "$AGENT_PKG" ]]; then
  cat > "$AGENT_PKG" <<'EOF'
{"name":"auto-domain-agent","private":true,"dependencies":{"ws":"^8.18.0"}}
EOF
fi

if [[ ! -d "$AGENT_DIR/node_modules/ws" ]]; then
  echo "Installing auto-domain agent dependencies..."
  (cd "$AGENT_DIR" && npm install --silent --prefer-offline)
fi

ARGS="--port=$PORT"
[[ -n "$TOKEN" ]] && ARGS="$ARGS --token=$TOKEN"
[[ -n "$NAME" ]] && ARGS="$ARGS --name=$NAME"
[[ -n "${AUTO_DOMAIN_SERVER:-}" ]] && ARGS="$ARGS --server=$AUTO_DOMAIN_SERVER"

echo "Connecting auto-domain..."

exec node "$AGENT_JS" $ARGS
