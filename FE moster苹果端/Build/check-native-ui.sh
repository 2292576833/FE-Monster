#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"
require_supported_macos
[[ $# -le 1 ]] || fail "Usage: check-native-ui.sh [FE Monster.app]"
APP_BUNDLE="${1:-${MAC_DIST_ROOT}/FE Monster.app}"
[[ -d "${APP_BUNDLE}" ]] || fail "Missing built app bundle: ${APP_BUNDLE}"
APP_BUNDLE="$(CDPATH= cd -- "${APP_BUNDLE}" && pwd -P)"
APP_EXECUTABLE="${APP_BUNDLE}/Contents/MacOS/FE Monster"
BUNDLED_NODE="${APP_BUNDLE}/Contents/Resources/App/runtime/node/node"
[[ -x "${APP_EXECUTABLE}" && -x "${BUNDLED_NODE}" ]] || fail "The bundled Swift host and Node runtime are required."
SCRATCH_PARENT="$(CDPATH= cd -- "${TMPDIR:-/tmp}" && pwd -P)"
SCRATCH="$(mktemp -d "${SCRATCH_PARENT}/fe-monster-native-ui.XXXXXX")"
EVIDENCE_DIRECTORY="${MAC_BUILD_ROOT}/native-ui-smoke"
assert_generated_path "${EVIDENCE_DIRECTORY}"
mkdir -p "${EVIDENCE_DIRECTORY}"
APP_PID=""

cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if [[ -n "${APP_PID}" ]] && kill -0 "${APP_PID}" 2>/dev/null; then
    # This exact PID is the child launched below. TERM follows AppKit's normal
    # termination handler and its owned Java cleanup; never use a process name.
    kill -TERM "${APP_PID}" 2>/dev/null || true
    for ((attempt=0; attempt<150; attempt++)); do
      kill -0 "${APP_PID}" 2>/dev/null || break
      sleep 0.1
    done
    if kill -0 "${APP_PID}" 2>/dev/null; then kill -KILL "${APP_PID}" 2>/dev/null || true; fi
  fi
  if [[ -n "${APP_PID}" ]]; then wait "${APP_PID}" 2>/dev/null || true; fi
  if [[ -f "${SCRATCH}/report.json" ]]; then cp "${SCRATCH}/report.json" "${EVIDENCE_DIRECTORY}/report.json"; fi
  if [[ -f "${SCRATCH}/app.log" ]]; then
    cp "${SCRATCH}/app.log" "${EVIDENCE_DIRECTORY}/app.log"
    if [[ "${result}" -ne 0 ]]; then tail -n 60 "${SCRATCH}/app.log" >&2; fi
  fi
  case "${SCRATCH}" in
    "${SCRATCH_PARENT}/fe-monster-native-ui."*) rm -rf -- "${SCRATCH}" ;;
    *) printf 'Refusing unexpected temporary directory cleanup: %s\n' "${SCRATCH}" >&2 ;;
  esac
  return "${result}"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# Run the actual packaged executable so Bundle.main, resources, bundled Java,
# normal NSApplication lifecycle and WKWebView all participate in the check.
env -u JAVA_TOOL_OPTIONS -u JDK_JAVA_OPTIONS -u FE_MONSTER_DEV \
  -u FE_MONSTER_DATA_DIR -u FE_MONSTER_ROOT -u FE_MONSTER_WEB_ROOT \
  -u FE_MONSTER_JAR -u FE_MONSTER_JAVA -u FE_MONSTER_NODE \
  -u FE_MONSTER_BUNDLE_PATH -u FE_MONSTER_COREAUDIO_LIBRARY \
  "${APP_EXECUTABLE}" --ci-smoke-report "${SCRATCH}/report.json" \
  > "${SCRATCH}/app.log" 2>&1 &
APP_PID=$!
for ((attempt=0; attempt<1500; attempt++)); do
  kill -0 "${APP_PID}" 2>/dev/null || break
  sleep 0.1
done
if kill -0 "${APP_PID}" 2>/dev/null; then fail "The native AppKit/WK smoke process did not exit within 150 seconds."; fi
wait "${APP_PID}" || fail "The native AppKit/WK smoke process exited unsuccessfully."
FINISHED_APP_PID="${APP_PID}"
APP_PID=""

"${BUNDLED_NODE}" --input-type=module - "${SCRATCH}" "${FINISHED_APP_PID}" "${APP_BUNDLE}" "${SOURCE_PROJECT_ROOT}" <<'NODE'
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
const [scratch,mainPidText,bundle,projectRoot]=process.argv.slice(2);
const reportPath=path.join(scratch,'report.json');
assert.ok(fs.existsSync(reportPath),'The actual native app must produce its final report after backend shutdown');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
assert.equal(report.ok,true,JSON.stringify(report));
assert.equal(report.mainPID,Number(mainPidText));
assert.equal(report.bundlePath,bundle);
assert.equal(report.didFinish,true);
assert.equal(report.bootstrapResolved,true,'The actual app.js init Promise must resolve successfully');
assert.ok(['deferred','started'].includes(report.bootstrap),'Real app.js async bootstrap must complete');
assert.equal(report.platform,'macos');
assert.equal(report.bridgeRoundTrip,true);
assert.equal(report.fetchStatus,200);
assert.equal(report.version,JSON.parse(fs.readFileSync(path.join(projectRoot,'package.json'),'utf8')).version);
const url=new URL(report.url);
assert.equal(url.protocol,'http:');
assert.equal(url.hostname,'127.0.0.1');
assert.ok(Number(url.port)>0);
assert.equal(report.dataDirectory,path.join(scratch,'data'));
assert.ok(fs.existsSync(path.join(scratch,'data','music-api','providers.json')),'The app must initialize its own isolated account profile');
assert.ok(report.viewport.width>0&&report.viewport.height>0);
assert.ok(Number.isSafeInteger(report.javaPID)&&report.javaPID>0);
assert.equal(report.javaExited,true);
assert.equal(report.gracefulJavaShutdown,true,'Java must exit normally through its quit endpoint, without fallback signals');
for(const pid of [report.mainPID,report.javaPID]) {
  assert.throws(()=>process.kill(pid,0),error=>error.code==='ESRCH',`Owned native/Java process ${pid} must be gone`);
}
console.log(JSON.stringify(report));
NODE
note "Actual packaged AppKit window, WK navigation/bootstrap/native bridge/fetch, isolated data and graceful Java shutdown passed."
