#!/bin/bash
# Standalone installed-app helper. Java copies this into the writable user data
# directory before launching it, so renaming the old app cannot interrupt it.
set -euo pipefail
umask 077
export PATH=/usr/bin:/bin:/usr/sbin:/sbin

BUNDLE= DATA= WORK= UPDATE_ID= DOWNLOAD_URL= VERSION= SHA256= ARCH= PROGRESS_FILE=
MAIN_PID= JAVA_PID= MAIN_EXECUTABLE= JAVA_EXECUTABLE=
MAIN_COMMAND= JAVA_COMMAND=
MOUNT= STAGE= BACKUP= LOCK= MAIN_SNAPSHOT= JAVA_SNAPSHOT=
MOUNTED=0 LOCKED=0 REPLACED=0 MOVED_OLD=0 RESTARTED=0
FAILURE_MESSAGE='macOS update helper failed'

die() { FAILURE_MESSAGE="$*"; printf 'FE Monster update: %s\n' "$*" >&2; exit 1; }
while [[ $# -gt 0 ]]; do
  [[ $# -ge 2 ]] || die "Missing option value"
  case "$1" in
    --bundle) BUNDLE="$2" ;; --data) DATA="$2" ;; --work) WORK="$2" ;;
    --update-id) UPDATE_ID="$2" ;; --download-url) DOWNLOAD_URL="$2" ;;
    --version) VERSION="$2" ;; --sha256) SHA256="$2" ;; --arch) ARCH="$2" ;;
    --progress-file) PROGRESS_FILE="$2" ;; --main-pid) MAIN_PID="$2" ;;
    --java-pid) JAVA_PID="$2" ;; --main-executable) MAIN_EXECUTABLE="$2" ;;
    --java-executable) JAVA_EXECUTABLE="$2" ;; --main-command) MAIN_COMMAND="$2" ;;
    --java-command) JAVA_COMMAND="$2" ;; *) die "Unknown update option" ;;
  esac
  shift 2
done

[[ "$(/usr/bin/uname -s)" == Darwin ]] || die "This updater requires macOS"
[[ "$UPDATE_ID" =~ ^[a-f0-9]{32}$ ]] || die "Invalid update identifier"
[[ "$VERSION" =~ ^[0-9][A-Za-z0-9._-]{0,63}$ ]] || die "An explicit version is required"
[[ "$SHA256" =~ ^[a-f0-9]{64}$ ]] || die "A SHA-256 digest is required"
[[ "$ARCH" == arm64 || "$ARCH" == x86_64 ]] || die "Unsupported processor architecture"
[[ "$MAIN_PID" =~ ^[0-9]+$ && "$JAVA_PID" =~ ^[0-9]+$ ]] || die "Invalid app process identifiers"
[[ "$MAIN_PID" -gt 1 && "$JAVA_PID" -gt 1 && "$MAIN_PID" != "$JAVA_PID" ]] || die "Invalid app process identifiers"
[[ -n "$MAIN_COMMAND" && -n "$JAVA_COMMAND" && "$MAIN_COMMAND" != *$'\n'* && "$JAVA_COMMAND" != *$'\n'* ]] || die "Missing verified process commands"
URL_PREFIX='https://github.com/2292576833/FE-Monster/releases/download/'
[[ "$DOWNLOAD_URL" == "$URL_PREFIX"* ]] || die "Download must be an official FE Monster GitHub release"
URL_TAIL="${DOWNLOAD_URL#"$URL_PREFIX"}"
TAG="${URL_TAIL%%/*}"
[[ "$TAG" =~ ^[A-Za-z0-9._-]+$ && "$TAG" != . && "$TAG" != .. ]] || die "Invalid official release tag"
[[ "$URL_TAIL" == "$TAG/FE-Monster-$VERSION-$ARCH.dmg" ]] || die "Release version or architecture does not match its DMG filename"

