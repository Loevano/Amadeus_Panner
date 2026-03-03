#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <show-id>"
  exit 1
fi

SHOW_ID="$1"
TARGET_DIR="showfiles/${SHOW_ID}"

if [[ -d "$TARGET_DIR" ]]; then
  echo "Show already exists: $TARGET_DIR"
  exit 1
fi

mkdir -p "$TARGET_DIR/actions" "$TARGET_DIR/scenes"
cp -f "showfiles/_template/show.json" "$TARGET_DIR/show.json"
cp -f "showfiles/_template/scenes/scene-intro.json" "$TARGET_DIR/scenes/scene-intro.json"
cp -f "showfiles/_template/actions/action-fly-in.json" "$TARGET_DIR/actions/action-fly-in.json"

echo "Created $TARGET_DIR from template"
