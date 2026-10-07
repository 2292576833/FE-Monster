import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const java = readFileSync(path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'), 'utf8');
const native = readFileSync(path.join(root, 'native/macos/fe_monster_coreaudio.cpp'), 'utf8');
const declarations = [...java.matchAll(/private static native\s+\S+\s+(native\w+)\s*\(/g)].map((match) => match[1]);
const exports = [...native.matchAll(/Java_com_femonster_core_NativeAudioEngine_(native\w+)\s*\(/g)].map((match) => match[1]);
assert.deepEqual([...exports].sort(), [...declarations].sort(), 'every Java audio JNI method must have exactly one Mac export');
const jniType = new Map([['boolean', 'jboolean'], ['int', 'jint'], ['long', 'jlong'],
  ['float', 'jfloat'], ['float[]', 'jfloatArray'], ['double[]', 'jdoubleArray'],
  ['ByteBuffer', 'jobject'], ['void', 'void']]);
const nativeSignatures = new Map([...native.matchAll(/JNI_AUDIO\((\w+)\)\s+Java_com_femonster_core_NativeAudioEngine_(native\w+)\s*\(([^)]*)\)/g)]
  .map((match) => [match[2], { result: match[1], args: match[3].split(',').map((arg) => arg.trim().split(/\s+/)[0]) }]));
for (const method of java.matchAll(/private static native\s+(\S+)\s+(native\w+)\s*\(([^)]*)\)\s*;/g)) {
  const args = method[3].trim() ? method[3].split(',').map((arg) => jniType.get(arg.trim().split(/\s+/)[0])) : [];
  assert.deepEqual(nativeSignatures.get(method[2]), { result: jniType.get(method[1]), args: ['JNIEnv*', 'jclass', ...args] },
    `JNI parameter and result types differ for ${method[2]}`);
}
assert(java.includes('libfe-monster-coreaudio.dylib') && java.includes('"coreaudio"'));
assert(native.includes('kAudioUnitSubType_DefaultOutput') && native.includes('AudioOutputUnitStart'));
assert(native.includes('if (nowUs() - capture_at > 500000)'), 'external system PCM takes precedence only while fresh');
assert(!native.includes('system(') && !native.includes('popen('));
const cmake = readFileSync(path.join(root, 'native/macos/CMakeLists.txt'), 'utf8');
assert(cmake.includes('CMAKE_POSITION_INDEPENDENT_CODE ON'));
assert(cmake.includes('INSTALL_RPATH "@loader_path"'));
assert(cmake.includes('"static_cast<size_t>(8192)"'), 'FFT tuning must preserve the original size_t expression type');
assert(cmake.includes('"${FE_OBR_DECODER_NEEDLE}" "fft_manager->GetFftSize()"'),
  'decoder frequency buffer must match the configured FFT size');
assert(cmake.includes('"${FE_OBR_DECODER_SOURCE}"'), 'OBR must build the corrected decoder source');
assert(cmake.includes('"frames_per_buffer_" "(fft_size_ / 2)" FE_OBR_FFT_BINS'),
  'magnitude and phase utilities must index the actual FFT bins');
const build = readFileSync(path.join(root, 'native/macos/build-audio.sh'), 'utf8');
assert(build.includes('aarch64-apple-darwin') && build.includes('x86_64-apple-darwin'));
assert(build.includes('cargo build --locked'));
assert(!build.includes('\r'), 'native shell build must have LF newlines');

const zig = path.join(root, '.tmp/mac-audio-probe-tools/zig-x86_64-windows-0.15.2/zig.exe');
const compiler = process.env.FE_MAC_AUDIO_CXX || (existsSync(zig) ? zig : 'c++');
const compilerArgs = compiler.endsWith('zig.exe') || compiler.endsWith('/zig') ? ['c++'] : [];
const output = path.join(root, '.tmp/mac-audio-probes');
mkdirSync(output, { recursive: true });
const executable = path.join(output, process.platform === 'win32' ? 'fe_pcm_queue_probe.exe' : 'fe_pcm_queue_probe');
const compiled = spawnSync(compiler, [...compilerArgs, '-std=c++20', '-O2', '-pthread',
  ...(process.platform === 'win32' ? ['-mno-avx512f'] : []),
  path.join(root, 'native/macos/audio/fe_pcm_queue_probe.cpp'), '-o', executable], {
  cwd: root, encoding: 'utf8', timeout: 300000,
});
assert.equal(compiled.error, undefined, `C++ compiler required for portable audio behavior: ${compiled.error?.message}`);
assert.equal(compiled.status, 0, compiled.stderr || compiled.stdout || `Compiler signal: ${compiled.signal}`);
const result = process.platform === 'win32'
  ? spawnSync('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference = 'Stop'; & '${executable.replaceAll("'", "''")}'; exit $LASTEXITCODE`],
    { cwd: root, encoding: 'utf8', timeout: 30000 })
  : spawnSync(executable, [], { cwd: root, encoding: 'utf8', timeout: 30000 });
assert.equal(result.error, undefined, result.error?.message);
assert.equal(result.status, 0, result.stderr || result.stdout);
assert.match(result.stdout, /PCM queue generation\/backpressure\/lease\/SPSC PASS/);
process.stdout.write(result.stdout);
console.log(`macOS JNI ABI (${declarations.length} exports), dylib packaging, architecture and portable audio behavior PASS`);
