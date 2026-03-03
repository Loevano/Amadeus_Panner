#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 \"change summary\""
  exit 1
fi

SUMMARY="$*"
STAMP="$(date '+%Y-%m-%d %H:%M %Z')"

{
  echo ""
  echo "## ${STAMP}"
  echo "- ${SUMMARY}"
} >> "CHANGELOG.md"

echo "Logged change at ${STAMP}"
