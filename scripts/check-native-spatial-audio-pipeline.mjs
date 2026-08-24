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
const mixerHeaderPath = path.join(root, 'native', 'rust-audio-upmix', 'include', 'fe_rust_mixer.h');
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
  mixerHeaderPath,
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
const mixerHeader = readFileSync(mixerHeaderPath, 'utf8');
const jniBridge = readFileSync(jniBridgePath, 'utf8');
const javaBridge = readFileSync(javaBridgePath, 'utf8');
const apiRoutes = readFileSync(apiRoutesPath, 'utf8');
const app = readFileSync(appPath, 'utf8');
const pcmWorklet = readFileSync(pcmWorkletPath, 'utf8');

assert.match(header, /FE_AUDIO_PIPELINE_ABI_VERSION\s+4u/);
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
assert.match(header, /FeAudioMixerPipelineStatus/);
assert.match(header, /fe_audio_pipeline_set_mixer_params/);
assert.match(header, /fe_audio_pipeline_get_mixer_status/);
assert.match(header, /mixer_process_calls/);
assert.match(header, /mixer_bypassed_blocks/);
assert.match(header, /mixer_process_failures/);
assert.match(header, /mixer_consecutive_failures/);
assert.match(header, /last_upmix_ordinal/);
assert.match(header, /last_mixer_ordinal/);
assert.match(header, /last_obr_ordinal/);
assert.match(header, /FeAudioSpatialControlParams/);
assert.match(header, /fe_audio_pipeline_set_spatial_controls/);
assert.match(header, /FE_AUDIO_ROUTE_STEREO_MIXER_OUT/);
assert.match(header, /FE_AUDIO_ROUTE_UPMIX_MIXER_NON_OBR_OUT/);
assert.match(header, /FE_AUDIO_ROUTE_STEREO_MIXER_OBR/);
assert.match(header, /FE_AUDIO_ROUTE_UPMIX_MIXER_X3D_OBR/);

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
assert.match(
  source,
  /const bool block_rust_upmixed\s*=\s*submission_rust_upmixed\s*&&\s*submission_upmix_generation\s*==\s*upmix_generation_\s*&&\s*SpatialUpmixEnabled\(\)/,
  'transport-batch Rust upmix must be invalidated when a 256-frame boundary rebuilds the route'
);
assert.match(source, /class RustMixerBridge final/);
assert.match(source, /std::atomic<int32_t>\s+last_result_/,
  'RustMixerBridge last_result must be atomic across control/render threads');
