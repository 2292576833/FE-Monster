import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'audio-spatial-controls-contract');
const classes = path.join(scratch, 'classes');
const data = path.join(scratch, 'data');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  'D:\\java26',
  'C:\\Program Files\\Java\\jdk-17',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';

const service = readFileSync(path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'), 'utf8');
const engine = readFileSync(path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'), 'utf8');
const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
const pipelineHeader = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.h'), 'utf8');
const pipelineSource = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const jniSource = readFileSync(path.join(root, 'native/windows/fe_monster_xaudio2.cpp'), 'utf8');
const nativeProbe = readFileSync(path.join(root, 'native/windows/audio/fe_audio_probe.cpp'), 'utf8');
const nativeCmake = readFileSync(path.join(root, 'native/windows/CMakeLists.txt'), 'utf8');
const wasmCmake = readFileSync(path.join(root, 'native/google-obr-wasm/CMakeLists.txt'), 'utf8');
const rustHeader = readFileSync(path.join(root, 'native/rust-audio-upmix/include/fe_rust_upmix.h'), 'utf8');
const rustSource = readFileSync(path.join(root, 'native/rust-audio-upmix/src/lib.rs'), 'utf8');
const obrHeaderPath = path.join(
  root,
  '.tmp/google-obr-native-478dc7c752d5/obr/renderer/obr_impl.h',
);
const obrHeader = existsSync(obrHeaderPath) ? readFileSync(obrHeaderPath, 'utf8') : '';

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
mkdirSync(data, { recursive: true });

const failures = [];
const checks = {};

function contract(name, action) {
  try {
    action();
    checks[name] = true;
  } catch (error) {
    checks[name] = false;
    const rawMessage = String(error?.message || error || 'contract failed');
    const inputIndex = rawMessage.indexOf('Input:');
    const conciseMessage = (inputIndex >= 0 ? rawMessage.slice(0, inputIndex) : rawMessage)
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 800);
    failures.push(`${name}: ${conciseMessage}`);
  }
}

function run(command, args, timeout = 60_000) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: path.join(root, 'tmp'),
      TMP: path.join(root, 'tmp'),
    },
  });
}

