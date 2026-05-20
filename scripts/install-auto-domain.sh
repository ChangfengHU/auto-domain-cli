#!/usr/bin/env bash
# Install a small helper note for AI tools that can call auto-domain.

set -euo pipefail

INSTALL_DIR="$HOME/.auto-domain"
SKILL_FILE="$INSTALL_DIR/USAGE.md"

mkdir -p "$INSTALL_DIR"

cat > "$SKILL_FILE" <<'EOF'
# auto-domain

Use this command to expose a local service through a public Cloudflare URL:

```bash
bash <(curl -fsSL https://skill.vyibc.com/auto-domain.sh) --port=3000 --name=myapp
```

If `--name` is already in use, the service automatically allocates a safe suffix such as `myapp-a7k3`.
EOF

echo "auto-domain helper installed at $SKILL_FILE"