canonical_directory() { (CDPATH= cd -P -- "$1" && pwd -P); }
[[ "$BUNDLE" == /*.app && -d "$BUNDLE" && ! -L "$BUNDLE" ]] || die "Installed app path is invalid"
[[ "$DATA" == /* && -d "$DATA" && ! -L "$DATA" ]] || die "User data path is invalid"
[[ "$WORK" == /* && -d "$WORK" && ! -L "$WORK" ]] || die "Update work path is invalid"
[[ "$(canonical_directory "$BUNDLE")" == "$BUNDLE" ]] || die "Installed app path must be canonical"
[[ "$(canonical_directory "$DATA")" == "$DATA" ]] || die "User data path must be canonical"
[[ "$(canonical_directory "$WORK")" == "$WORK" ]] || die "Update work path must be canonical"
case "$BUNDLE" in /Volumes/*|*/AppTranslocation/*) die "Install the app outside its disk image before updating" ;; esac
case "$DATA/" in "$BUNDLE/"*) die "User data must be outside the installed app" ;; esac
[[ "$WORK" == "$DATA/updates/mac-$UPDATE_ID" ]] || die "Update work path is outside user data"
[[ "$(/usr/bin/stat -f '%u' "$WORK")" == "$EUID" ]] || die "Update work directory has a different owner"
[[ "$PROGRESS_FILE" == "$DATA/update-progress/$UPDATE_ID.json" ]] || die "Progress path is outside user data"
[[ -d "$DATA/update-progress" && ! -L "$DATA/update-progress" && ! -L "$PROGRESS_FILE" ]] || die "Progress directory is invalid"
[[ "$(canonical_directory "$DATA/update-progress")" == "$DATA/update-progress" ]] || die "Progress directory must be canonical"
PARENT="$(canonical_directory "${BUNDLE%/*}")"
[[ -w "$PARENT" ]] || die "The installed app directory is not writable"
STAGE="$PARENT/.FE-Monster-update-$UPDATE_ID.app"
BACKUP="$PARENT/.FE-Monster-backup-$UPDATE_ID.app"
LOCK="$PARENT/.FE-Monster-update.lock"
MOUNT="$WORK/mount"
[[ ! -e "$STAGE" && ! -L "$STAGE" && ! -e "$BACKUP" && ! -L "$BACKUP" ]] || die "Update staging path already exists"
[[ ! -e "$MOUNT" && ! -L "$MOUNT" ]] || die "Update mount path already exists"

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"; value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"; value="${value//$'\r'/\\r}"; value="${value//$'\t'/\\t}"
  printf '%s' "$value"
}
progress() {
  local status="$1" percent="$2" message="$3" temporary="$PROGRESS_FILE.tmp.$$"
  printf '{"ok":true,"status":"%s","percent":%s,"message":"%s","version":"%s","updatedAt":%s000}\n' \
    "$status" "$percent" "$(json_escape "$message")" "$VERSION" "$(/bin/date +%s)" > "$temporary"
  /bin/mv -f "$temporary" "$PROGRESS_FILE"
}
cleanup() {
  local result=$?
  trap - EXIT INT TERM
  if [[ "$MOUNTED" == 1 ]]; then /usr/bin/hdiutil detach "$MOUNT" >/dev/null 2>&1 || true; fi
  if [[ "$result" != 0 ]]; then
    if [[ "$MOVED_OLD" == 1 && -d "$BACKUP" && ! -L "$BACKUP" ]]; then
      # Remove only the exact new app installed by this helper, then restore the
      # original rename. Neither application-support data nor other apps change.
      if [[ "$REPLACED" == 1 && -d "$BUNDLE" && ! -L "$BUNDLE" ]]; then /bin/rm -rf -- "$BUNDLE"; fi
      if [[ ! -e "$BUNDLE" && ! -L "$BUNDLE" ]]; then /bin/mv "$BACKUP" "$BUNDLE" || true; fi
      /usr/bin/open -n "$BUNDLE" >/dev/null 2>&1 || true
    elif [[ "$RESTARTED" == 1 && -d "$BUNDLE" ]]; then
      /usr/bin/open -n "$BUNDLE" >/dev/null 2>&1 || true
    fi
    progress failed 0 "$FAILURE_MESSAGE; the previous app was preserved. See updates/mac-$UPDATE_ID/helper.log." || true
  fi
  if [[ -d "$STAGE" && ! -L "$STAGE" ]]; then /bin/rm -rf -- "$STAGE"; fi
  if [[ "$result" == 0 && -d "$BACKUP" && ! -L "$BACKUP" ]]; then /bin/rm -rf -- "$BACKUP"; fi
  if [[ "$LOCKED" == 1 ]]; then /bin/rmdir "$LOCK" 2>/dev/null || true; fi
  /bin/rm -f -- "$WORK/update.dmg" "$WORK/attach.plist"
  if [[ "$MOUNTED" == 0 ]]; then /bin/rmdir "$MOUNT" 2>/dev/null || true; fi
  exit "$result"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
/bin/mkdir "$LOCK" || die "Another update is already in progress"
LOCKED=1

plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist"; }
EXPECTED_ID=com.femonster.desktop
[[ "$(plist "$BUNDLE" CFBundleIdentifier)" == "$EXPECTED_ID" ]] || die "Installed bundle identifier is invalid"
EXECUTABLE="$(plist "$BUNDLE" CFBundleExecutable)"
[[ -n "$EXECUTABLE" && "$EXECUTABLE" != */* && "$EXECUTABLE" != . && "$EXECUTABLE" != .. ]] || die "Invalid app executable"
[[ "$MAIN_EXECUTABLE" == "$BUNDLE/Contents/MacOS/$EXECUTABLE" && -x "$MAIN_EXECUTABLE" && ! -L "$MAIN_EXECUTABLE" ]] || die "App process executable does not belong to this bundle"
[[ "$JAVA_EXECUTABLE" == /*/java && -x "$JAVA_EXECUTABLE" ]] || die "Java process executable is invalid"
/usr/bin/codesign --verify --deep --strict "$BUNDLE"
CURRENT_TEAM="$(/usr/bin/codesign -dv --verbose=4 "$BUNDLE" 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p')"
[[ "$CURRENT_TEAM" =~ ^[A-Z0-9]{10}$ ]] || die "Automatic updates require a Developer ID signed installed app"

process_snapshot() {
  local pid="$1" executable="$2" owner command birth
  owner="$(/bin/ps -p "$pid" -o uid= 2>/dev/null | /usr/bin/tr -d ' ')"
  command="$(/bin/ps -ww -p "$pid" -o comm= 2>/dev/null | /usr/bin/sed 's/^[[:space:]]*//')"
  birth="$(/bin/ps -p "$pid" -o lstart= 2>/dev/null)"
  [[ "$owner" == "$EUID" && "$command" == "$executable" && -n "$birth" ]] || return 1
  printf '%s' "$birth"
}
MAIN_SNAPSHOT="$(process_snapshot "$MAIN_PID" "$MAIN_COMMAND")" || die "App process ownership could not be verified"
JAVA_SNAPSHOT="$(process_snapshot "$JAVA_PID" "$JAVA_COMMAND")" || die "Java process ownership could not be verified"
[[ "$(/bin/ps -p "$JAVA_PID" -o ppid= | /usr/bin/tr -d ' ')" == "$MAIN_PID" ]] || die "Java is not owned by this app"

verify_app() {
  local app="$1" candidate_version candidate_executable requirement minimum current_major current_minor current_patch min_major min_minor min_patch resource pattern
  local matches
  [[ -d "$app" && ! -L "$app" ]] || die "Update app is missing or is a symlink"
  [[ "$(plist "$app" CFBundleIdentifier)" == "$EXPECTED_ID" ]] || die "Update bundle identifier does not match"
  candidate_version="$(plist "$app" FEMonsterDisplayVersion 2>/dev/null || plist "$app" CFBundleShortVersionString)"
  [[ "$candidate_version" == "$VERSION" ]] || die "Update app version does not match the requested release"
  candidate_executable="$(plist "$app" CFBundleExecutable)"
  [[ "$candidate_executable" == "$EXECUTABLE" ]] || die "Update app executable does not match"
  /usr/bin/codesign --verify --deep --strict "$app"
  requirement="anchor apple generic and identifier \"$EXPECTED_ID\" and certificate leaf[subject.OU] = \"$CURRENT_TEAM\" and certificate leaf[field.1.2.840.113635.100.6.1.13] exists"
  /usr/bin/codesign --verify --strict -R "$requirement" "$app"
  /usr/sbin/spctl --assess --type execute --verbose=2 "$app"
  for resource in fe-monster-java.jar web/index.html web/app.js web/mac-capture.js scripts/apply-client-update-macos.sh \
    native/audio-sources/node_modules/@jitl/quickjs-wasmfile-release-sync/dist/emscripten-module.wasm; do
    [[ -s "$app/Contents/Resources/App/$resource" && ! -L "$app/Contents/Resources/App/$resource" ]] || die "Update is missing a required application resource"
  done
  for pattern in 'lib/sqlite-jdbc-*-without-natives.jar' 'lib/sqlite-jdbc-*-natives-mac.jar' 'lib/slf4j-api-*.jar' \
    'plugins/music-api/FE-Monster-Netease-API-Plugin-*.zip' 'plugins/music-api/FE-Monster-QQ-API-Plugin-*.zip' \
    'plugins/music-api/FE-Monster-Kugou-API-Plugin-*.zip' 'plugins/music-api/FE-Monster-Qishui-OpenAPI-Plugin-*.zip'; do
    matches=("$app/Contents/Resources/App/"$pattern)
    [[ ${#matches[@]} -gt 0 ]] || die "Update is missing a bundled dependency or music API"
    for resource in "${matches[@]}"; do [[ -s "$resource" && ! -L "$resource" ]] || die "Update dependency is invalid"; done
  done
  for resource in libfe-monster-keychain.dylib libfe-monster-coreaudio.dylib libfe_monster_upmix.dylib; do
    [[ -s "$app/Contents/Resources/App/native/macos/$resource" && ! -L "$app/Contents/Resources/App/native/macos/$resource" ]] || die "Update is missing a native macOS component"
  done
  for executable in "$app/Contents/MacOS/$EXECUTABLE" \
    "$app/Contents/Resources/App/runtime/node/node" "$app/Contents/Resources/App/runtime/java/bin/java"; do
    [[ -x "$executable" && ! -L "$executable" ]] || die "Update lacks its standalone runtime"
    /usr/bin/lipo "$executable" -verify_arch "$ARCH"
  done
  /usr/bin/find "$app/Contents" -type f \( -name '*.dylib' -o -name '*.jnilib' \) -print0 | \
    while IFS= read -r -d '' library; do /usr/bin/lipo "$library" -verify_arch "$ARCH"; done
  minimum="$(plist "$app" LSMinimumSystemVersion)"
  [[ "$minimum" =~ ^[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || die "Update minimum macOS version is invalid"
  IFS=. read -r min_major min_minor min_patch <<< "$minimum"
  IFS=. read -r current_major current_minor current_patch <<< "$(/usr/bin/sw_vers -productVersion)"
  (( current_major > min_major || (current_major == min_major && (current_minor > min_minor \
    || (current_minor == min_minor && ${current_patch:-0} >= ${min_patch:-0}))) )) || die "This update requires a newer macOS version"
}

progress downloading 5 'Downloading the official macOS update'
/usr/bin/curl --fail --location --silent --show-error --proto '=https' --proto-redir '=https' \
  --tlsv1.2 --max-redirs 5 --connect-timeout 30 --max-time 1800 --retry 2 \
  --output "$WORK/update.dmg" "$DOWNLOAD_URL"
progress verifying 70 'Verifying SHA-256, app signature and processor architecture'
ACTUAL_SHA="$(/usr/bin/shasum -a 256 "$WORK/update.dmg" | /usr/bin/awk '{print $1}')"
[[ "$ACTUAL_SHA" == "$SHA256" ]] || die "Downloaded update failed SHA-256 verification"
/bin/mkdir "$MOUNT"
/usr/bin/hdiutil attach -readonly -nobrowse -noautoopen -mountpoint "$MOUNT" -plist "$WORK/update.dmg" > "$WORK/attach.plist"
MOUNTED=1
shopt -s nullglob
CANDIDATES=("$MOUNT"/*.app)
[[ ${#CANDIDATES[@]} -eq 1 ]] || die "The DMG must contain exactly one app"
verify_app "${CANDIDATES[0]}"
progress staging 82 'Preparing the verified update beside the installed app'
/usr/bin/ditto "${CANDIDATES[0]}" "$STAGE"
verify_app "$STAGE"
/usr/bin/hdiutil detach "$MOUNT"
MOUNTED=0

same_process() {
  local snapshot
  snapshot="$(process_snapshot "$1" "$2")" || return 1
  [[ "$snapshot" == "$3" ]]
}
progress waiting 90 'Closing FE Monster to apply the verified update'
# Only the originally verified owner receives TERM. The app handles this signal
# through NSApplication.terminate, which saves state and shuts down its backend.
if same_process "$MAIN_PID" "$MAIN_COMMAND" "$MAIN_SNAPSHOT"; then /bin/kill -TERM "$MAIN_PID"; fi
RESTARTED=1
for (( attempt=0; attempt<180; attempt++ )); do
  main_running=0 java_running=0
  if same_process "$MAIN_PID" "$MAIN_COMMAND" "$MAIN_SNAPSHOT"; then main_running=1; fi
  if same_process "$JAVA_PID" "$JAVA_COMMAND" "$JAVA_SNAPSHOT"; then java_running=1; fi
  if [[ "$main_running" == 0 && "$java_running" == 0 ]]; then break; fi
  if [[ "$attempt" == 10 && "$java_running" == 1 ]]; then /bin/kill -TERM "$JAVA_PID"; fi
  /bin/sleep 0.5
done
[[ "$main_running" == 0 && "$java_running" == 0 ]] || die "The app did not exit; update was not installed"
[[ -d "$BUNDLE" && ! -L "$BUNDLE" && "$(canonical_directory "$BUNDLE")" == "$BUNDLE" ]] || die "Installed app path changed while downloading"
[[ "$(plist "$BUNDLE" CFBundleIdentifier)" == "$EXPECTED_ID" ]] || die "Installed app identity changed"
[[ "$(/usr/bin/codesign -dv --verbose=4 "$BUNDLE" 2>&1 | /usr/bin/sed -n 's/^TeamIdentifier=//p')" == "$CURRENT_TEAM" ]] || die "Installed app signer changed"
progress installing 95 'Replacing the current app; user data remains in Application Support'
/bin/mv "$BUNDLE" "$BACKUP"
MOVED_OLD=1
/bin/mv "$STAGE" "$BUNDLE"
REPLACED=1
/usr/bin/open -n "$BUNDLE"
progress completed 100 'macOS update installed and FE Monster restarted'
