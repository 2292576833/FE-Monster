#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

[[ "$(uname -s)" == Darwin ]] || fail "Bundle runtime verification requires macOS."
[[ $# -le 1 ]] || fail "Usage: check-bundle.sh [FE Monster.app]"
for command in unzip lipo codesign plutil curl cmp; do require_command "${command}"; done

APP_BUNDLE="${1:-${MAC_DIST_ROOT}/FE Monster.app}"
[[ -d "${APP_BUNDLE}/Contents/Resources/App" ]] || fail "Missing built app bundle: ${APP_BUNDLE}"
APP_BUNDLE="$(CDPATH= cd -- "${APP_BUNDLE}" && pwd)"
APP_RESOURCES="${APP_BUNDLE}/Contents/Resources/App"
BUNDLED_JAVA="${APP_RESOURCES}/runtime/java/bin/java"
BUNDLED_NODE="${APP_RESOURCES}/runtime/node/node"
KEYCHAIN_LIBRARY="${APP_RESOURCES}/native/macos/libfe-monster-keychain.dylib"
ARCH="$(uname -m)"
[[ "${ARCH}" == "${FE_MONSTER_EXPECTED_ARCH:-${ARCH}}" ]] || fail "Runner architecture does not match requested bundle verification."

for binary in "${APP_BUNDLE}/Contents/MacOS/FE Monster" "${BUNDLED_JAVA}" "${BUNDLED_NODE}" "${KEYCHAIN_LIBRARY}" \
  "${APP_RESOURCES}/native/macos/libfe-monster-coreaudio.dylib" "${APP_RESOURCES}/native/macos/libfe_monster_upmix.dylib"; do
  [[ -x "${binary}" ]] || fail "Missing executable/native library: ${binary}"
  lipo -verify_arch "${ARCH}" "${binary}"
done
plutil -lint "${APP_BUNDLE}/Contents/Info.plist"
codesign --verify --deep --strict "${APP_BUNDLE}"
"${BUNDLED_NODE}" -e 'if(process.platform!=="darwin"||Number(process.versions.node.split(".")[0])<24)throw new Error("Expected a bundled macOS Node.js 24+ runtime");console.log("Bundled Node:",process.version,process.arch);'
"${BUNDLED_NODE}" "${APP_SOURCE_ROOT}/Tests/check-webview-bridge.mjs"
bash "${APP_SOURCE_ROOT}/Tests/check-desktop-geometry.sh"

SCRATCH_PARENT="$(CDPATH= cd -- "${TMPDIR:-/tmp}" && pwd)"
SCRATCH="$(mktemp -d "${SCRATCH_PARENT}/fe-monster-macos-check.XXXXXX")"
BACKEND_PID=""
BASE_URL=""

cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    if [[ -n "${BASE_URL}" ]]; then
      curl --silent --show-error --noproxy '*' --max-time 2 "${BASE_URL}api/app/window/quit" >/dev/null || true
    fi
    for ((attempt=0; attempt<30; attempt++)); do
      kill -0 "${BACKEND_PID}" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "${BACKEND_PID}" 2>/dev/null; then
      kill -TERM "${BACKEND_PID}" 2>/dev/null || true
      for ((attempt=0; attempt<30; attempt++)); do
        kill -0 "${BACKEND_PID}" 2>/dev/null || break
        sleep 0.1
      done
      if kill -0 "${BACKEND_PID}" 2>/dev/null; then kill -KILL "${BACKEND_PID}" 2>/dev/null || true; fi
    fi
  fi
  if [[ -n "${BACKEND_PID}" ]]; then wait "${BACKEND_PID}" 2>/dev/null || true; fi
  if [[ "${result}" -ne 0 && -f "${SCRATCH}/backend.log" ]]; then tail -n 40 "${SCRATCH}/backend.log" >&2; fi
  # The only recursive cleanup target is the directory created by mktemp above.
  case "${SCRATCH}" in
    "${SCRATCH_PARENT}/fe-monster-macos-check."*) [[ -d "${SCRATCH}" ]] && rm -rf -- "${SCRATCH}" ;;
    *) printf 'Refusing unexpected temporary directory cleanup: %s\n' "${SCRATCH}" >&2 ;;
  esac
  return "${result}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${BUNDLED_JAVA}" --list-modules > "${SCRATCH}/java-modules.txt"
