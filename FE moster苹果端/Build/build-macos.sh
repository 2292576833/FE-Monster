#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

SWIFT_PRODUCT="${FE_MONSTER_SWIFT_PRODUCT:-FEMonsterMac}"
APP_NAME="FE Monster"
APP_BUNDLE="${MAC_DIST_ROOT}/${APP_NAME}.app"
CONTENTS="${APP_BUNDLE}/Contents"
MACOS_DIR="${CONTENTS}/MacOS"
RESOURCES_DIR="${CONTENTS}/Resources"
JAVA_JAR="${MAC_BUILD_ROOT}/java/fe-monster-java.jar"

require_command swift
[[ -f "${APP_SOURCE_ROOT}/Package.swift" ]] || fail "缺少 Swift Package：${APP_SOURCE_ROOT}/Package.swift"
assert_generated_path "${APP_BUNDLE}"

bash "${SCRIPT_DIR}/build-java.sh" "${JAVA_JAR}"

note "构建 Swift/AppKit 壳：${SWIFT_PRODUCT}"
swift build \
  --package-path "${APP_SOURCE_ROOT}" \
  --configuration release \
  --product "${SWIFT_PRODUCT}"
SWIFT_BIN_ROOT="$(swift build \
  --package-path "${APP_SOURCE_ROOT}" \
  --configuration release \
  --show-bin-path)"
SWIFT_EXECUTABLE="${SWIFT_BIN_ROOT}/${SWIFT_PRODUCT}"
[[ -x "${SWIFT_EXECUTABLE}" ]] || fail "找不到 Swift 可执行文件：${SWIFT_EXECUTABLE}"

rm -rf "${APP_BUNDLE}"
mkdir -p "${MACOS_DIR}" "${RESOURCES_DIR}"
install -m 0755 "${SWIFT_EXECUTABLE}" "${MACOS_DIR}/${APP_NAME}"
install -m 0644 "${SCRIPT_DIR}/Info.plist" "${CONTENTS}/Info.plist"
printf 'APPL????' > "${CONTENTS}/PkgInfo"

bash "${SCRIPT_DIR}/sync-shared-resources.sh" "${JAVA_JAR}" "${RESOURCES_DIR}"

if [[ "${FE_MONSTER_BUNDLE_JRE:-1}" != "0" ]]; then
  JAVA_HOME_RESOLVED="$(require_java_17)"
  JLINK="${JAVA_HOME_RESOLVED}/bin/jlink"
  JDEPS="${JAVA_HOME_RESOLVED}/bin/jdeps"
  [[ -x "${JLINK}" ]] || fail "当前 JDK 不包含 jlink；设置 FE_MONSTER_BUNDLE_JRE=0 可改用系统 Java。"
  [[ -x "${JDEPS}" ]] || fail "当前 JDK 不包含 jdeps；设置 FE_MONSTER_BUNDLE_JRE=0 可改用系统 Java。"
  JAVA_MODULES="$("${JDEPS}" --ignore-missing-deps --print-module-deps "${JAVA_JAR}")"
  [[ -n "${JAVA_MODULES}" ]] || fail "无法计算 Java 运行时模块。"
  for required_module in java.net.http jdk.crypto.ec; do
    case ",${JAVA_MODULES}," in
      *,"${required_module}",*)
        ;;
      *)
        JAVA_MODULES="${JAVA_MODULES},${required_module}"
        ;;
    esac
  done
  note "生成随应用分发的精简 Java 运行时。"
  "${JLINK}" \
    --add-modules "${JAVA_MODULES}" \
    --strip-debug \
    --no-header-files \
    --no-man-pages \
    --output "${RESOURCES_DIR}/App/runtime/java"
fi

if [[ -n "${FE_MONSTER_NODE_BINARY:-}" ]]; then
  [[ -x "${FE_MONSTER_NODE_BINARY}" ]] || fail "FE_MONSTER_NODE_BINARY 不是可执行文件：${FE_MONSTER_NODE_BINARY}"
  mkdir -p "${RESOURCES_DIR}/App/runtime/node"
  install -m 0755 "${FE_MONSTER_NODE_BINARY}" "${RESOURCES_DIR}/App/runtime/node/node"
  note "已附带 Node.js：${FE_MONSTER_NODE_BINARY}"
fi

case "${FE_MONSTER_CODESIGN:-none}" in
  none)
    note "跳过代码签名。"
    ;;
  adhoc)
    require_command codesign
    codesign \
      --force \
      --deep \
      --sign - \
      --entitlements "${SCRIPT_DIR}/FE-Monster.entitlements" \
      "${APP_BUNDLE}"
    note "已进行本机测试用 ad-hoc 签名。"
    ;;
  *)
    require_command codesign
    codesign \
      --force \
      --deep \
      --sign "${FE_MONSTER_CODESIGN}" \
      --entitlements "${SCRIPT_DIR}/FE-Monster.entitlements" \
      "${APP_BUNDLE}"
    note "已使用指定身份签名；发布前仍需完成公证。"
    ;;
esac

note "macOS 应用已生成：${APP_BUNDLE}"
printf '%s\n' "${APP_BUNDLE}"
