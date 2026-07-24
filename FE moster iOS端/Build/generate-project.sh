#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

bash "${SCRIPT_DIR}/prepare-node-mobile.sh"
bash "${SCRIPT_DIR}/prepare-resources.sh"

if ! command -v xcodegen >/dev/null 2>&1; then
  printf '缺少 XcodeGen。请先执行：brew install xcodegen\n' >&2
  exit 1
fi

cd "${PROJECT_DIR}"
xcodegen generate --spec project.yml
printf '[FE Monster iOS] 已生成 %s/FEMonsterIOS.xcodeproj\n' "${PROJECT_DIR}"
