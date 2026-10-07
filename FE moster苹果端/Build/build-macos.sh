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
require_command node
require_command npm
require_command curl
require_command shasum
require_supported_macos
node -e 'if(Number(process.versions.node.split(".")[0])<20)process.exit(1)' || fail "Build requires Node.js 20+."
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
# Keep the app version tied to the shared product manifest.
VERSION="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version' "${SOURCE_PROJECT_ROOT}/package.json")"
DISPLAY_VERSION="$(node -p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));p.displayVersion||p.version' "${SOURCE_PROJECT_ROOT}/package.json")"
/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${VERSION}" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :FEMonsterDisplayVersion ${DISPLAY_VERSION}" "${CONTENTS}/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${VERSION}" "${CONTENTS}/Info.plist"
printf 'APPL????' > "${CONTENTS}/PkgInfo"

require_command iconutil
ICONSET_DIR="${SCRIPT_DIR}/AppIcon.iconset"
[[ -d "${ICONSET_DIR}" ]] || fail "Missing macOS app icon set: ${ICONSET_DIR}"
iconutil -c icns "${ICONSET_DIR}" -o "${RESOURCES_DIR}/FE-Monster.icns"

bash "${SCRIPT_DIR}/sync-shared-resources.sh" "${JAVA_JAR}" "${RESOURCES_DIR}"

if [[ "${FE_MONSTER_BUNDLE_JRE:-1}" != "0" ]]; then
  JAVA_HOME_RESOLVED="$(require_java_17)"
  JLINK="${JAVA_HOME_RESOLVED}/bin/jlink"
  JDEPS="${JAVA_HOME_RESOLVED}/bin/jdeps"
  [[ -x "${JLINK}" ]] || fail "当前 JDK 不包含 jlink；设置 FE_MONSTER_BUNDLE_JRE=0 可改用系统 Java。"
  [[ -x "${JDEPS}" ]] || fail "当前 JDK 不包含 jdeps；设置 FE_MONSTER_BUNDLE_JRE=0 可改用系统 Java。"
  JAVA_MODULES="$("${JDEPS}" --ignore-missing-deps --multi-release 17 --class-path "${MAC_BUILD_ROOT}/java/lib/*" --print-module-deps "${JAVA_JAR}")"
  [[ -n "${JAVA_MODULES}" ]] || fail "无法计算 Java 运行时模块。"
  for required_module in java.net.http jdk.crypto.ec java.sql java.naming jdk.unsupported jdk.zipfs; do
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

bash "${SCRIPT_DIR}/bundle-node.sh" "${RESOURCES_DIR}/App"
if [[ -x "${RESOURCES_DIR}/App/runtime/java/bin/java" ]]; then
  lipo "${RESOURCES_DIR}/App/runtime/java/bin/java" -verify_arch "$(uname -m)"
fi

case "${FE_MONSTER_CODESIGN:-none}" in
  none)
    note "跳过代码签名。"
    ;;
  adhoc)
    require_command codesign
    bash "${SCRIPT_DIR}/sign-app.sh" "${APP_BUNDLE}" -
    note "已进行本机测试用 ad-hoc 签名。"
    ;;
  *)
    require_command codesign
    bash "${SCRIPT_DIR}/sign-app.sh" "${APP_BUNDLE}" "${FE_MONSTER_CODESIGN}"
    note "已使用指定身份签名；发布前仍需完成公证。"
    ;;
esac

if [[ "${FE_MONSTER_DMG:-1}" != "0" ]]; then
  DMG_ROOT="${MAC_BUILD_ROOT}/dmg"
  assert_generated_path "${DMG_ROOT}"
  rm -rf "${DMG_ROOT}"
  mkdir -p "${DMG_ROOT}"
  ditto "${APP_BUNDLE}" "${DMG_ROOT}/${APP_NAME}.app"
  ln -s /Applications "${DMG_ROOT}/Applications"
  DMG_PATH="${MAC_DIST_ROOT}/FE-Monster-${DISPLAY_VERSION}-$(uname -m).dmg"
  hdiutil create -volname "FE Monster" -srcfolder "${DMG_ROOT}" -ov -format UDZO "${DMG_PATH}"
  # Use a relative filename so downloaded checksums work on the user's Mac.
  (cd "${MAC_DIST_ROOT}" && shasum -a 256 "$(basename -- "${DMG_PATH}")" > "$(basename -- "${DMG_PATH}").sha256")
fi

note "macOS 应用已生成：${APP_BUNDLE}"
printf '%s\n' "${APP_BUNDLE}"
