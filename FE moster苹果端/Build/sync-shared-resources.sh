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
assert_generated_path "${RESOURCES_ROOT}"
mkdir -p "${APP_RESOURCES}"

install -m 0644 "${JAVA_JAR}" "${APP_RESOURCES}/fe-monster-java.jar"
copy_tree "$(dirname -- "${JAVA_JAR}")/lib" "${APP_RESOURCES}/lib"
copy_tree "${SOURCE_PROJECT_ROOT}/web" "${APP_RESOURCES}/web"
copy_tree "${SOURCE_PROJECT_ROOT}/components" "${APP_RESOURCES}/components"

bash "${SCRIPT_DIR}/build-keychain.sh"
mkdir -p "${APP_RESOURCES}/native/macos"
install -m 0755 "${MAC_BUILD_ROOT}/native/libfe-monster-keychain.dylib" "${APP_RESOURCES}/native/macos/libfe-monster-keychain.dylib"
bash "${SOURCE_PROJECT_ROOT}/native/macos/build-audio.sh" "${MAC_BUILD_ROOT}/native" "$(uname -m)"
for library in libfe-monster-coreaudio.dylib libfe_monster_upmix.dylib; do
  install -m 0755 "${MAC_BUILD_ROOT}/native/${library}" "${APP_RESOURCES}/native/macos/${library}"
done

# Stage only the reviewed production modules and install their exact lockfile.
SOURCE_RUNTIME="${SOURCE_PROJECT_ROOT}/native/audio-sources"
TARGET_RUNTIME="${APP_RESOURCES}/native/audio-sources"
mkdir -p "${TARGET_RUNTIME}"
for module in "${SOURCE_RUNTIME}"/*.mjs; do
  install -m 0644 "${module}" "${TARGET_RUNTIME}/$(basename -- "${module}")"
done
for file in package.json package-lock.json THIRD_PARTY_NOTICES.md; do
  install -m 0644 "${SOURCE_RUNTIME}/${file}" "${TARGET_RUNTIME}/${file}"
done
npm ci --prefix "${TARGET_RUNTIME}" --omit=dev --ignore-scripts --no-audit --no-fund
[[ -f "${TARGET_RUNTIME}/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm" ]] || fail "QuickJS WASM is missing from the app."

mkdir -p "${APP_RESOURCES}/scripts"
install -m 0755 "${SCRIPT_DIR}/apply-client-update-macos.sh" "${APP_RESOURCES}/scripts/apply-client-update-macos.sh"

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
copy_tree "${SOURCE_PROJECT_ROOT}/third_party/java/local-memory" "${RESOURCES_ROOT}/Licenses/local-memory"
install -m 0644 "${SOURCE_PROJECT_ROOT}/native/rust-audio-upmix/THIRD-PARTY-NOTICES.md" "${RESOURCES_ROOT}/Licenses/Rust-Audio-THIRD-PARTY-NOTICES.md"
for license_file in LICENSE ABSEIL-LICENSE PFFFT-LICENSE; do
  install -m 0644 "${SOURCE_PROJECT_ROOT}/web/vendor/google-obr/${license_file}" "${RESOURCES_ROOT}/Licenses/Google-OBR-${license_file}"
done
# Dependency binaries belong next to the JAR, not in the license directory.
rm -rf "${RESOURCES_ROOT}/Licenses/local-memory/lib"

PLUGIN_RESOURCES="${RESOURCES_ROOT}/API Plugins"
mkdir -p "${PLUGIN_RESOURCES}"
bash "${SCRIPT_DIR}/build-music-apis.sh"
mkdir -p "${APP_RESOURCES}/plugins/music-api"
for provider in netease qq kugou qishui; do
  version="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version' "${SOURCE_PROJECT_ROOT}/music-api-plugins/${provider}/music-api-package.json")"
  case "${provider}" in
    netease) plugin_name="FE-Monster-Netease-API-Plugin-${version}.zip" ;;
    qq) plugin_name="FE-Monster-QQ-API-Plugin-${version}.zip" ;;
    kugou) plugin_name="FE-Monster-Kugou-API-Plugin-${version}.zip" ;;
    qishui) plugin_name="FE-Monster-Qishui-OpenAPI-Plugin-${version}.zip" ;;
  esac
  plugin_zip="${MAC_BUILD_ROOT}/plugins/${plugin_name}"
  [[ -f "${plugin_zip}" ]] || fail "Music API payload missing: ${plugin_name}"
  install -m 0644 "${plugin_zip}" "${APP_RESOURCES}/plugins/music-api/$(basename -- "${plugin_zip}")"
  install -m 0644 "${plugin_zip}" "${PLUGIN_RESOURCES}/$(basename -- "${plugin_zip}")"
done
note "已附带当前四个平台音乐 API，首次启动自动配置。"

note "共享资源已暂存到：${RESOURCES_ROOT}"
