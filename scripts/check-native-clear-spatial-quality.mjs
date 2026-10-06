import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// This independent renderer executable never creates an audio output device.
const executable = path.join(root, 'native/windows/.cmake-build-audio-quality-vs18/runtime/fe_audio_quality_probe.exe');
const rustDll = process.env.FE_MONSTER_RUST_UPMIX_DLL
  || path.join(root, 'native/rust-audio-upmix/target/release/fe_monster_upmix.dll');
const result = spawnSync(executable, [], {
  cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000,
  env: { ...process.env, FE_MONSTER_RUST_UPMIX_DLL: rustDll },
});
assert.equal(result.error, undefined, result.error?.message);
const report = JSON.parse(result.stdout);
assert.ok(report.clearSpatial, 'offline probe must report the optional 5.1 width-1.10 geometry');
assert.equal(report.clearSpatial.pass, true, JSON.stringify(report.clearSpatial));
assert.equal(report.clearSpatial.nonFiniteSamples, 0);
assert.equal(report.clearSpatial.hardClipSamples, 0);
assert.ok(report.clearSpatial.monoRetentionDb >= -1.0, 'coherent center programme must remain mono-compatible');
assert.ok(report.clearSpatial.peak <= 0.944061);
assert.equal(result.status, 0, `existing quality gates regressed: ${report.firstFailingMetric}`);
assert.equal(report.pass, true, `existing quality gates regressed: ${report.firstFailingMetric}`);
console.log(JSON.stringify({ pass: true, deviceInitialized: false, clearSpatial: report.clearSpatial,
  existingQualityGates: report.qualityGates }, null, 2));
