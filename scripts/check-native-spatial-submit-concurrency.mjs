import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Compile the actual production Submit body against a silent, deterministic
// queue. No XAudio2 device, installed DLL, playback or timing sleeps are used.
const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const start = source.indexOf('    HRESULT Submit(');
assert.ok(start >= 0, 'production Submit entry point missing');
const bodyStart = source.indexOf('{', start);
let depth = 1;
let end = bodyStart + 1;
while (depth && end < source.length) {
  if (source[end] === '{') depth++;
  if (source[end] === '}') depth--;
  end++;
}
const submit = source.slice(start, end).replaceAll('std::mutex', 'TrackedMutex');
const explicitGeneration = /uint64_t expected_generation/.test(submit);
const scratch = path.join(root, 'tmp/native-spatial-submit-concurrency');
mkdirSync(scratch, { recursive: true });
const fixture = readFileSync(path.join(root, 'scripts/fixtures/native-spatial-submit-concurrency.cpp'), 'utf8')
  .replace('// PRODUCTION_SUBMIT_BODY', submit)
  .replace('// PRODUCTION_HAS_GENERATION', `#define HAS_GENERATION ${explicitGeneration ? 1 : 0}`);
writeFileSync(path.join(scratch, 'probe.cpp'), fixture);
writeFileSync(path.join(scratch, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.24)
project(fe_submit_concurrency LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(fe_submit_concurrency probe.cpp)
`);
const cache = readFileSync(path.join(root, 'native/windows/.cmake-build-xaudio2-vs18/CMakeCache.txt'), 'utf8');
const cmake = process.env.CMAKE_COMMAND || cache.match(/^CMAKE_COMMAND:INTERNAL=(.+)$/m)?.[1]?.trim() || 'cmake';
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
run(cmake, ['-S', scratch, '-B', path.join(scratch, 'build'), '-G', 'Visual Studio 18 2026', '-A', 'x64']);
run(cmake, ['--build', path.join(scratch, 'build'), '--config', 'Release']);
console.log(run(path.join(scratch, 'build/Release/fe_submit_concurrency.exe'), []));

const header = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.h'), 'utf8');
const jni = readFileSync(path.join(root, 'native/windows/fe_monster_xaudio2.cpp'), 'utf8');
const java = readFileSync(path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'), 'utf8');
assert.match(header, /FE_AUDIO_PIPELINE_ABI_VERSION 4u/, 'additive exports must preserve existing ABI structs');
assert.match(header, /fe_audio_pipeline_submit_generation/);
assert.match(jni, /nativeSubmitSpatialPcmDirectGeneration[\s\S]*?fe_audio_pipeline_submit_generation/);
assert.match(java, /nativeSubmitSpatialPcmDirectGeneration\(pcm, frames, generation, sequence\)/);
assert.match(java, /nativeResetSpatialTimelineGeneration\(generation, nextGeneration\)/);
assert.match(source, /timeline_generation_\.store\(next_generation\)/);
assert.doesNotMatch(java, /return nativeSubmitSpatialPcm\(pcm, frames\)/,
  'new Java must fail to browser fallback on older DLLs, never silently use unsafe untagged submit');
console.log('Native generation JNI/Java contract PASS');