grep -Eq '^java\.sql(@|$)' "${SCRATCH}/java-modules.txt" || fail "Bundled Java is missing java.sql."
for dependency in sqlite-jdbc-3.53.2.1-without-natives.jar sqlite-jdbc-3.53.2.1-natives-mac.jar slf4j-api-1.7.36.jar; do
  [[ -s "${APP_RESOURCES}/lib/${dependency}" ]] || fail "Missing JAR-adjacent dependency: ${dependency}"
done
for archive in "${APP_RESOURCES}/fe-monster-java.jar" "${APP_RESOURCES}/lib/"*.jar; do
  unzip -Z1 "${archive}" > "${SCRATCH}/jar-entries.txt"
  if grep -Ei '(^|/)Linux[^/]*(/|$)|\.dll$|\.so$' "${SCRATCH}/jar-entries.txt" >/dev/null; then
    fail "The macOS bundle contains a Linux/Windows native in ${archive}."
  fi
done
[[ -f "${APP_RESOURCES}/native/audio-sources/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm" ]] || fail "Missing bundled QuickJS WASM runtime."

for tuple in netease:Netease:API qq:QQ:API kugou:Kugou:API qishui:Qishui:OpenAPI; do
  IFS=: read -r provider display kind <<< "${tuple}"
  version="$("${BUNDLED_NODE}" -p 'JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")).version' "${SOURCE_PROJECT_ROOT}/music-api-plugins/${provider}/music-api-package.json")"
  archive_name="FE-Monster-${display}-${kind}-Plugin-${version}.zip"
  archive="${APP_RESOURCES}/plugins/music-api/${archive_name}"
  [[ -s "${archive}" ]] || fail "Missing auto-bootstrap music API: ${provider}"
  cmp -s "${archive}" "${APP_BUNDLE}/Contents/Resources/API Plugins/${archive_name}" || fail "The manual and automatic ${provider} API packages differ."
  unzip -p "${archive}" music-api-package.json | "${BUNDLED_NODE}" -e '
const fs=require("node:fs"),m=JSON.parse(fs.readFileSync(0,"utf8"));
if(m.schema!=="fe-monster.music-api-package/v1"||m.id!==process.argv[1]||m.version!==process.argv[2]||m.launcher?.runtime!=="node"||m.launcher?.entry!=="server.cjs")throw new Error("Unexpected bundled music API identity/runtime");
' "${provider}" "${version}"
done

# Exercise SQLite with the shipped JRE, its adjacent JARs and its macOS JNI
# rather than only checking that a dependency filename exists.
JAVA_HOME_RESOLVED="$(require_java_17)"
mkdir -p "${SCRATCH}/classes" "${SCRATCH}/tmp" "${SCRATCH}/data"
cat > "${SCRATCH}/BundleSQLiteProbe.java" <<'JAVA'
import java.sql.*;
public final class BundleSQLiteProbe {
    public static void main(String[] args) throws Exception {
        Class.forName("org.sqlite.JDBC");
        try (Connection connection = DriverManager.getConnection("jdbc:sqlite:" + args[0]);
             Statement statement = connection.createStatement()) {
            statement.executeUpdate("CREATE TABLE bundle_probe (value TEXT NOT NULL)");
            statement.executeUpdate("INSERT INTO bundle_probe VALUES ('macos-runtime')");
            try (ResultSet result = statement.executeQuery("SELECT value FROM bundle_probe")) {
                if (!result.next() || !"macos-runtime".equals(result.getString(1))) {
                    throw new IllegalStateException("SQLite bundle roundtrip failed");
                }
            }
        }
        System.out.println("Bundled Java/SQLite native roundtrip passed.");
    }
}
JAVA
"${JAVA_HOME_RESOLVED}/bin/javac" --release 17 -d "${SCRATCH}/classes" "${SCRATCH}/BundleSQLiteProbe.java"
"${BUNDLED_JAVA}" "-Djava.io.tmpdir=${SCRATCH}/tmp" -cp "${SCRATCH}/classes:${APP_RESOURCES}/lib/*" BundleSQLiteProbe "${SCRATCH}/probe.sqlite"

# Launch from an unrelated writable directory using only the actual bundle's
# Java/Node/resources, with an isolated user profile and this shell as parent.
(
  cd "${SCRATCH}"
  exec env -u JAVA_TOOL_OPTIONS -u JDK_JAVA_OPTIONS \
    FE_MONSTER_ROOT="${APP_RESOURCES}" \
    FE_MONSTER_WEB_ROOT="${APP_RESOURCES}/web" \
    FE_MONSTER_DATA_DIR="${SCRATCH}/data" \
    FE_MONSTER_NODE="${BUNDLED_NODE}" \
    FE_MONSTER_MAIN_PID="$$" \
    FE_MONSTER_BIND=127.0.0.1 \
    FE_MONSTER_PORT=0 \
    FE_MUSIC_API_AUTOSTART=0 \
    "${BUNDLED_JAVA}" --enable-native-access=ALL-UNNAMED "-Djava.io.tmpdir=${SCRATCH}/tmp" -jar "${APP_RESOURCES}/fe-monster-java.jar" --server
) > "${SCRATCH}/backend.log" 2>&1 &
BACKEND_PID=$!

