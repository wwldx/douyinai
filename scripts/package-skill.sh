#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKILL_PARENT="$PROJECT_ROOT/submission/skill"
SKILL_NAME="fridge-dinner-visual-search"
OUTPUT_DIR="$PROJECT_ROOT/dist/submission"
OUTPUT_PATH="$OUTPUT_DIR/$SKILL_NAME.skill"

test -f "$SKILL_PARENT/$SKILL_NAME/SKILL.md"
mkdir -p "$OUTPUT_DIR"

(
  cd "$SKILL_PARENT"
  zip -q -r -FS "$OUTPUT_PATH" "$SKILL_NAME" -x "*/.DS_Store"
)

echo "$OUTPUT_PATH"
