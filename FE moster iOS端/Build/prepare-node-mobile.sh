#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CACHE_DIR="${FE_IOS_CACHE_DIR:-${PROJECT_DIR}/.cache/node-mobile}"
VENDOR_DIR="${PROJECT_DIR}/Vendor"

NODE_MOBILE_VERSION="18.20.4"
NODE_MOBILE_SHA256="8c5ca3a0d1e38de7f182a5642593e82593b820efd375a14b3ecafc4bcfee620e"
NODE_MOBILE_INFO_SHA256="0bba7f16ccd5f12107ff6256048df0078a28b7ec9a7dc87b9159cca2b057bd5a"
NODE_MOBILE_DEVICE_SHA256="ce90de875343c8e956e7927cfb40fd51acc63a43e434e4d996ea421718c3d870"
NODE_MOBILE_SIMULATOR_SHA256="fd0d5f0e759757e676c1f6381c0705652e393b7ba8572b95fcf1234217992219"
NODE_MOBILE_HEADER_SHA256="04b18176596bbd12493db39cb3c35e5da414d87721b402262389110e6216d96e"
NODE_MOBILE_MODULEMAP_SHA256="1881c3f3ef86ce608c22be89e4798672af1e30c23087343d1fa9ba3e6045ee55"
NODE_MOBILE_URL="https://github.com/nodejs-mobile/nodejs-mobile/releases/download/v${NODE_MOBILE_VERSION}/nodejs-mobile-v${NODE_MOBILE_VERSION}-ios.zip"
ARCHIVE="${CACHE_DIR}/nodejs-mobile-v${NODE_MOBILE_VERSION}-ios.zip"
FRAMEWORK="${VENDOR_DIR}/NodeMobile.xcframework"

case "${FRAMEWORK}" in
  "${VENDOR_DIR}/"*) ;;
  *)
    printf 'NodeMobile 目标路径不在 Vendor 目录内。\n' >&2
    exit 1
    ;;
esac

note() {
  printf '[FE Monster iOS] %s\n' "$1"
}

archive_hash() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print tolower($1)}'
  elif command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print tolower($1)}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$1" | awk '{print tolower($NF)}'
  else
    printf '系统缺少 SHA-256 校验工具。\n' >&2
    return 1
  fi
}

framework_is_verified() {
  [[ -f "${FRAMEWORK}/Info.plist" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64/NodeMobile.framework/NodeMobile" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/NodeMobile" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64/NodeMobile.framework/Headers/NodeMobile.h" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/Headers/NodeMobile.h" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64/NodeMobile.framework/Modules/module.modulemap" ]] || return 1
  [[ -f "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/Modules/module.modulemap" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/Info.plist")" == "${NODE_MOBILE_INFO_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64/NodeMobile.framework/NodeMobile")" == "${NODE_MOBILE_DEVICE_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/NodeMobile")" == "${NODE_MOBILE_SIMULATOR_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64/NodeMobile.framework/Headers/NodeMobile.h")" == "${NODE_MOBILE_HEADER_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/Headers/NodeMobile.h")" == "${NODE_MOBILE_HEADER_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64/NodeMobile.framework/Modules/module.modulemap")" == "${NODE_MOBILE_MODULEMAP_SHA256}" ]] || return 1
  [[ "$(archive_hash "${FRAMEWORK}/ios-arm64_x86_64-simulator/NodeMobile.framework/Modules/module.modulemap")" == "${NODE_MOBILE_MODULEMAP_SHA256}" ]] || return 1
}

mkdir -p "${CACHE_DIR}" "${VENDOR_DIR}"

if framework_is_verified; then
  note "NodeMobile.xcframework 已准备。"
  exit 0
fi

if [[ -f "${ARCHIVE}" ]] && [[ "$(archive_hash "${ARCHIVE}")" != "${NODE_MOBILE_SHA256}" ]]; then
  note "缓存校验失败，重新下载固定版本。"
  rm -f "${ARCHIVE}"
fi

if [[ ! -f "${ARCHIVE}" ]]; then
  PARTIAL="${ARCHIVE}.partial"
  rm -f "${PARTIAL}"
  note "下载 Node.js Mobile v${NODE_MOBILE_VERSION} iOS XCFramework。"
  curl --fail --location --retry 3 --output "${PARTIAL}" "${NODE_MOBILE_URL}"
  if [[ "$(archive_hash "${PARTIAL}")" != "${NODE_MOBILE_SHA256}" ]]; then
    rm -f "${PARTIAL}"
    printf 'NodeMobile 下载文件 SHA-256 不匹配。\n' >&2
    exit 1
  fi
  mv "${PARTIAL}" "${ARCHIVE}"
fi

STAGE_DIR="$(mktemp -d "${CACHE_DIR}/extract.XXXXXX")"
trap 'rm -rf "${STAGE_DIR}"' EXIT

if command -v ditto >/dev/null 2>&1; then
  ditto -x -k "${ARCHIVE}" "${STAGE_DIR}"
elif command -v unzip >/dev/null 2>&1; then
  unzip -q "${ARCHIVE}" 'NodeMobile.xcframework/*' -d "${STAGE_DIR}"
else
  printf '系统缺少 ZIP 解压工具。\n' >&2
  exit 1
fi
if [[ ! -f "${STAGE_DIR}/NodeMobile.xcframework/Info.plist" ]]; then
  printf 'NodeMobile 归档结构与预期不符。\n' >&2
  exit 1
fi

rm -rf "${FRAMEWORK}"
mv "${STAGE_DIR}/NodeMobile.xcframework" "${FRAMEWORK}"
if ! framework_is_verified; then
  rm -rf "${FRAMEWORK}"
  printf 'NodeMobile XCFramework 内部文件校验失败。\n' >&2
  exit 1
fi
note "NodeMobile.xcframework 校验并安装完成。"
