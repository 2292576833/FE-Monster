#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DERIVED_DATA="${FE_IOS_DERIVED_DATA:-${PROJECT_DIR}/DerivedData}"
CONFIGURATION="${FE_IOS_CONFIGURATION:-Debug}"

bash "${SCRIPT_DIR}/generate-project.sh"

xcodebuild \
  -project "${PROJECT_DIR}/FEMonsterIOS.xcodeproj" \
  -scheme FEMonsterIOS \
  -configuration "${CONFIGURATION}" \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "${DERIVED_DATA}" \
  CODE_SIGNING_ALLOWED=NO \
  build

printf '[FE Monster iOS] 模拟器构建完成：%s\n' \
  "${DERIVED_DATA}/Build/Products/${CONFIGURATION}-iphonesimulator/FE Monster.app"
