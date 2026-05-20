#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_NAME="auto-domain"
WORK_DIR="$(mktemp -d /tmp/auto-domain-skill-XXXXXX)"
trap 'rm -rf "$WORK_DIR"' EXIT
TS="$(date +%Y%m%d%H%M%S)"
RELEASE_PATH="auto-domain/release"

cp -R "$ROOT_DIR/skills/$SKILL_NAME" "$WORK_DIR/$SKILL_NAME"

ZIP_FILE="$WORK_DIR/${SKILL_NAME}-${TS}.zip"
python3 - <<PY
import os, zipfile
root = ${WORK_DIR@Q}
skill = ${SKILL_NAME@Q}
zip_path = ${ZIP_FILE@Q}
base = os.path.join(root, skill)
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
    for current, _, files in os.walk(base):
        for name in files:
            path = os.path.join(current, name)
            arc = os.path.relpath(path, root)
            z.write(path, arc)
PY

ZIP_JSON="$("$ROOT_DIR/scripts/upload-file.sh" --file "$ZIP_FILE" --name "${SKILL_NAME}-${TS}.zip" --path "$RELEASE_PATH")"
ZIP_URL="$(printf '%s' "$ZIP_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("image_url",""))')"
ZIP_URL_TS="${ZIP_URL}?ts=${TS}"

INSTALL_SCRIPT="$WORK_DIR/install-${SKILL_NAME}.sh"
sed "s|__ZIP_URL__|$ZIP_URL_TS|g; s|__SKILL_NAME__|$SKILL_NAME|g" "$ROOT_DIR/templates/install-skill.sh" > "$INSTALL_SCRIPT"
chmod +x "$INSTALL_SCRIPT"

"$ROOT_DIR/scripts/upload-file.sh" --file "$INSTALL_SCRIPT" --name "install-${SKILL_NAME}.sh" >/dev/null

echo "ZIP_URL=${ZIP_URL_TS}"
echo "INSTALL_COMMAND=bash <(curl -fsSL https://skill.vyibc.com/install-${SKILL_NAME}.sh?ts=${TS})"
