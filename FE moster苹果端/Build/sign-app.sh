#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source "${SCRIPT_DIR}/common.sh"
[[ $# -eq 2 ]] || fail "Usage: sign-app.sh <bundle> <identity>"
BUNDLE="$1"; IDENTITY="$2"
assert_generated_path "${BUNDLE}"
SIGN_OPTIONS=(--force --sign "${IDENTITY}")
if [[ "${IDENTITY}" != - ]]; then SIGN_OPTIONS+=(--options runtime --timestamp); fi
# Sign nested Mach-O code before sealing the enclosing app. Java/Node need
# JIT and SQLite's extracted native library; the window host does not.
while IFS= read -r -d '' binary; do
  if file -b "${binary}" | grep -q 'Mach-O'; then
    case "${binary}" in
      */runtime/java/bin/*|*/runtime/java/lib/jspawnhelper|*/runtime/node/node)
        codesign "${SIGN_OPTIONS[@]}" --entitlements "${SCRIPT_DIR}/Runtime.entitlements" "${binary}" ;;
      *) codesign "${SIGN_OPTIONS[@]}" "${binary}" ;;
    esac
  fi
done < <(find "${BUNDLE}/Contents/Resources" -type f -print0)
codesign "${SIGN_OPTIONS[@]}" --entitlements "${SCRIPT_DIR}/FE-Monster.entitlements" "${BUNDLE}"
codesign --verify --deep --strict "${BUNDLE}"
