#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

SWIFT_PRODUCT="${FE_MONSTER_SWIFT_PRODUCT:-FEMonsterMac}"
JAVA_JAR="${MAC_BUILD_ROOT}/java/fe-monster-java.jar"
JAVA_HOME_RESOLVED="$(require_java_17)"

require_command swift
require_command node
require_command npm
require_supported_macos
[[ -f "${APP_SOURCE_ROOT}/Package.swift" ]] || fail "缺少 Swift Package：${APP_SOURCE_ROOT}/Package.swift"

bash "${SCRIPT_DIR}/build-java.sh" "${JAVA_JAR}"
DEV_RESOURCES="${MAC_BUILD_ROOT}/dev/Resources"
bash "${SCRIPT_DIR}/sync-shared-resources.sh" "${JAVA_JAR}" "${DEV_RESOURCES}"
bash "${SCRIPT_DIR}/bundle-node.sh" "${DEV_RESOURCES}/App"

export FE_MONSTER_ROOT="${DEV_RESOURCES}/App"
export FE_MONSTER_WEB_ROOT="${SOURCE_PROJECT_ROOT}/web"
export FE_MONSTER_DATA_DIR="${FE_MONSTER_DATA_DIR:-${HOME}/Library/Application Support/FE Monster}"
export FE_MONSTER_JAR="${JAVA_JAR}"
export FE_MONSTER_JAVA="${FE_MONSTER_JAVA:-${JAVA_HOME_RESOLVED}/bin/java}"
export FE_MONSTER_DEV="1"

mkdir -p "${FE_MONSTER_DATA_DIR}"

note "开发数据目录：${FE_MONSTER_DATA_DIR}"
note "启动 Swift/AppKit + WKWebView 开发壳。"
exec swift run \
  --package-path "${APP_SOURCE_ROOT}" \
  "${SWIFT_PRODUCT}" \
  "$@"

