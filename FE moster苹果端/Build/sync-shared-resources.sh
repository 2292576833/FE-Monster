#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

[[ $# -eq 2 ]] || fail "用法：sync-shared-resources.sh <fe-monster-java.jar> <Contents/Resources>"

JAVA_JAR="$1"
RESOURCES_ROOT="$2"
APP_RESOURCES="${RESOURCES_ROOT}/App"

[[ -f "${JAVA_JAR}" ]] || fail "缺少 Java 后端：${JAVA_JAR}"
mkdir -p "${APP_RESOURCES}"

install -m 0644 "${JAVA_JAR}" "${APP_RESOURCES}/fe-monster-java.jar"
copy_tree "${SOURCE_PROJECT_ROOT}/web" "${APP_RESOURCES}/web"
copy_tree "${SOURCE_PROJECT_ROOT}/components" "${APP_RESOURCES}/components"

mkdir -p "${APP_RESOURCES}/scripts"
if [[ -f "${SOURCE_PROJECT_ROOT}/scripts/gesture_control.py" ]]; then
  install -m 0644 \
    "${SOURCE_PROJECT_ROOT}/scripts/gesture_control.py" \
    "${APP_RESOURCES}/scripts/gesture_control.py"
fi
if [[ -f "${SCRIPT_DIR}/gesture-requirements-macos.txt" ]]; then
  install -m 0644 \
    "${SCRIPT_DIR}/gesture-requirements-macos.txt" \
    "${APP_RESOURCES}/scripts/gesture-requirements.txt"
fi

if [[ -d "${SOURCE_PROJECT_ROOT}/plugins/community" ]]; then
  copy_tree \
    "${SOURCE_PROJECT_ROOT}/plugins/community" \
    "${APP_RESOURCES}/plugins/community"
fi

mkdir -p "${RESOURCES_ROOT}/Licenses"
install -m 0644 "${SOURCE_PROJECT_ROOT}/LICENSE" "${RESOURCES_ROOT}/Licenses/LICENSE"
if [[ -d "${SOURCE_PROJECT_ROOT}/LICENSES" ]]; then
  copy_tree "${SOURCE_PROJECT_ROOT}/LICENSES" "${RESOURCES_ROOT}/Licenses/LICENSES"
fi

PLUGIN_RESOURCES="${RESOURCES_ROOT}/API Plugins"
mkdir -p "${PLUGIN_RESOURCES}"
PLUGIN_COUNT=0
if [[ -d "${SOURCE_PROJECT_ROOT}/dist/plugins" ]]; then
  while IFS= read -r -d '' plugin_zip; do
    install -m 0644 "${plugin_zip}" "${PLUGIN_RESOURCES}/$(basename -- "${plugin_zip}")"
    PLUGIN_COUNT=$((PLUGIN_COUNT + 1))
  done < <(find "${SOURCE_PROJECT_ROOT}/dist/plugins" -maxdepth 1 -type f -name 'FE-Monster-*-API-Plugin-*.zip' -print0)
fi

if (( PLUGIN_COUNT == 0 )); then
  note "未找到已构建的 API 插件 ZIP；应用仍可运行，但登录页需要用户另行导入插件。"
else
  note "已附带 ${PLUGIN_COUNT} 个独立 API 插件 ZIP（不会自动导入）。"
fi

note "共享资源已暂存到：${RESOURCES_ROOT}"
