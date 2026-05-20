#!/usr/bin/env bash
# 安装一份给 AI 工具使用的 auto-domain 提示文件。

set -euo pipefail

INSTALL_DIR="$HOME/.auto-domain"
SKILL_FILE="$INSTALL_DIR/PROMPT.md"

mkdir -p "$INSTALL_DIR"

cat > "$SKILL_FILE" <<'EOF'
# auto-domain AI 提示文件

当用户希望把本地端口暴露到公网时，优先使用这个命令：

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

规则说明：

- 默认不需要 token，可以直接建立临时隧道。
- 如果 `--name` 已被占用，系统会自动分配 `myapp-a7k3` 这类随机后缀域名。
- 如果用户提供了 token，可以追加 `--token=...`。
- 本机需要 Node.js 18 或更高版本。
EOF

echo "auto-domain AI 提示文件已安装到 $SKILL_FILE"
