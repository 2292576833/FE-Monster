#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
source "${SCRIPT_DIR}/common.sh"
DEPENDENCY_DIR="${MAC_BUILD_ROOT}/java/lib"
mkdir -p "${DEPENDENCY_DIR}"
require_command curl
require_command shasum

stage_dependency() {
  local name="$1" hash="$2" url="$3" target="${DEPENDENCY_DIR}/$1"
  local vendored="${SOURCE_PROJECT_ROOT}/third_party/java/local-memory/lib/$1"
  if [[ -f "${target}" ]] && [[ "$(shasum -a 256 "${target}" | awk '{print $1}')" == "${hash}" ]]; then return; fi
  if [[ -f "${vendored}" ]]; then
    cp "${vendored}" "${target}.next"
  else
    curl --fail --location --retry 3 --connect-timeout 20 --max-time 180 "${url}" -o "${target}.next"
  fi
  [[ "$(shasum -a 256 "${target}.next" | awk '{print $1}')" == "${hash}" ]] || fail "Java dependency checksum mismatch: ${name}"
  mv "${target}.next" "${target}"
}
stage_dependency sqlite-jdbc-3.53.2.1-without-natives.jar 4baeeb32cfb8ac3e5922e0fe50b8f78e4fe39d00f68824ce677a9477c686715b https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-without-natives.jar
stage_dependency sqlite-jdbc-3.53.2.1-natives-mac.jar 803ecf522fce27b320036ea4c84ac743ec42523e05aaa42d7848f4520599e1ee https://github.com/xerial/sqlite-jdbc/releases/download/3.53.2.1/sqlite-jdbc-3.53.2.1-natives-mac.jar
stage_dependency slf4j-api-1.7.36.jar d3ef575e3e4979678dc01bf1dcce51021493b4d11fb7f1be8ad982877c16a1c0 https://repo.maven.apache.org/maven2/org/slf4j/slf4j-api/1.7.36/slf4j-api-1.7.36.jar
