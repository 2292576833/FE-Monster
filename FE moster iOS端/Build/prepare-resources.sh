#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
GATEWAY_DIR="${PROJECT_DIR}/App/GeneratedResources/NodeGateway"

python3 "${SCRIPT_DIR}/prepare-resources.py"

if [[ "${FE_IOS_SKIP_NPM_CI:-0}" == "1" ]]; then
  printf '[FE Monster iOS] 已跳过 npm ci（仅用于静态检查）。\n'
  exit 0
fi

if ! command -v npm >/dev/null 2>&1; then
  printf '缺少 npm，无法准备 iOS 内置音乐服务。\n' >&2
  exit 1
fi

printf '[FE Monster iOS] 安装锁定的本地网关依赖。\n'
(
  cd "${GATEWAY_DIR}"
  npm ci \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --cache "${PROJECT_DIR}/.cache/npm"
)

remove_unused_dependency() {
  local dependency_name="$1"
  local dependency_path="${GATEWAY_DIR}/node_modules/${dependency_name}"

  case "${dependency_path}" in
    "${GATEWAY_DIR}/node_modules/"*) ;;
    *)
      printf '拒绝清理 NodeGateway/node_modules 之外的路径：%s\n' \
        "${dependency_path}" >&2
      exit 1
      ;;
  esac

  if [[ -d "${dependency_path}" ]]; then
    rm -rf -- "${dependency_path}"
  fi
  if [[ -e "${dependency_path}" ]]; then
    printf '未能移除不使用的依赖：%s\n' "${dependency_name}" >&2
    exit 1
  fi
}

# NeteaseCloudMusicApi declares these transitive parsers, but the fixed iOS
# adapter imports only login/search/song modules and never loads either parser.
remove_unused_dependency "music-metadata"
remove_unused_dependency "file-type"
printf '[FE Monster iOS] 已移除网关不使用的媒体解析依赖。\n'
