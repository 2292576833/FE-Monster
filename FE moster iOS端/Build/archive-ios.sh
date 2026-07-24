#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ARCHIVE_PATH="${FE_IOS_ARCHIVE_PATH:-${PROJECT_DIR}/BuildOutput/FE-Monster-iOS.xcarchive}"

if [[ -z "${DEVELOPMENT_TEAM:-}" ]]; then
  printf '请先设置 DEVELOPMENT_TEAM（Apple Developer Team ID）。\n' >&2
  exit 1
fi

IDENTITY_COUNT="$(
  security find-identity -v -p codesigning 2>/dev/null \
    | awk '/valid identities found/ { print $1 }'
)"
if [[ -z "${IDENTITY_COUNT}" || "${IDENTITY_COUNT}" == "0" ]]; then
  printf '没有可用的 Apple 代码签名证书；Team ID 本身不足以完成真机归档。\n' >&2
  exit 1
fi

bash "${SCRIPT_DIR}/generate-project.sh"
mkdir -p "$(dirname "${ARCHIVE_PATH}")"

PROVISIONING_FLAGS=()
if [[ "${FE_IOS_ALLOW_PROVISIONING_UPDATES:-0}" == "1" ]]; then
  PROVISIONING_FLAGS+=("-allowProvisioningUpdates")
fi

xcodebuild \
  -project "${PROJECT_DIR}/FEMonsterIOS.xcodeproj" \
  -scheme FEMonsterIOS \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "${ARCHIVE_PATH}" \
  DEVELOPMENT_TEAM="${DEVELOPMENT_TEAM}" \
  "${PROVISIONING_FLAGS[@]}" \
  archive

printf '[FE Monster iOS] 真机归档完成：%s\n' "${ARCHIVE_PATH}"