for (const symbol of [
  'fe_rust_mixer_abi_version',
  'fe_rust_mixer_create',
  'fe_rust_mixer_stage_params',
  'fe_rust_mixer_commit',
  'fe_rust_mixer_process',
  'fe_rust_mixer_get_status',
  'fe_rust_mixer_reset',
  'fe_rust_mixer_destroy'
]) {
  assert.match(source, new RegExp(symbol), `Mixer ABI export is not loaded: ${symbol}`);
}
assert.match(source, /mixer_original_scratch_\.assign/);
assert.match(source, /mixer_work_scratch_\.assign/);
assert.match(source, /kMixerConsecutiveFailureLimit\s*=\s*3/);
assert.match(source, /mixer_consecutive_failures_[\s\S]{0,400}mixer_failure_disabled_/);
const spatialRender = source.slice(
  source.indexOf('HRESULT RenderSpatialBlock('),
  source.indexOf('void UpdateOutputEnergy(', source.indexOf('HRESULT RenderSpatialBlock('))
);
assert.ok(spatialRender.length > 0, 'RenderSpatialBlock implementation is missing');
assert.doesNotMatch(spatialRender, /make_unique|push_back|reserve\s*\(|resize\s*\(|LoadLibrary|GetProcAddress|std::scoped_lock|std::unique_lock/,
  'Mixer render insertion introduced allocation, loading, or locking into the 256-frame hot path');
assert.match(spatialRender, /mixer_original_scratch_/);
assert.match(spatialRender, /mixer_work_scratch_/);
assert.match(
  spatialRender,
  /rust_upmix_scratch_\.size\(\)\s*>=\s*required_upmix_samples[\s\S]{0,1800}VirtualChannelSample/,
  'stale or undersized Rust scratch must fall back safely instead of indexing rebuilt storage'
);
assert.match(spatialRender, /mixer_processed[\s\S]{0,900}mixer_original_scratch_/,
  'partial in-place Mixer failure must deinterleave the untouched original scratch');
assert.match(spatialRender, /TryMixerBlock[\s\S]{0,900}FoldBedToStereo/,
  'all four spatial routes must pass through Mixer before stereo fold-down or OBR');
assert.match(spatialRender, /if\s*\(!SpatialObrEnabled\(\)\)[\s\S]{0,2000}return S_OK;/,
  'OBR-off routes must keep Mixer output and bypass only OBR');
assert.match(spatialRender, /renderer\.Process\s*\(/,
  'OBR-on routes must invoke the official renderer');
assert.match(spatialRender, /LatencyAlignedObrDry/,
  'partial OBR wet\/dry blends must align the dry path to renderer latency');
assert.match(spatialRender, /ApplyOutputSafetyLimiter/,
  'all spatial routes need one final linked safety limiter');

assert.match(probe, /left/i);
assert.match(probe, /right/i);
assert.match(probe, /output_energy/i);
assert.match(probe, /buffers_consumed/i);
assert.match(probe, /std::isfinite/);
assert.match(probe, /dry_bypasses_rust_upmix/);
assert.match(probe, /rust_upmix_process_calls/);
assert.match(probe, /ProbeMixerDirect/);
assert.match(probe, /ProbeMixerTransportBatch/);
assert.match(probe, /rust_upmix_process_calls\s*==\s*1[\s\S]{0,300}mixer_process_calls\s*==\s*16[\s\S]{0,300}obr_process_calls\s*==\s*16/,
  'one 4096-frame upmix call must feed sixteen Mixer/OBR render blocks');
assert.match(probe, /ProbeMixerCppFallback/);
assert.match(probe, /ProbeMixerInitFailure/);
assert.match(probe, /ProbeMixerPartialFailure/);
assert.match(probe, /partial_failure_output_matches_control/,
  'partial-failure probe must compare output with an untouched bypass control');
assert.match(probe, /ProbeMixerFailureDisableAndRetry/);
assert.match(probe, /ProbeMixerBusyRetry/);
assert.match(probe, /ProbeMixerConcurrentControlRender/);
assert.match(probe, /concurrent_control_render_stress/,
  'the C pipeline seam needs concurrent render/parameter-control coverage');
assert.match(probe, /FE_RUST_MIXER_BUSY[\s\S]{0,900}staged_revision\s*!=\s*1[\s\S]{0,900}fe_audio_pipeline_set_mixer_params\([\s\S]{0,120}\b1\b/,
  'BUSY must preserve the staged revision for an exact same-revision retry');
assert.match(probe, /last_upmix_ordinal[\s\S]{0,300}last_mixer_ordinal[\s\S]{0,300}last_obr_ordinal/);

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
assert.match(mixerHeader, /FE_RUST_MIXER_ABI_VERSION\s+1u/);
assert.equal(
  (mixerHeader.match(/typedef .*FeRustMixer[A-Za-z]+Fn/g) || []).length,
  8,
  'Task 3 Mixer ABI must remain exactly eight functions'
);

assert.match(jniBridge, /nativeConfigureSpatial/);
assert.match(jniBridge, /nativeSubmitSpatialPcm/);
assert.match(jniBridge, /nativeSetSpatialMuted/);
assert.match(jniBridge, /nativeSpatialStatus/);
assert.match(jniBridge, /nativeSetMixerParameters/);
assert.match(jniBridge, /nativeMixerStatus/);
assert.match(jniBridge, /static_cast<uint64_t>\(revision\)\s*\+\s*1/,
  'logical Java revision zero must map to a positive native Mixer revision');
assert.match(jniBridge, /status\.active_revision\s*>\s*0[\s\S]{0,120}status\.active_revision\s*-\s*1/,
  'native active revisions must translate back to logical Java revisions');
assert.match(jniBridge, /status\.active_revision\s*>\s*0[\s\S]{0,180}:\s*-1\.0/,
  'an uncommitted native Mixer revision must not alias logical revision zero');
assert.match(jniBridge, /status\.spatial_active_revision\s*>\s*0[\s\S]{0,180}:\s*-1\.0/,
  'an uncommitted native spatial revision must not alias logical revision zero');
assert.match(javaBridge, /startSpatialStream/);
assert.match(javaBridge, /submitSpatialPcm/);
assert.match(javaBridge, /mixerPayload/);
assert.match(javaBridge, /NATIVE_MIXER_VALUE_COUNT\s*=\s*44/);
assert.match(javaBridge, /NATIVE_MIXER_STATUS_SIZE\s*=\s*29/);
assert.match(javaBridge, /nativeSetMixerParameters\s*\([\s\S]{0,240}int rampFrames/);
assert.match(javaBridge, /nativeMixerStatus\s*\(\)/);
assert.match(javaBridge, /NATIVE_SPATIAL_STATUS_SIZE\s*=\s*32/,
  'the additive spatial status contract must include four-state controls and Mixer counters');
assert.match(javaBridge, /spatialRevisionCommitted/,
  'the Java bridge must expose whether logical spatial revision zero really committed');
assert.match(apiRoutes, /\/api\/audio\/spatial\/stream/);
assert.match(apiRoutes, /ByteOrder\.LITTLE_ENDIAN/);
assert.match(app, /createNativeGoogleObrGraph/);
assert.match(app, /waitForNativeGoogleObrPreroll/);
assert.match(app, /mixerControlRevision:\s*control\.revision/,
  'native preroll must retain the exact Mixer revision that started the stream');
assert.match(app, /status\.spatialRevisionCommitted\s*===\s*true/,
  'native preroll must not unmute an uncommitted logical revision zero');
assert.match(app, /status\.transitionPending\s*!==\s*true/,
  'native preroll must wait for the atomic Mixer/spatial transition');
assert.match(app, /control\.upmixEnabled\s*!==\s*true[\s\S]{0,180}status\.rustUpmixActive/,
  'layout verification must require Rust upmix only when upmix is enabled');
assert.match(app, /control\.obrEnabled\s*!==\s*true[\s\S]{0,120}status\.obrProcessCalls/,
  'layout verification must require OBR calls only when OBR is enabled');
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
  abi: 'versioned-c-pod-v4+jni-stream',
  modes: ['dry', 'x3d-speaker', 'obr-binaural'],
  pipeline: [
    'OxiMedia Rust SurroundUpmixer',
    'Rust Mixer ABI v1',
    'X3DAudioCalculate',
    'Google OBR Process',
    'XAudio2 SourceVoice',
    'MasteringVoice'
  ],
  bypass: 'independent upmix/OBR switches preserve Mixer output; legacy dry mode remains an explicit bypass'
}, null, 2));