"${BUNDLED_NODE}" --input-type=module - "${SCRATCH}" "${BACKEND_PID}" "${SOURCE_PROJECT_ROOT}" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const [scratch,pidText,projectRoot]=process.argv.slice(2);
const expectedVersion=JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8')).version;
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
const deadline=Date.now()+60_000;
let base='';
while(Date.now()<deadline) {
  try { process.kill(Number(pidText),0); } catch { throw new Error('Bundled Java exited before becoming ready'); }
  const log=fs.readFileSync(path.join(scratch,'backend.log'),'utf8');
  const match=log.match(/^URL:\s+(http:\/\/127\.0\.0\.1:\d+\/)\s*$/m);
  if(match) {
    base=match[1];
    try {
      const response=await fetch(`${base}api/app/version`,{signal:AbortSignal.timeout(2000)});
      const version=await response.json();
      assert.equal(response.status,200);
      assert.equal(version.ok,true);
      assert.equal(version.name,'FE Monster Java');
      assert.equal(version.version,expectedVersion);
      assert.ok(Number(version.runtime.split('.')[0])>=17,'The bundled Java runtime must be 17+');
      fs.writeFileSync(path.join(scratch,'base-url.txt'),base);
      break;
    } catch(error) {
      if(error instanceof assert.AssertionError) throw error;
    }
  }
  await pause();
}
assert.ok(fs.existsSync(path.join(scratch,'base-url.txt')),'Bundled Java did not become ready within 60 seconds');
for(const route of ['', 'index.html']) {
  const response=await fetch(base+route,{signal:AbortSignal.timeout(5000)});
  assert.equal(response.status,200,`App shell ${route||'/'} must return HTTP 200`);
  const html=await response.text();
  assert.ok(html.includes('FE Monster')&&html.includes('bootScreen'),'The actual app shell must be served from the bundle');
}
const apisResponse=await fetch(`${base}api/music-apis`,{signal:AbortSignal.timeout(5000)});
assert.equal(apisResponse.status,200);
const apis=await apisResponse.json();
assert.equal(apis.ok,true);
for(const id of ['netease','qq','kugou','qishui']) {
  const provider=apis.providers.find(item=>item.id===id);
  const manifest=JSON.parse(fs.readFileSync(path.join(projectRoot,'music-api-plugins',id,'music-api-package.json'),'utf8'));
  assert.equal(provider?.configured,true,`${id} must configure on a clean install`);
  assert.equal(provider.source,'imported-zip');
  assert.equal(provider.version,manifest.version);
  assert.equal(path.isAbsolute(provider.package),false,'API package is a relative package-directory identifier');
  const packageBase=path.join(scratch,'data','music-api','packages');
  const packageRoot=path.resolve(packageBase,provider.package);
  const relative=path.relative(packageBase,packageRoot);
  assert.ok(relative&&!relative.startsWith('..')&&!path.isAbsolute(relative),`${id} package must use the isolated writable profile`);
  assert.ok(fs.existsSync(packageRoot),`${id} extracted package must exist`);
}
assert.ok(fs.existsSync(path.join(scratch,'data','music-api','providers.json')),'Provider configuration must persist in isolated user data');
console.log(JSON.stringify({ok:true,platform:process.platform,architecture:process.arch,version:expectedVersion,cleanInstallProviders:4,pluginAutostart:false}));
NODE
BASE_URL="$(cat "${SCRATCH}/base-url.txt")"
curl --fail --silent --show-error --noproxy '*' --max-time 5 "${BASE_URL}api/app/window/quit" >/dev/null
for ((attempt=0; attempt<100; attempt++)); do
  kill -0 "${BACKEND_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${BACKEND_PID}" 2>/dev/null; then fail "Bundled Java did not shut down through its quit endpoint."; fi
wait "${BACKEND_PID}" || fail "Bundled Java exited with a failure status."
BACKEND_PID=""
note "Bundle architecture, signing, Java/Node, SQLite, app shell, clean-install API imports and graceful shutdown passed."
