#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'Desktop geometry checks require the macOS AppKit/WebKit SDK.' >&2
  exit 1
fi
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/fe-monster-desktop-check.XXXXXX")"
trap 'rm -rf -- "$SCRATCH"' EXIT
xcrun swiftc -parse-as-library -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  "${SCRIPT_DIR}/../Sources/FEMonsterMac/DesktopWebSurface.swift" \
  "${SCRIPT_DIR}/check-desktop-geometry.swift" \
  -o "${SCRATCH}/desktop-geometry"
"${SCRATCH}/desktop-geometry"
