#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source "${SCRIPT_DIR}/common.sh"
[[ $# -eq 1 ]] || fail "Usage: bundle-node.sh <App resources>"
DESTINATION="$1/runtime/node"
mkdir -p "${DESTINATION}"
if [[ -n "${FE_MONSTER_NODE_BINARY:-}" ]]; then
  [[ -x "${FE_MONSTER_NODE_BINARY}" ]] || fail "Invalid FE_MONSTER_NODE_BINARY."
  install -m 0755 "${FE_MONSTER_NODE_BINARY}" "${DESTINATION}/node"
  # Finder cannot resolve Homebrew dylibs on another user's machine.
  if otool -L "${DESTINATION}/node" | tail -n +2 | awk '{print $1}' | grep -Ev '^(/usr/lib/|/System/Library/)' >/dev/null; then
    fail "Node has external dylib dependencies; use the default official standalone Node build."
  fi
else
  VERSION=v24.21.0
  case "$(uname -m)" in
    arm64) ARCH=arm64; HASH=bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057 ;;
    x86_64) ARCH=x64; HASH=1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097 ;;
    *) fail "Unsupported macOS architecture." ;;
  esac
  ARCHIVE="node-${VERSION}-darwin-${ARCH}.tar.gz"
  CACHE="${MAC_BUILD_ROOT}/downloads"
  mkdir -p "${CACHE}"
  if [[ ! -f "${CACHE}/${ARCHIVE}" ]]; then
    curl --fail --location --retry 3 --connect-timeout 20 --max-time 300 \
      "https://nodejs.org/dist/${VERSION}/${ARCHIVE}" -o "${CACHE}/${ARCHIVE}.next"
    mv "${CACHE}/${ARCHIVE}.next" "${CACHE}/${ARCHIVE}"
  fi
  [[ "$(shasum -a 256 "${CACHE}/${ARCHIVE}" | awk '{print $1}')" == "${HASH}" ]] || fail "Node archive checksum mismatch."
  tar -xzf "${CACHE}/${ARCHIVE}" -C "${CACHE}"
  install -m 0755 "${CACHE}/node-${VERSION}-darwin-${ARCH}/bin/node" "${DESTINATION}/node"
  install -m 0644 "${CACHE}/node-${VERSION}-darwin-${ARCH}/LICENSE" "${DESTINATION}/LICENSE"
fi
lipo -verify_arch "$(uname -m)" "${DESTINATION}/node"
"${DESTINATION}/node" -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)'
