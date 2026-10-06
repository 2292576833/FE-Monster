import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const pipeline = source.slice(source.indexOf('class AudioPipeline final'));
function method(signature, fallback) {
  const start = pipeline.indexOf(signature);
  if (start < 0 && fallback) return fallback;
  assert.ok(start >= 0, `production method missing: ${signature}`);
  let cursor = pipeline.indexOf('{', start) + 1, depth = 1;
  while (depth && cursor < pipeline.length) {
    if (pipeline[cursor] === '{') depth++;
    if (pipeline[cursor] === '}') depth--;
    cursor++;
  }
  return pipeline.slice(start, cursor);
}
const callback = method('void OnBufferStart(', 'void OnBufferStart(QueuedAudioBuffer*) {}');
const reset = method('void ResetUnderrunEnvelope(', 'void ResetUnderrunEnvelope() {}');
assert.doesNotMatch(callback, /Sleep\(|WaitFor|(?:scoped|unique|lock_guard).*lock|\.resize\(|\.push_back\(|new /,
  'the audio callback may only do bounded arithmetic on the existing buffer');
const scratch = path.join(root, 'tmp/native-spatial-underrun-envelope');
mkdirSync(scratch, { recursive: true });
const fixture = readFileSync(path.join(root, 'scripts/fixtures/native-spatial-underrun-envelope.cpp'), 'utf8')
  .replace('// PRODUCTION_METHODS', `${callback}\n${reset}`);
writeFileSync(path.join(scratch, 'probe.cpp'), fixture);
const live = process.argv.includes('--live');
if (live) {
  const liveMethods = [callback, method('static int64_t CurrentUnixMilliseconds('),
    method('static int64_t CurrentMonotonicMilliseconds(')].join('\n');
  writeFileSync(path.join(scratch, 'live.cpp'),
    readFileSync(path.join(root, 'scripts/fixtures/native-spatial-underrun-live.cpp'), 'utf8')
      .replace('// PRODUCTION_METHODS', liveMethods));
}
writeFileSync(path.join(scratch, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.24)
project(fe_underrun_envelope LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(fe_underrun_envelope probe.cpp)
${live ? 'add_executable(fe_underrun_live live.cpp)\ntarget_link_libraries(fe_underrun_live PRIVATE xaudio2 ole32)' : ''}
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
const report = JSON.parse(run(path.join(scratch, 'build/Release/fe_underrun_envelope.exe'), []));
const output = path.join(root, 'output/native-audio-underrun');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, process.argv.includes('--baseline') ? 'before.json' : 'after.json'),
  JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(report.pass, true, report.failures.join('; '));
assert.match(source, /void STDMETHODCALLTYPE OnBufferStart\(void\* context\) override;/);
assert.match(source, /void STDMETHODCALLTYPE SourceVoiceCallback::OnBufferStart\(void\* context\)[\s\S]*?owner_->OnBufferStart/);
assert.match(method('HRESULT ResetTimelineForGeneration('), /DestroyVoice\(\);[\s\S]*?ResetUnderrunEnvelope\(\)/,
  'seek resets callback-owned envelope only after DestroyVoice has joined callbacks');
console.log('Native underrun sample-envelope PASS (real production callback; no audio device)');
if (live) {
  const liveReport = JSON.parse(run(path.join(scratch, 'build/Release/fe_underrun_live.exe'), []));
  writeFileSync(path.join(output, 'live.json'), JSON.stringify(liveReport, null, 2) + '\n');
  console.log(JSON.stringify(liveReport, null, 2));
  assert.equal(liveReport.pass, true, 'muted XAudio2 callback envelope failed');
}
