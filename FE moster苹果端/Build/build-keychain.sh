#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source "${SCRIPT_DIR}/common.sh"
[[ "$(uname -s)" == Darwin ]] || fail "Keychain JNI must be built on macOS."
JAVA_HOME_RESOLVED="$(require_java_17)"
NATIVE_ROOT="${MAC_BUILD_ROOT}/native"
mkdir -p "${NATIVE_ROOT}"
xcrun clang -dynamiclib -O2 -mmacosx-version-min=13.0 \
  -I "${JAVA_HOME_RESOLVED}/include" -I "${JAVA_HOME_RESOLVED}/include/darwin" \
  -framework Security -framework CoreFoundation \
  "${SOURCE_PROJECT_ROOT}/native/macos/fe_monster_keychain.c" \
  -o "${NATIVE_ROOT}/libfe-monster-keychain.dylib"
