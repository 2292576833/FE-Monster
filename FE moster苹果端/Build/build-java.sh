#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
# shellcheck source=common.sh
source "${SCRIPT_DIR}/common.sh"

JAVA_OUTPUT_ROOT="${MAC_BUILD_ROOT}/java"
OUTPUT_JAR="${1:-${JAVA_OUTPUT_ROOT}/fe-monster-java.jar}"
CLASSES_DIR="${JAVA_OUTPUT_ROOT}/classes"

assert_generated_path "${JAVA_OUTPUT_ROOT}"
assert_generated_path "${OUTPUT_JAR}"

JAVA_HOME_RESOLVED="$(require_java_17)"
JAVAC="${JAVA_HOME_RESOLVED}/bin/javac"
JAR_TOOL="${JAVA_HOME_RESOLVED}/bin/jar"

SOURCE_ROOTS=("${SOURCE_PROJECT_ROOT}/src/main/java")
if [[ -d "${SOURCE_PROJECT_ROOT}/src/community-proprietary/java" ]]; then
  SOURCE_ROOTS+=("${SOURCE_PROJECT_ROOT}/src/community-proprietary/java")
fi

JAVA_SOURCES=()
while IFS= read -r -d '' source_file; do
  JAVA_SOURCES+=("${source_file}")
done < <(find "${SOURCE_ROOTS[@]}" -type f -name '*.java' -print0)

(( ${#JAVA_SOURCES[@]} > 0 )) || fail "没有找到 Java 源文件。"

rm -rf "${CLASSES_DIR}"
mkdir -p "${CLASSES_DIR}" "$(dirname -- "${OUTPUT_JAR}")"

note "使用 ${JAVAC} 编译 ${#JAVA_SOURCES[@]} 个 Java 文件。"
"${JAVAC}" \
  -encoding UTF-8 \
  --release 17 \
  -d "${CLASSES_DIR}" \
  "${JAVA_SOURCES[@]}"

rm -f "${OUTPUT_JAR}"
"${JAR_TOOL}" \
  --create \
  --file "${OUTPUT_JAR}" \
  --main-class com.femonster.FeMonsterJavaApp \
  -C "${CLASSES_DIR}" .

note "Java 后端已生成：${OUTPUT_JAR}"
printf '%s\n' "${OUTPUT_JAR}"