try {
  contract('officialObrCapabilityBoundary', () => {
    assert.ok(obrHeader, 'the pinned official OBR header is unavailable');
    assert.match(obrHeader, /BinauralFilterProfile/);
    assert.match(obrHeader, /kAmbient/);
    assert.match(obrHeader, /UpdateObjectPosition/);
    assert.doesNotMatch(obrHeader, /SetRoomSize|SetWet|SetDry|SetSpatialWidth/,
      'continuous UI controls must remain an explicit FE Monster wrapper, not a fake OBR API');
  });

  contract('rustUpmixUsesOnlyRealParameters', () => {
    for (const field of [
      'center_width_hz',
      'lfe_crossover_hz',
      'lfe_gain',
      'center_gain',
      'surround_gain',
      'decorrelation_amount',
    ]) {
      assert.match(rustHeader, new RegExp(`float\\s+${field}\\s*;`));
      assert.match(rustSource, new RegExp(`config\\.${field}`));
    }
    assert.match(rustSource, /UpmixAlgorithm::Passive/);
    assert.match(rustSource, /UpmixAlgorithm::MatrixDecode/);
    assert.match(rustSource, /UpmixAlgorithm::AmbientExtract/);
  });

  contract('additiveServiceParameters', () => {
    for (const key of [
      'upmixEnabled',
      'upmixAlgorithm',
      'upmixOutputLayout',
      'upmixCenterWidthHz',
      'upmixLfeCrossoverHz',
      'upmixCenterGain',
      'upmixSurroundGain',
      'upmixLfeGain',
      'upmixDecorrelation',
      'obrEnabled',
      'obrFilterProfile',
      'obrWet',
      'obrDry',
      'obrOutputGainDb',
      'obrSpatialWidth',
    ]) {
      assert.match(service, new RegExp(`"${key}"`), `missing service parameter ${key}`);
    }
    assert.match(service, /matrix-decode/);
    assert.match(service, /ambient-extract/);
    assert.match(service, /music-detail/);
    assert.match(service, /reverberant/);
    assert.match(service, /legacy|ORIGINAL_PARAMETER_KEYS|migrat/i,
      'pre-spatial v1 files need an explicit compatibility path');
    assert.match(service, /spatialRoute/,
      'snapshot must expose the independently active public route');
  });

  contract('apiRemainsAdditiveAndRevisionSafe', () => {
    assert.match(routes, /case "\/api\/audio\/mixer"/);
    assert.match(routes, /Set\.of\("expectedRevision", "parameters"\)/);
    assert.match(routes, /audio_mixer_revision_conflict/);
    assert.match(routes, /HttpUtil\.sendJson\(exchange,\s*409/);
    assert.doesNotMatch(routes, /\/api\/audio\/upmix\/settings|\/api\/audio\/obr\/settings/,
      'spatial controls must not fork the mixer revision or persistence resource');
  });

  contract('javaJniSnapshotIsOneAtomicControlRevision', () => {
    assert.match(engine, /NATIVE_MIXER_VALUE_COUNT\s*=\s*68/);
    assert.match(engine, /\(flags\s*&\s*~0x7ff\)\s*!=\s*0/);
    assert.match(engine, /cachedMixerRevision/);
    assert.match(engine, /nativeSetMixerParameters/);
    assert.match(jniSource, /kMixerValueCount\s*=\s*68/);
    assert.match(jniSource, /flags\s*&\s*~0x7ff/);
    assert.match(jniSource, /raw\[31\]/);
    assert.match(jniSource, /raw\[67\]/);
    for (const [index, field] of [
      [44, 'chorus_rate_hz'], [49, 'flanger_rate_hz'], [54, 'phaser_rate_hz'],
      [59, 'delay_ms'], [64, 'early_reflections_room_size'], [67, 'early_reflections_mix'],
    ]) {
      assert.match(jniSource, new RegExp(`${field}\\s*=\\s*raw\\[${index}\\]`));
    }
    assert.match(jniSource, /fe_audio_pipeline_set_mixer_params/,
      'Mixer receipt must remain part of every four-state commit');
    assert.match(jniSource, /fe_audio_pipeline_set_spatial_controls/,
      'the same control snapshot must reach the spatial modules');
  });

  contract('nativeAdditiveSpatialControlAbi', () => {
    assert.match(pipelineHeader, /FE_AUDIO_PIPELINE_ABI_VERSION\s+4u/);
    assert.match(pipelineHeader, /typedef struct FeAudioSpatialControlParams/);
    for (const field of [
      'upmix_enabled',
      'upmix_algorithm',
      'upmix_output_channels',
      'upmix_center_width_hz',
      'upmix_lfe_crossover_hz',
      'upmix_center_gain',
      'upmix_surround_gain',
      'upmix_lfe_gain',
      'upmix_decorrelation_amount',
      'obr_enabled',
      'obr_filter_profile',
      'obr_wet',
      'obr_dry',
      'obr_output_gain_db',
      'obr_spatial_width',
    ]) {
      assert.match(pipelineHeader, new RegExp(`\\b${field}\\b`), `missing native field ${field}`);
      assert.match(pipelineSource, new RegExp(`\\b${field}\\b`), `native DSP does not consume ${field}`);
    }
    assert.match(pipelineHeader, /fe_audio_pipeline_set_spatial_controls/);
    assert.match(pipelineSource, /BinauralFilterProfile::kDirect/);
    assert.match(pipelineSource, /BinauralFilterProfile::kAmbient/);
    assert.match(pipelineSource, /BinauralFilterProfile::kReverberant/);
  });

  contract('realtimeDspTuningAndInPlaceSpatialUpdates', () => {
    assert.match(pipelineHeader, /FE_AUDIO_OBR_SAMPLE_POINTS\s+8192u/);
    assert.match(rustHeader, /FE_RUST_UPMIX_STFT_FFT_SIZE\s+2048u/);
    assert.match(rustHeader, /FE_RUST_UPMIX_STFT_HOP_SIZE\s+512u/);
    assert.match(rustHeader, /FE_RUST_UPMIX_STFT_OVERLAP_PERCENT\s+75u/);
    assert.match(rustSource, /UPMIX_STFT_FFT_SIZE:\s*usize\s*=\s*2048/);
    assert.match(rustSource, /UPMIX_STFT_HOP_SIZE:\s*usize\s*=\s*512/);
    assert.match(rustSource, /process_passive_stft/);
    assert.match(rustSource, /fe_rust_upmix_update/);
    assert.match(pipelineSource, /SpatialControlsRequireModuleRebuild/);
    assert.match(pipelineSource, /SpatialControlsRequireUpmixUpdate/);
    const rebuildHelperStart = pipelineSource.indexOf('bool SpatialControlsRequireModuleRebuild');
    const rebuildHelperEnd = pipelineSource.indexOf('\n}\n\nbool SpatialControlsRequireUpmixUpdate', rebuildHelperStart);
    assert.ok(rebuildHelperStart >= 0 && rebuildHelperEnd > rebuildHelperStart);
    const rebuildHelper = pipelineSource.slice(rebuildHelperStart, rebuildHelperEnd);
    assert.doesNotMatch(rebuildHelper, /upmix_enabled|obr_enabled/,
      'route enable/disable must reuse the prebuilt handles');
    assert.match(pipelineSource, /rust_upmixer_\.Update\(sample_rate_, spatial_controls_\)/);
    assert.match(pipelineSource, /spatial_cache_revision_\s*=\s*0/);
    assert.match(pipelineSource, /GetProcAddress\(module_, "fe_rust_upmix_update"\)/);
    assert.match(nativeCmake, /FE_OBR_FFT_MANAGER_SOURCE/);
    assert.match(nativeCmake, /NextPowTwo\(frames_per_buffer\) \* 2/);
    assert.match(nativeCmake, /"static_cast<size_t>\(8192\)"/);
    assert.match(wasmCmake, /FE_OBR_FFT_MANAGER_SOURCE/);
    assert.match(wasmCmake, /NextPowTwo\(frames_per_buffer\) \* 2/);
    assert.match(wasmCmake, /"static_cast<size_t>\(8192\)"/);
    for (const cmake of [nativeCmake, wasmCmake]) {
      assert.ok(cmake.includes('"${FE_OBR_DECODER_NEEDLE}" "fft_manager->GetFftSize()"'),
        'decoder frequency allocation must follow the configured FFT size');
      assert.ok(cmake.includes('"${FE_OBR_DECODER_SOURCE}"'),
        'OBR must build the decoder with the corrected frequency allocation');
      assert.ok(cmake.includes('"frames_per_buffer_" "(fft_size_ / 2)" FE_OBR_FFT_BINS'),
        'magnitude and phase indices must follow the actual half-spectrum');
    }
  });

  contract('queueBackpressureDoesNotBlockMixerControls', () => {
    const submitStart = pipelineSource.indexOf('HRESULT Submit(');
    const submitEnd = pipelineSource.indexOf('\n    void GetStatus(', submitStart);
    assert.ok(submitStart >= 0 && submitEnd > submitStart,
      'native Submit implementation must be inspectable');
    const submitBody = pipelineSource.slice(submitStart, submitEnd);
    const queueWait = submitBody.indexOf('buffer_available_cv_.wait_for');
    const renderLockAfterWait = submitBody.indexOf(
      'std::lock_guard<std::mutex> spatial_guard(spatial_control_mutex_)',
      queueWait,
    );
    assert.match(submitBody, /submit_guard\(submit_mutex_\)/,
      'one transport submit must own scratch without serializing the control plane');
    assert.ok(queueWait >= 0 && renderLockAfterWait > queueWait,
      'queue backpressure must not hold the spatial/control mutex while waiting for XAudio2');
  });

  contract('nativeFourStateFidelityProbe', () => {
    assert.match(nativeProbe, /ProbeSpatialControlFourStateMatrix/);
    assert.match(nativeProbe, /stereo_mixer_out/);
    assert.match(nativeProbe, /upmix_mixer_non_obr_out/);
    assert.match(nativeProbe, /stereo_mixer_obr/);
    assert.match(nativeProbe, /upmix_mixer_x3d_obr/);
    assert.match(nativeProbe, /mixer_process_calls[\s\S]{0,1200}mixer_process_calls[\s\S]{0,1200}mixer_process_calls[\s\S]{0,1200}mixer_process_calls/,
      'all four routes must prove that Mixer processed PCM');
    assert.match(nativeProbe, /spatial_toggle_gain_jump_db/);
    assert.match(nativeProbe, /spatial_toggle_gain_jump_db\s*<=\s*1\.0f/,
      'module switching must be level-matched to at most a 1 dB jump');
    assert.match(nativeProbe, /std::isfinite/);
  });

  contract('javaPublicBehaviorProbe', () => {
    const compiled = run(javac, [
      '-encoding', 'UTF-8', '--release', '17', '-d', classes,
      path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
      path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
      path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
      path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
      path.join(root, 'src/test/java/com/femonster/core/AudioSpatialControlsContractProbe.java'),
    ]);
    assert.equal(compiled.error?.code, undefined, compiled.error?.message || 'javac failed to start');
    assert.equal(compiled.status, 0, [compiled.stdout, compiled.stderr].filter(Boolean).join('\n'));
    const executed = run(java, [
      '-cp', classes,
      'com.femonster.core.AudioSpatialControlsContractProbe',
      data,
    ]);
    assert.equal(executed.error?.code, undefined, executed.error?.message || 'java failed to start');
    assert.equal(executed.status, 0, [executed.stdout, executed.stderr].filter(Boolean).join('\n'));
    assert.match(executed.stdout, /AudioSpatialControlsContractProbe passed/);
  });

  const result = {
    pass: failures.length === 0,
    checks,
    failures,
    contract: {
      presets: 15,
      nativeVectorValues: 68,
      routes: [
        'stereo-mixer-out',
        'upmix-mixer-non-obr-out',
        'stereo-mixer-obr',
        'upmix-mixer-x3d-obr',
      ],
      maximumToggleGainJumpDb: 1,
    },
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
