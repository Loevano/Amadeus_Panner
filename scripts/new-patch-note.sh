#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <version> \"title\""
  echo "Example: $0 0.1.1 \"Scene recall reliability\""
  exit 1
fi

VERSION="$1"
TITLE="$2"
NOTES_FILE="PATCH_NOTES.md"
DATE_ONLY="$(date '+%Y-%m-%d')"

if [[ ! -f "$NOTES_FILE" ]]; then
  echo "Missing ${NOTES_FILE} in current directory"
  exit 1
fi

if rg -n "^## v${VERSION} - " "$NOTES_FILE" >/dev/null 2>&1; then
  echo "Patch section v${VERSION} already exists in ${NOTES_FILE}"
  exit 1
fi

{
  echo ""
  echo "## v${VERSION} - ${DATE_ONLY} - ${TITLE}"
  echo ""
  echo "### Added"
  echo "- "
  echo ""
  echo "### Changed"
  echo "- "
  echo ""
  echo "### Fixed"
  echo "- "
  echo ""
  echo "### Known Issues"
  echo "- "
} >> "$NOTES_FILE"

echo "Created patch note template for v${VERSION} in ${NOTES_FILE}"
