#!/usr/bin/env bash
# auto-domain unified runner

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CACHE_DIR="$HOME/.auto-domain"
CONFIG_FILE="$CACHE_DIR/config"
PID_FILE="$CACHE_DIR/agent.pid"
LOG_FILE="$CACHE_DIR/agent.log"
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
DAEMON=0
STOP=0

for arg in "$@"; do
  case "$arg" in
    --port=*) PORT="${arg#--port=}" ;;
    --name=*) NAME="${arg#--name=}" ;;
    --token=*) TOKEN="${arg#--token=}" ;;
    --reset) RESET=1 ;;
    --daemon) DAEMON=1 ;;
    --stop) STOP=1 ;;
    -h|--help)
      echo "Usage: $0 --port=3000 [--name=myapp] [--token=atd-xxxx] [--daemon] [--stop] [--reset]"
      exit 0
      ;;
  esac
done

if [[ "$RESET" == "1" ]]; then
  rm -rf "$CACHE_DIR"
  mkdir -p "$CACHE_DIR"
fi

if [[ "$STOP" == "1" ]]; then
  if [[ ! -f "$PID_FILE" ]]; then
    echo "No background agent is running."
    exit 0
  fi

  PID="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -z "$PID" ]]; then
    rm -f "$PID_FILE"
    echo "No background agent is running."
    exit 0
  fi

  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID" 2>/dev/null || true
    for _ in $(seq 1 20); do
      if ! kill -0 "$PID" 2>/dev/null; then
        break
      fi
      sleep 0.2
    done
    if kill -0 "$PID" 2>/dev/null; then
      kill -9 "$PID" 2>/dev/null || true
    fi
    echo "Stopped background agent (PID: $PID)."
  else
    echo "Background agent was not running."
  fi

  rm -f "$PID_FILE"
  exit 0
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

if [[ "$DAEMON" == "1" ]]; then
  if [[ -f "$PID_FILE" ]]; then
    OLD_PID="$(cat "$PID_FILE" 2>/dev/null || true)"
    if [[ -n "$OLD_PID" ]] && kill -0 "$OLD_PID" 2>/dev/null; then
      echo "Agent is already running in background (PID: $OLD_PID)."
      echo "Logs: tail -f $LOG_FILE"
      exit 0
    fi
    rm -f "$PID_FILE"
  fi

  : > "$LOG_FILE"
  nohup node "$AGENT_JS" $ARGS >>"$LOG_FILE" 2>&1 &
  PID=$!
  echo "$PID" > "$PID_FILE"

  echo "Agent started in background (PID: $PID)..."
  echo "Waiting for tunnel to come online..."
  echo ""

  READY=0
  for _ in $(seq 1 60); do
    if ! kill -0 "$PID" 2>/dev/null; then
      echo "Background agent exited unexpectedly."
      echo "Logs: tail -n 50 $LOG_FILE"
      rm -f "$PID_FILE"
      exit 1
    fi

    if grep -q "Tunnel is live" "$LOG_FILE" 2>/dev/null; then
      READY=1
      break
    fi
    sleep 1
  done

  if [[ "$READY" != "1" ]]; then
    echo "Timed out waiting for tunnel."
    echo "Logs: tail -f $LOG_FILE"
    exit 1
  fi

  PUBLIC_URL="$(grep "Public URL :" "$LOG_FILE" | tail -1 | sed 's/.*Public URL : //')"
  FORWARDING="$(grep "Forwarding :" "$LOG_FILE" | tail -1 | sed 's/.*Forwarding : //')"

  echo "Tunnel is live!"
  [[ -n "$PUBLIC_URL" ]] && echo "   Public URL : $PUBLIC_URL"
  [[ -n "$FORWARDING" ]] && echo "   Forwarding : $FORWARDING"
  echo "   Logs       : tail -f $LOG_FILE"
  echo "   Stop       : bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --stop"
  exit 0
fi

echo "Connecting auto-domain..."

exec node "$AGENT_JS" $ARGS
