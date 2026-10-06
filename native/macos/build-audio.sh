#!/usr/bin/env bash
set -euo pipefail

audio_source="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
project_root="$(CDPATH= cd -- "${audio_source}/../.." && pwd)"
output_directory="${1:-${audio_source}}"
architecture="${2:-$(uname -m)}"
[[ "$(uname -s)" == Darwin ]] || { printf 'CoreAudio requires the macOS SDK.\n' >&2; exit 1; }
case "${architecture}" in
  arm64|aarch64) architecture=arm64; rust_target=aarch64-apple-darwin ;;
  x86_64) rust_target=x86_64-apple-darwin ;;
  *) printf 'Unsupported macOS audio architecture: %s\n' "${architecture}" >&2; exit 1 ;;
esac
for command_name in cmake cargo git xcrun; do
  command -v "${command_name}" >/dev/null || { printf 'Missing build command: %s\n' "${command_name}" >&2; exit 1; }
done
jdk="${FE_JAVA_HOME:-${JAVA_HOME:-}}"
[[ -n "${jdk}" ]] || jdk="$(/usr/libexec/java_home -v '17+')"
[[ -f "${jdk}/include/jni.h" && -f "${jdk}/include/darwin/jni_md.h" ]] || { printf 'JDK JNI headers missing.\n' >&2; exit 1; }
export MACOSX_DEPLOYMENT_TARGET=13.5
obr_revision=478dc7c752d5eccae534635139ff0253eee3a14a
obr_source="${FE_MAC_AUDIO_OBR_SOURCE_DIR:-${project_root}/.tmp/google-obr-native-${obr_revision:0:12}}"
if [[ ! -d "${obr_source}/.git" ]]; then
  mkdir -p "$(dirname -- "${obr_source}")"
  git clone --filter=blob:none --no-checkout https://github.com/google/obr.git "${obr_source}"
  git -C "${obr_source}" checkout --detach "${obr_revision}"
fi
[[ "$(git -C "${obr_source}" rev-parse HEAD)" == "${obr_revision}" ]] || { printf 'Google OBR must use the pinned revision.\n' >&2; exit 1; }
if command -v rustup >/dev/null; then rustup target add "${rust_target}"; fi
build_directory="${project_root}/.tmp/coreaudio-${architecture}"
rust_build_directory="${build_directory}/rust"
mkdir -p "${output_directory}" "${build_directory}"
output_directory="$(CDPATH= cd -- "${output_directory}" && pwd)"
cargo build --locked --release --manifest-path "${project_root}/native/rust-audio-upmix/Cargo.toml" \
  --target "${rust_target}" --target-dir "${rust_build_directory}"
cp "${rust_build_directory}/${rust_target}/release/libfe_monster_upmix.dylib" "${output_directory}/libfe_monster_upmix.dylib"
xcrun install_name_tool -id '@rpath/libfe_monster_upmix.dylib' "${output_directory}/libfe_monster_upmix.dylib"
# Changing LC_ID_DYLIB invalidates Rust/ld's ad-hoc signature. Refresh it before
# the native CPU probes load the library on Apple Silicon; packaging later
# replaces this development signature with the application's signing identity.
/usr/bin/codesign --force --sign - "${output_directory}/libfe_monster_upmix.dylib"
cmake -S "${audio_source}" -B "${build_directory}/cmake" \
  -DCMAKE_BUILD_TYPE=Release -DCMAKE_OSX_ARCHITECTURES="${architecture}" \
  -DCMAKE_OSX_DEPLOYMENT_TARGET=13.5 -DOBR_SOURCE_DIR="${obr_source}" \
  -DFE_JNI_INCLUDE_DIR="${jdk}/include" -DFE_JNI_PLATFORM_INCLUDE_DIR="${jdk}/include/darwin" \
  -DFE_RUST_AUDIO_LIBRARY="${output_directory}/libfe_monster_upmix.dylib" \
  -DFE_RUNTIME_OUTPUT_DIR="${output_directory}"
cmake --build "${build_directory}/cmake" --parallel
# Native CPU probes can run for the host architecture. Cross-architecture
# binaries are built but must be checked on their corresponding macOS runner.
if [[ "${architecture}" == "$(uname -m)" ]]; then
  ctest --test-dir "${build_directory}/cmake" --output-on-failure
fi
printf 'CoreAudio + Rust + Google OBR built for %s: %s\n' "${architecture}" "${output_directory}"
