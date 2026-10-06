#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

REBUILD=0
if [[ $# -gt 0 ]]; then
  [[ $# -eq 1 && "$1" == --rebuild ]] || fail "用法：build-music-apis.sh [--rebuild]"
  REBUILD=1
fi

for command in node npm zip unzip tar; do require_command "${command}"; done

PLUGIN_SOURCE_ROOT="${SOURCE_PROJECT_ROOT}/music-api-plugins"
PLUGIN_OUTPUT_ROOT="${MAC_BUILD_ROOT}/plugins"
PLUGIN_BUILD_ROOT="${MAC_BUILD_ROOT}/music-api-build"
KUGOU_COMMIT="283f1e97b110726b208a64b486a657c0fc0a6126"
assert_generated_path "${PLUGIN_BUILD_ROOT}"
assert_generated_path "${PLUGIN_OUTPUT_ROOT}"
mkdir -p "${PLUGIN_BUILD_ROOT}" "${PLUGIN_OUTPUT_ROOT}"

sha256_file() {
  node -e 'const fs=require("node:fs"),crypto=require("node:crypto");process.stdout.write(crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex"));' "$1"
}

manifest_value() {
  node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(String(process.argv[2]==="entry"?value.launcher?.entry:value[process.argv[2]]));' "$1" "$2"
}

validate_plugin() {
  local archive="$1" id="$2" version="$3" entry="$4"
  [[ -f "${archive}" ]] || return 1
  # Inspect declared ZIP sizes before decompressing anything. These are the
  # same 25 MiB/16 MiB/100 MiB/256-entry limits used by the desktop importer.
  node - "${archive}" <<'NODE' || return 1
const fs = require('node:fs');
const archive = process.argv[2];
const size = fs.statSync(archive).size;
if (size > 25 * 1024 * 1024) throw new Error('Plugin ZIP exceeds 25 MiB');
const zip = fs.readFileSync(archive);
let end = -1;
for (let offset = zip.length - 22; offset >= Math.max(0, zip.length - 65557); offset--) {
  if (zip.readUInt32LE(offset) === 0x06054b50 && offset + 22 + zip.readUInt16LE(offset + 20) === zip.length) { end = offset; break; }
}
if (end < 0) throw new Error('Plugin ZIP end record is missing');
const count = zip.readUInt16LE(end + 10);
if (!count || count > 256 || zip.readUInt16LE(end + 4) || zip.readUInt16LE(end + 6)) throw new Error('Invalid plugin ZIP entry count or split archive');
let offset = zip.readUInt32LE(end + 16), expanded = 0;
const names = new Set();
for (let index = 0; index < count; index++) {
  if (offset + 46 > end || zip.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid plugin ZIP directory');
  const bytes = zip.readUInt32LE(offset + 24), nameBytes = zip.readUInt16LE(offset + 28);
  const name = zip.subarray(offset + 46, offset + 46 + nameBytes).toString('utf8');
  if (!name || /[\\\x00]/.test(name) || name.startsWith('/') || name.split('/').includes('..') || names.has(name)) throw new Error('Unsafe plugin ZIP entry');
  if (bytes > 16 * 1024 * 1024 || (zip.readUInt16LE(offset + 8) & 1)) throw new Error('Oversized or encrypted plugin entry');
  if (((zip.readUInt32LE(offset + 38) >>> 16) & 0xf000) === 0xa000) throw new Error('Plugin ZIP must not contain symlinks');
  expanded += bytes;
  names.add(name);
  offset += 46 + nameBytes + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32);
}
if (expanded > 100 * 1024 * 1024 || !names.has('music-api-package.json')) throw new Error('Plugin ZIP exceeds import limits or has no root manifest');
NODE
  unzip -p "${archive}" music-api-package.json | node -e '
const fs=require("node:fs"),m=JSON.parse(fs.readFileSync(0,"utf8"));
if(m.schema!=="fe-monster.music-api-package/v1"||m.id!==process.argv[1]||m.version!==process.argv[2]||m.launcher?.runtime!=="node"||m.launcher?.entry!==process.argv[3]) throw new Error("Plugin identity, version, or Node launcher does not match current source");
' "${id}" "${version}" "${entry}" || return 1
  [[ -n "$(unzip -p "${archive}" "${entry}")" ]] || return 1
  unzip -p "${archive}" "${entry}" | node --check || return 1
  unzip -tqq "${archive}" || return 1
}

write_checksum() {
  local archive="$1"
  printf '%s  %s\n' "$(sha256_file "${archive}")" "$(basename -- "${archive}")" > "${archive}.sha256"
}

build_netease() {
  local source="${PLUGIN_SOURCE_ROOT}/netease" work="$1" package="$2" version="$3"
  mkdir -p "${work}/runtime"
  cp "${source}/runtime-package.json" "${work}/runtime/package.json"
  npm install --prefix "${work}/runtime" --omit=dev --ignore-scripts --no-audit --no-fund --save-exact
  node -e 'const p=require(process.argv[1]);if(p.version!==process.argv[2])throw new Error("Unexpected Netease API version");' \
    "${work}/runtime/node_modules/NeteaseCloudMusicApi/package.json" "${version}"
  tar -czf "${package}/runtime.tgz" -C "${work}/runtime" node_modules
  node - "${package}/plugin-runtime.json" "${version}" "$(sha256_file "${package}/runtime.tgz")" <<'NODE'
const fs=require('node:fs');
fs.writeFileSync(process.argv[2],JSON.stringify({schema:'fe-monster.plugin-runtime/v1',package:'NeteaseCloudMusicApi',version:process.argv[3],archiveSha256:process.argv[4]},null,2)+'\n');
NODE
  local file
  for file in music-api-package.json server.cjs README.md THIRD_PARTY_NOTICES.md; do cp "${source}/${file}" "${package}/${file}"; done
  cp "${PLUGIN_SOURCE_ROOT}/shared/safe-log.cjs" "${package}/safe-log.cjs"
  cp "${work}/runtime/node_modules/NeteaseCloudMusicApi/LICENSE" "${package}/NETEASE_API_LICENSE.txt"
}

build_qq() {
  local source="${PLUGIN_SOURCE_ROOT}/qq" work="$1" package="$2"
  mkdir -p "${work}/runtime"
  cp "${source}/runtime-package.json" "${work}/runtime/package.json"
  npm install --prefix "${work}/runtime" --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false --install-strategy=hoisted
  node -e 'const p=require(process.argv[1]);if(p.version!=="2.4.0")throw new Error("Expected @sansenjian/qq-music-api 2.4.0");' \
    "${work}/runtime/node_modules/@sansenjian/qq-music-api/package.json"
  node "${source}/patch-runtime.cjs" "${work}/runtime"
  local upstream="${work}/runtime/node_modules/@sansenjian/qq-music-api" file
  for file in docs-dist public README.md CHANGELOG.md; do rm -rf "${upstream}/${file}"; done
  tar -czf "${package}/runtime.tgz" -C "${work}/runtime" .
  printf '%s\n' "$(sha256_file "${package}/runtime.tgz")" > "${package}/runtime.sha256"
  for file in music-api-package.json server.cjs LICENSE README.txt; do cp "${source}/${file}" "${package}/${file}"; done
  node "${source}/generate-notices.cjs" "${work}/runtime" "${package}/THIRD-PARTY-NOTICES.txt"
}

build_kugou() {
  local source="${PLUGIN_SOURCE_ROOT}/kugou" work="$1" package="$2"
  local upstream="${work}/node_modules/kugoumusicapi" entry="${work}/music-api-plugins/kugou/src/server-entry.cjs"
  require_command curl
  mkdir -p "${upstream}" "$(dirname -- "${entry}")" "${work}/tools"
  curl --fail --location --retry 3 \
    "https://codeload.github.com/MakcRe/KuGouMusicApi/tar.gz/${KUGOU_COMMIT}" \
    --output "${work}/kugou-upstream.tgz"
  tar -xzf "${work}/kugou-upstream.tgz" -C "${upstream}" --strip-components=1
  node -e 'const p=require(process.argv[1]);if(p.version!=="1.5.1")throw new Error("Expected kugoumusicapi 1.5.1 at the pinned source commit");' "${upstream}/package.json"
  npm install --prefix "${upstream}" --omit=dev --ignore-scripts --no-audit --no-fund --package-lock=false
  npm install --prefix "${work}/tools" --ignore-scripts --no-audit --no-fund --package-lock=false --no-save esbuild@0.28.1
  cp "${source}/src/server-entry.cjs" "${entry}"
  node "${work}/tools/node_modules/esbuild/bin/esbuild" "${entry}" \
    --bundle --platform=node --format=cjs --target=node18 --legal-comments=eof "--outfile=${package}/server.cjs"
  local file
  for file in music-api-package.json LICENSE THIRD-PARTY-NOTICES.md README.md; do cp "${source}/${file}" "${package}/${file}"; done
}

build_qishui() {
  local source="${PLUGIN_SOURCE_ROOT}/qishui" package="$2" file
  cp "${source}/src/server.cjs" "${package}/server.cjs"
  for file in music-api-package.json LICENSE THIRD-PARTY-NOTICES.md README.md; do cp "${source}/${file}" "${package}/${file}"; done
}

build_plugin() {
  local id="$1" display="$2" type="$3" manifest version entry name output cached work package temporary
  manifest="${PLUGIN_SOURCE_ROOT}/${id}/music-api-package.json"
  [[ -f "${manifest}" ]] || fail "缺少 ${id} API manifest：${manifest}"
  version="$(manifest_value "${manifest}" version)"
  entry="$(manifest_value "${manifest}" entry)"
  [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ && "${entry}" == server.cjs ]] || fail "无效的 ${id} API 版本或入口"
  name="FE-Monster-${display}-${type}-Plugin-${version}.zip"
  output="${PLUGIN_OUTPUT_ROOT}/${name}"
  cached="${SOURCE_PROJECT_ROOT}/dist/plugins/${name}"
  if [[ "${REBUILD}" -eq 0 ]]; then
    if validate_plugin "${output}" "${id}" "${version}" "${entry}"; then
      write_checksum "${output}"
      note "已验证 ${id} API：${output}"
      return
    fi
    if validate_plugin "${cached}" "${id}" "${version}" "${entry}"; then
      cp "${cached}" "${output}"
      write_checksum "${output}"
      note "已验证并复制 ${id} API：${output}"
      return
    fi
  fi
  work="${PLUGIN_BUILD_ROOT}/${id}"
  assert_generated_path "${work}"
  rm -rf "${work}"
  package="${work}/package"
  mkdir -p "${package}"
  note "正在构建 ${id} API ${version}"
  "build_${id}" "${work}" "${package}" "${version}"
  temporary="${work}/${name}"
  (cd "${package}" && zip -q -r "${temporary}" .)
  validate_plugin "${temporary}" "${id}" "${version}" "${entry}" || fail "${id} API 包校验失败"
  mv "${temporary}" "${output}"
  write_checksum "${output}"
  note "已构建 ${id} API：${output}"
}

build_plugin netease Netease API
build_plugin qq QQ API
build_plugin kugou Kugou API
build_plugin qishui Qishui OpenAPI
