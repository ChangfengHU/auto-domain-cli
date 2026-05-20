#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="auto-domain"
ZIP_URL="https://skill.vyibc.com/auto-domain/release/auto-domain-latest.zip"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Choose install target:"
  echo "  1) Codex        ~/.codex/skills"
  echo "  2) Cursor       ~/.cursor/skills"
  echo "  3) Claude       ~/.claude/skills"
  echo "  4) Gemini       ~/.gemini/skills"
  echo "  5) Agents       ~/.agents/skills"
  echo "  6) All"
  read -r -p "Target [1-6]: " CHOICE
  case "$CHOICE" in
    1) TARGET="codex" ;;
    2) TARGET="cursor" ;;
    3) TARGET="claude" ;;
    4) TARGET="gemini" ;;
    5) TARGET="agents" ;;
    6) TARGET="all" ;;
    *) echo "invalid target" >&2; exit 1 ;;
  esac
fi

case "$TARGET" in
  codex) DIRS=("$HOME/.codex/skills") ;;
  cursor) DIRS=("$HOME/.cursor/skills") ;;
  claude) DIRS=("$HOME/.claude/skills") ;;
  gemini) DIRS=("$HOME/.gemini/skills") ;;
  agents) DIRS=("$HOME/.agents/skills") ;;
  all) DIRS=("$HOME/.codex/skills" "$HOME/.cursor/skills" "$HOME/.claude/skills" "$HOME/.gemini/skills" "$HOME/.agents/skills") ;;
  *) echo "unsupported target: $TARGET" >&2; exit 1 ;;
esac

TMPWORK="$(mktemp -d /tmp/install-skill-XXXXXX)"
trap 'rm -rf "$TMPWORK"' EXIT

curl -fsSL "$ZIP_URL" -o "$TMPWORK/skill.zip"
mkdir -p "$TMPWORK/extracted"
if command -v unzip >/dev/null 2>&1; then
  unzip -q "$TMPWORK/skill.zip" -d "$TMPWORK/extracted"
else
  python3 -m zipfile -e "$TMPWORK/skill.zip" "$TMPWORK/extracted"
fi

for BASE_DIR in "${DIRS[@]}"; do
  mkdir -p "$BASE_DIR"
  rm -rf "$BASE_DIR/$SKILL_NAME"
  cp -R "$TMPWORK/extracted/$SKILL_NAME" "$BASE_DIR/$SKILL_NAME"
  find "$BASE_DIR/$SKILL_NAME/scripts" -name "*.sh" -exec chmod +x {} \; 2>/dev/null || true
  echo "installed: $BASE_DIR/$SKILL_NAME"
done
