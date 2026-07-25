#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/dist/deployment"
OUTPUT_FILE="$OUTPUT_DIR/fridge-dinner-agent-cloudbase.zip"
TEMP_DIR="$(mktemp -d)"
TEMP_ZIP="$TEMP_DIR/fridge-dinner-agent-cloudbase.zip"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

cd "$ROOT_DIR"
npm run check
mkdir -p "$OUTPUT_DIR"

zip -q -r "$TEMP_ZIP" \
  Dockerfile \
  .dockerignore \
  package.json \
  package-lock.json \
  frontend/package.json \
  frontend/package-lock.json \
  frontend/vite.config.js \
  frontend/index.html \
  frontend/src \
  demo \
  assets \
  data/demo-cache \
  data/demo-users \
  data/case-memory \
  sliced \
  -x "*/.DS_Store" "*/node_modules/*" "*/dist/*" "*.log"

ARCHIVE_LIST="$(unzip -Z1 "$TEMP_ZIP")"

if printf '%s\n' "$ARCHIVE_LIST" | grep -E '(^|/)(\.git|\.env($|\.)|node_modules|local-users|local-cache)(/|$)' >/dev/null; then
  echo "部署包包含禁止上传的本地文件。" >&2
  exit 1
fi

if ! printf '%s\n' "$ARCHIVE_LIST" | grep -x "Dockerfile" >/dev/null; then
  echo "部署包根目录缺少 Dockerfile。" >&2
  exit 1
fi

mv -f "$TEMP_ZIP" "$OUTPUT_FILE"

echo "$OUTPUT_FILE"
shasum -a 256 "$OUTPUT_FILE"
