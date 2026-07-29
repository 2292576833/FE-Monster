import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const headerPath = path.join(root, 'native', 'windows', 'audio', 'fe_audio_pipeline.h');
const sourcePath = path.join(root, 'native', 'windows', 'audio', 'fe_audio_pipeline.cpp');
const probePath = path.join(root, 'native', 'windows', 'audio', 'fe_audio_probe.cpp');
const cmakePath = path.join(root, 'native', 'windows', 'CMakeLists.txt');
const buildScriptPath = path.join(root, 'scripts', 'build-xaudio2.ps1');
const rustManifestPath = path.join(root, 'native', 'rust-audio-upmix', 'Cargo.toml');
const rustLockPath = path.join(root, 'native', 'rust-audio-upmix', 'Cargo.lock');
const rustSourcePath = path.join(root, 'native', 'rust-audio-upmix', 'src', 'lib.rs');
const jniBridgePath = path.join(root, 'native', 'windows', 'fe_monster_xaudio2.cpp');
const javaBridgePath = path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java');
const apiRoutesPath = path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java');
const appPath = path.join(root, 'web', 'app.js');
const pcmWorkletPath = path.join(root, 'web', 'vendor', 'native-spatial', 'native-pcm-worklet.js');

for (const file of [
  headerPath,
  sourcePath,
  probePath,
  cmakePath,
  buildScriptPath,
  rustManifestPath,
  rustLockPath,
  rustSourcePath,
  jniBridgePath,
  javaBridgePath,
  apiRoutesPath,
  appPath,
  pcmWorkletPath
]) {
  assert.ok(existsSync(file), `Missing native spatial-audio pipeline file: ${file}`);
}

const header = readFileSync(headerPath, 'utf8');
const source = readFileSync(sourcePath, 'utf8');
const probe = readFileSync(probePath, 'utf8');
const cmake = readFileSync(cmakePath, 'utf8');
const buildScript = readFileSync(buildScriptPath, 'utf8');
const rustManifest = readFileSync(rustManifestPath, 'utf8');
const rustSource = readFileSync(rustSourcePath, 'utf8');
const jniBridge = readFileSync(jniBridgePath, 'utf8');
const javaBridge = readFileSync(javaBridgePath, 'utf8');
const apiRoutes = readFileSync(apiRoutesPath, 'utf8');
const app = readFileSync(appPath, 'utf8');
const pcmWorklet = readFileSync(pcmWorkletPath, 'utf8');

assert.match(header, /FE_AUDIO_PIPELINE_ABI_VERSION\s+3u/);
assert.match(header, /FE_AUDIO_MODE_DRY/);
assert.match(header, /FE_AUDIO_MODE_X3D_SPEAKER/);
assert.match(header, /FE_AUDIO_MODE_OBR_BINAURAL/);
assert.match(header, /fe_audio_pipeline_submit/);
assert.match(header, /fe_audio_pipeline_get_status/);
assert.match(header, /rust_upmix_process_calls/);
assert.match(header, /rust_upmix_fallback_blocks/);
assert.match(header, /queue_underruns/);
assert.match(header, /buffer_pool_exhaustions/);
assert.match(header, /voice_started/);

assert.match(source, /X3DAudioCalculate\s*\(/);
assert.match(source, /SetOutputMatrix\s*\(/);
assert.match(source, /obr::ObrImpl/);
assert.match(source, /\.Process\s*\(/);
assert.match(source, /CreateSourceVoice\s*\(/);
assert.match(source, /SubmitSourceBuffer\s*\(/);
assert.match(source, /CreateMasteringVoice\s*\(/);
assert.match(source, /OnBufferEnd\s*\(/);
assert.match(source, /FE_AUDIO_MODE_OBR_BINAURAL/);
assert.match(source, /fe_rust_upmix_process/);
assert.match(source, /TryRustUpmixBlock/);
assert.match(source, /buffer_available_cv_\.wait_for/);
assert.match(
  source,
  /kPrerollQueuedBuffers\s*=\s*24/
);
assert.match(source, /rust_upmixed[\s\S]{0,500}VirtualChannelSample/);
assert.match(
  source,
  /if\s*\([^)]*mode[^)]*FE_AUDIO_MODE_OBR_BINAURAL[^)]*\)[\s\S]{0,800}\.Process\s*\(/,
  'Google OBR Process must be guarded by the binaural mode.'
);

assert.match(probe, /left/i);
assert.match(probe, /right/i);
assert.match(probe, /output_energy/i);
assert.match(probe, /buffers_consumed/i);
assert.match(probe, /std::isfinite/);
assert.match(probe, /dry_bypasses_rust_upmix/);
assert.match(probe, /rust_upmix_process_calls/);

assert.match(cmake, /CXX_STANDARD\s+20/);
assert.match(cmake, /google_obr_official/);
assert.match(cmake, /fe_audio_probe/);
assert.match(cmake, /xaudio2/i);
assert.match(cmake, /x3daudio/i);

assert.match(buildScript, /478dc7c752d5eccae534635139ff0253eee3a14a/);
assert.match(buildScript, /github\.com\/google\/obr\.git/);
assert.match(buildScript, /cmake/i);
assert.match(buildScript, /fe_audio_probe/i);
assert.match(buildScript, /cargo\s+build[\s\S]{0,200}--locked/i);
assert.match(buildScript, /fe_monster_upmix\.dll/i);

assert.match(rustManifest, /oximedia-audiopost\s*=\s*\{[^}]*=0\.2\.0/);
assert.match(rustManifest, /crate-type\s*=\s*\[[^\]]*"cdylib"/);
assert.match(rustSource, /SurroundUpmixer/);
assert.match(rustSource, /upmix_stereo_to_51/);
assert.match(rustSource, /upmix_51_to_71/);
assert.match(rustSource, /fe_rust_upmix_process/);

assert.match(jniBridge, /nativeConfigureSpatial/);
assert.match(jniBridge, /nativeSubmitSpatialPcm/);
assert.match(jniBridge, /nativeSetSpatialMuted/);
assert.match(jniBridge, /nativeSpatialStatus/);
assert.match(javaBridge, /startSpatialStream/);
assert.match(javaBridge, /submitSpatialPcm/);
assert.match(apiRoutes, /\/api\/audio\/spatial\/stream/);
assert.match(apiRoutes, /ByteOrder\.LITTLE_ENDIAN/);
assert.match(app, /createNativeGoogleObrGraph/);
assert.match(app, /waitForNativeGoogleObrPreroll/);
assert.match(app, /function refreshNativeGoogleObrHealth/);
assert.match(
  app,
  /refreshNativeGoogleObrHealth\(\)\.catch\(\(\)\s*=>\s*\{\s*\}\),\s*250/
);
assert.match(app, /Native XAudio2 queue underrun/);
assert.match(
  app,
  /function lyricAudioOutputLatencySeconds[\s\S]{0,700}nativeOutputLatencySeconds/
);
assert.match(app, /native-rust-x3d-obr-xaudio2/);
assert.match(pcmWorklet, /registerProcessor\(['"]fe-native-pcm-bridge/);
assert.match(pcmWorklet, /Float32Array/);

console.log(JSON.stringify({
  pass: true,
  abi: 'versioned-c-pod-v3+jni-stream',
  modes: ['dry', 'x3d-speaker', 'obr-binaural'],
  pipeline: [
    'OxiMedia Rust SurroundUpmixer',
    'X3DAudioCalculate',
    'Google OBR Process',
    'XAudio2 SourceVoice',
    'MasteringVoice'
  ],
  bypass: 'dry mode never loads/calls Rust upmix or Google OBR'
}, null, 2));
