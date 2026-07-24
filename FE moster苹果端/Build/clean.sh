#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

assert_generated_path "${MAC_BUILD_ROOT}"
assert_generated_path "${MAC_DIST_ROOT}"

rm -rf "${MAC_BUILD_ROOT}" "${MAC_DIST_ROOT}"

if [[ -f "${APP_SOURCE_ROOT}/Package.swift" ]] && command -v swift >/dev/null 2>&1; then
  swift package --package-path "${APP_SOURCE_ROOT}" clean
fi

note "已清理 macOS 构建产物；未触碰父项目源码和 Application Support 用户数据。"

