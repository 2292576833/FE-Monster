#!/usr/bin/env bash

set -euo pipefail

BUILD_SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
MAC_PROJECT_ROOT="$(CDPATH= cd -- "${BUILD_SCRIPT_DIR}/.." && pwd)"
SOURCE_PROJECT_ROOT="$(CDPATH= cd -- "${MAC_PROJECT_ROOT}/.." && pwd)"
APP_SOURCE_ROOT="${MAC_PROJECT_ROOT}/App"
MAC_BUILD_ROOT="${MAC_PROJECT_ROOT}/.build-macos"
MAC_DIST_ROOT="${MAC_PROJECT_ROOT}/dist"

fail() {
  printf 'FE Monster macOS: %s\n' "$*" >&2
  exit 1
}

note() {
  printf 'FE Monster macOS: %s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "缺少命令：$1"
}

assert_generated_path() {
  local candidate="$1"
  case "${candidate}" in
    *"/../"*|*/..|../*|..)
      fail "生成路径不能包含父目录跳转：${candidate}"
      ;;
  esac
  case "${candidate}" in
    "${MAC_BUILD_ROOT}"|"${MAC_BUILD_ROOT}/"*|"${MAC_DIST_ROOT}"|"${MAC_DIST_ROOT}/"*)
      ;;
    *)
      fail "拒绝修改生成目录之外的路径：${candidate}"
      ;;
  esac
}

resolve_java_home() {
  local candidate
  for candidate in "${FE_JAVA_HOME:-}" "${JAVA_HOME:-}"; do
    if [[ -n "${candidate}" && -x "${candidate}/bin/javac" && -x "${candidate}/bin/java" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  done

  if [[ -x /usr/libexec/java_home ]]; then
    candidate="$(/usr/libexec/java_home -v '17+' 2>/dev/null || true)"
    if [[ -n "${candidate}" && -x "${candidate}/bin/javac" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  if command -v javac >/dev/null 2>&1; then
    candidate="$(CDPATH= cd -- "$(dirname -- "$(command -v javac)")/.." && pwd)"
    if [[ -x "${candidate}/bin/java" ]]; then
      printf '%s\n' "${candidate}"
      return 0
    fi
  fi

  return 1
}

require_java_17() {
  local java_home version major
  java_home="$(resolve_java_home)" || fail "需要 JDK 17 或更高版本；可通过 FE_JAVA_HOME 指定。"
  version="$("${java_home}/bin/javac" -version 2>&1)"
  major="$(printf '%s\n' "${version}" | sed -E 's/^[^0-9]*([0-9]+).*/\1/')"
  [[ "${major}" =~ ^[0-9]+$ ]] || fail "无法识别 Java 版本：${version}"
  (( major >= 17 )) || fail "需要 JDK 17 或更高版本，当前为：${version}"
  printf '%s\n' "${java_home}"
}

copy_tree() {
  local source="$1"
  local destination="$2"
  [[ -d "${source}" ]] || fail "缺少资源目录：${source}"
  mkdir -p "${destination}"
  if command -v ditto >/dev/null 2>&1; then
    ditto "${source}" "${destination}"
  else
    cp -R "${source}/." "${destination}/"
  fi
}
