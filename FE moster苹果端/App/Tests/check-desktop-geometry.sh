#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" != Darwin ]]; then
  printf '%s\n' 'Desktop geometry checks require the macOS AppKit/WebKit SDK.' >&2
  exit 1
fi
SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/fe-monster-desktop-check.XXXXXX")"
SMOKE_TEMPORARY_ROOT="$(CDPATH= cd -- "${TMPDIR:-/tmp}" && pwd -P)"
SMOKE_SCRATCH="$(mktemp -d "${SMOKE_TEMPORARY_ROOT}/fe-monster-native-ui.XXXXXX")"
trap 'rm -rf -- "$SCRATCH" "$SMOKE_SCRATCH"' EXIT
xcrun swiftc -parse-as-library -sdk "$(xcrun --sdk macosx --show-sdk-path)" \
  "${SCRIPT_DIR}/../Sources/FEMonsterMac/DesktopWebSurface.swift" \
  "${SCRIPT_DIR}/../Sources/FEMonsterMac/ClientOptions.swift" \
  "${SCRIPT_DIR}/check-desktop-geometry.swift" \
  -o "${SCRATCH}/desktop-geometry"
"${SCRATCH}/desktop-geometry" "${SMOKE_SCRATCH}/report.json" "${SCRATCH}/report.json"
