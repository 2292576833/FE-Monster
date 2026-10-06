import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Compile real control methods against a silent voice and deterministic Win32
// timer. This checks gain commands and cleanup, not audible XAudio2 output.
const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const pipeline = source.slice(source.indexOf('class AudioPipeline final'));
function method(signature, optional = false) {
  const start = pipeline.indexOf(signature);
  if (start < 0 && optional) return '';
  assert.ok(start >= 0, `production method missing: ${signature}`);
  let cursor = pipeline.indexOf('{', start) + 1;
  let depth = 1;
  while (depth && cursor < pipeline.length) {
    if (pipeline[cursor] === '{') depth++;
    if (pipeline[cursor] === '}') depth--;
    cursor++;
  }
  return pipeline.slice(start, cursor);
}
const constants = source.split(/\r?\n/).filter(line =>
  /^constexpr .*\bk(?:SourceVoiceFade|CreateWaitableTimerHighResolution)/.test(line)).join('\n');
const scratch = path.join(root, 'tmp/native-spatial-volume-ramp');
mkdirSync(scratch, { recursive: true });
const fixture = readFileSync(path.join(root, 'scripts/fixtures/native-spatial-volume-ramp.cpp'), 'utf8')
  .replace('// PRODUCTION_CONSTANTS', constants)
  .replace('// PRODUCTION_METHODS', [
    method('HRESULT FadeSourceVoiceTo(', true),
    method('HRESULT SetMuted('),
    method('void Shutdown('),
  ].join('\n'));
writeFileSync(path.join(scratch, 'probe.cpp'), fixture);
writeFileSync(path.join(scratch, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.24)
project(fe_volume_ramp LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(fe_volume_ramp probe.cpp)
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
const report = JSON.parse(run(path.join(scratch, 'build/Release/fe_volume_ramp.exe'), []));
const output = path.join(root, 'output/native-audio-volume-ramp');
mkdirSync(output, { recursive: true });
const label = process.argv.includes('--baseline') ? 'before' : 'after';
writeFileSync(path.join(output, `${label}.json`), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(report.pass, true, report.failures.join('; '));
assert.match(source, /source_voice_->SetVolume\(muted_\.load\(\) \? 0\.0f : 1\.0f\)/,
  'initial voice must apply configured mute before it can start');
const callback = method('void OnBufferEnd(');
assert.doesNotMatch(callback, /FadeSourceVoiceTo|Sleep\(|WaitForSingleObject/,
  'audio callbacks must never wait for a control fade');
console.log('Native control-volume ramp and cleanup PASS (silent fake voice; not a sample-accurate envelope)');
