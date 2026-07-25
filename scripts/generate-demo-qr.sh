#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_URL="${1:-https://fridge-dinner-agent-281751-9-1304313771.sh.run.tcloudbase.com/}"
OUTPUT_FILE="${2:-$ROOT_DIR/assets/submission/fridge-dinner-agent-qr.png}"
CACHE_ROOT="${TMPDIR:-/tmp}/fridge-agent-qr-swift-cache"

mkdir -p "$(dirname "$OUTPUT_FILE")" "$CACHE_ROOT/clang" "$CACHE_ROOT/swift"

curl --fail --silent --show-error --location --get "https://quickchart.io/qr" \
  --data-urlencode "text=$TARGET_URL" \
  --data "size=1200" \
  --data "margin=4" \
  --data "ecLevel=H" \
  --data "dark=000000" \
  --data "light=ffffff" \
  --output "$OUTPUT_FILE"

env \
  CLANG_MODULE_CACHE_PATH="$CACHE_ROOT/clang" \
  SWIFT_MODULECACHE_PATH="$CACHE_ROOT/swift" \
  swift "$ROOT_DIR/scripts/verify-demo-qr.swift" "$OUTPUT_FILE" "$TARGET_URL"

echo "二维码已生成：$OUTPUT_FILE"
