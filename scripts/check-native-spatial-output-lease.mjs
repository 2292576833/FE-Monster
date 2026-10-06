import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const source = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const pipeline = source.slice(source.indexOf('class AudioPipeline final'));
function method(signature) {
  const start = pipeline.indexOf(signature);
  assert.ok(start >= 0, `production method missing: ${signature}`);
  let cursor = pipeline.indexOf('{', start) + 1, depth = 1;
  while (depth && cursor < pipeline.length) {
    if (pipeline[cursor] === '{') depth++;
    if (pipeline[cursor] === '}') depth--;
    cursor++;
  }
  return pipeline.slice(start, cursor);
}
const names = ['HRESULT SetOutputGain(', 'HRESULT RenewOutputGainLease(', 'HRESULT FadeSourceVoiceTo(',
  'HRESULT SourceGainSettleMilliseconds(', 'void OnBufferStart(', 'void ResetOutputGainLease(',
  'static int64_t CurrentUnixMilliseconds(', 'static int64_t CurrentMonotonicMilliseconds(',
  'static bool ValidOutputGainLeaseDeadline(', 'bool ExtendOutputGainLease('];
names.push('int64_t OutputGainLeaseTickDeadline(');
const scratch = path.join(root, 'tmp/native-spatial-output-lease');
mkdirSync(scratch, { recursive: true });
const constants = source.split(/\r?\n/).filter(line =>
  /^constexpr .*\bk(?:SourceVoiceFade|CreateWaitableTimerHighResolution|UnderrunFadeInactive)/.test(line)).join('\n');
writeFileSync(path.join(scratch, 'probe.cpp'),
  readFileSync(path.join(root, 'scripts/fixtures/native-spatial-output-lease.cpp'), 'utf8')
    .replace('// PRODUCTION_CONSTANTS', constants)
    .replace('// PRODUCTION_METHODS', names.map(method).join('\n')));
writeFileSync(path.join(scratch, 'CMakeLists.txt'), `cmake_minimum_required(VERSION 3.24)
project(fe_output_lease LANGUAGES CXX)
set(CMAKE_CXX_STANDARD 20)
add_executable(fe_output_lease probe.cpp)
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
const report = JSON.parse(run(path.join(scratch, 'build/Release/fe_output_lease.exe'), []));
const output = path.join(root, 'output/native-audio-underrun');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, process.argv.includes('--baseline') ? 'lease-before-anchor.json' : 'lease.json'),
  JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(report.pass, true, report.failures.join('; '));
const reset = method('HRESULT ResetTimelineForGeneration(');
assert.match(reset, /GetVolume\(&initial_gain\)/);
assert.match(reset, /initial_gain \* std::cos\(/);
assert.match(reset, /DestroyVoice\(\);[\s\S]*?ResetOutputGainLease\(\)/);
assert.match(source, /fe_audio_pipeline_set_output_gain\(/);
assert.match(source, /fe_audio_pipeline_renew_output_gain_lease\(/);
console.log('Native output-gain lease PASS (real production controls and callback, deterministic clocks)');
