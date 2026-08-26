import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const header = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.h'), 'utf8');
const source = readFileSync(path.join(root, 'native/windows/audio/fe_audio_pipeline.cpp'), 'utf8');
const probe = readFileSync(path.join(root, 'native/windows/audio/fe_audio_probe.cpp'), 'utf8');
const nativeEngine = readFileSync(
  path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
  'utf8'
);
const mixerService = readFileSync(
  path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
  'utf8'
);
const bridge = readFileSync(
  path.join(root, 'native/windows/fe_monster_xaudio2.cpp'),
  'utf8'
);

// The JNI mixer snapshot is append-only: the spatial block stays at 31..43
// while ABI v2 effect controls occupy 44..67 and use their own flag bits.
assert.match(bridge, /constexpr\s+jsize\s+kMixerValueCount\s*=\s*68/);
assert.match(bridge, /\(flags\s*&\s*~0x7ff\)\s*!=\s*0/);
for (const [field, bit] of [
  ['chorus_enabled', '0x40'],
  ['flanger_enabled', '0x80'],
  ['phaser_enabled', '0x100'],
  ['delay_enabled', '0x200'],
  ['early_reflections_enabled', '0x400'],
]) {
  assert.match(bridge, new RegExp(`mixer->${field}\\s*=\\s*\\(flags\\s*&\\s*${bit}\\)`));
}
for (const [index, field] of [
  [31, 'upmix_algorithm'], [32, 'upmix_output_channels'],
  [33, 'upmix_center_width_hz'], [34, 'upmix_lfe_crossover_hz'],
  [35, 'upmix_lfe_gain'], [36, 'upmix_center_gain'],
  [37, 'upmix_surround_gain'], [38, 'upmix_decorrelation_amount'],
  [39, 'obr_filter_profile'], [40, 'obr_wet'], [41, 'obr_dry'],
  [42, 'obr_output_gain_db'], [43, 'obr_spatial_width'],
]) {
  assert.match(bridge, new RegExp(`spatial->${field}\\s*=.*raw\\[${index}\\]`),
    `legacy spatial assignment raw[${index}] -> ${field} changed`);
}
for (const [index, field] of [
  [44, 'chorus_rate_hz'], [45, 'chorus_depth'], [46, 'chorus_center_delay_ms'],
  [47, 'chorus_feedback'], [48, 'chorus_mix'], [49, 'flanger_rate_hz'],
  [50, 'flanger_depth'], [51, 'flanger_center_delay_ms'], [52, 'flanger_feedback'],
  [53, 'flanger_mix'], [54, 'phaser_rate_hz'], [55, 'phaser_depth'],
  [56, 'phaser_center_frequency_hz'], [57, 'phaser_feedback'], [58, 'phaser_mix'],
  [59, 'delay_ms'], [60, 'delay_feedback'], [61, 'delay_ping_pong'],
  [62, 'delay_damping_hz'], [63, 'delay_mix'], [64, 'early_reflections_room_size'],
  [65, 'early_reflections_diffusion'], [66, 'early_reflections_damping'],
  [67, 'early_reflections_mix'],
]) {
  assert.match(bridge, new RegExp(`mixer->${field}\\s*=\\s*raw\\[${index}\\]`),
    `ABI v2 effect assignment raw[${index}] -> ${field} changed`);
}

// Upmix and OBR are independent stages, not aliases for the old monolithic
// pipeline mode. The exact ABI representation may be fields or feature flags,
// but both controls and their effective status must cross the native boundary.
assert.match(header, /upmix[_ ]enabled|UPMIX_ENABLED/i,
  'native ABI has no independent upmix enable control/status');
assert.match(header, /obr[_ ]enabled|OBR_ENABLED/i,
  'native ABI has no independent OBR enable control/status');
assert.match(nativeEngine, /upmixEnabled/,
  'NativeAudioEngine does not carry the independent upmix switch');
assert.match(nativeEngine, /obrEnabled/,
  'NativeAudioEngine does not carry the independent OBR switch');
assert.match(mixerService, /"upmixEnabled"/,
  'AudioMixerService does not persist/validate the upmix switch');
assert.match(mixerService, /"obrEnabled"/,
  'AudioMixerService does not persist/validate the OBR switch');

// Mixer is invariant across all four combinations. The unified spatial block
// must materialize the selected 2/6/8-channel bed, run Mixer once, and only
// then branch to either stereo fold-down or OBR.
const spatialStart = source.indexOf('HRESULT RenderSpatialBlock(');
const spatialEnd = source.indexOf('void UpdateOutputEnergy(', spatialStart);
assert.ok(spatialStart >= 0 && spatialEnd > spatialStart, 'RenderSpatialBlock was not found');
const spatialBody = source.slice(spatialStart, spatialEnd);
assert.match(spatialBody, /TryMixerBlock\s*\(/,
  'the unified four-state render path does not run Mixer');
assert.match(spatialBody, /if\s*\(\s*!SpatialObrEnabled\(\)\s*\)/,
  'OBR-off states do not have an explicit post-Mixer stereo route');
assert.match(spatialBody, /FoldBedToStereo\s*\(/,
  'the virtual 5.1\/7.1 bed has no explicit two-channel fold-down');

for (const mode of ['off_off', 'on_off', 'off_on', 'on_on']) {
  assert.match(probe, new RegExp(mode, 'i'),
    `native behavior probe is missing the ${mode} stage combination`);
}
assert.match(probe, /off_off[\s\S]{0,2400}mixer_process_calls/i,
  'off/off must still prove Mixer processing');
assert.match(probe, /on_off[\s\S]{0,2400}mixer_process_calls/i,
  'on/off must still prove Mixer processing');
assert.match(probe, /off_on[\s\S]{0,2400}mixer_process_calls/i,
  'off/on must still prove Mixer processing');
assert.match(probe, /on_on[\s\S]{0,2400}mixer_process_calls/i,
  'on/on must still prove Mixer processing');

console.log(JSON.stringify({
  pass: true,
  states: {
    off_off: { upmix: 0, mixer: 1, obr: 0, expectation: 'near-bit-transparent at clean gain' },
    on_off: { upmix: 1, mixer: 1, obr: 0, expectation: 'multichannel DSP then transparent stereo fold-down' },
    off_on: { upmix: 0, mixer: 1, obr: 1, expectation: 'stereo binaural without synthetic surround' },
    on_on: { upmix: 1, mixer: 1, obr: 1, expectation: 'full spatial chain' }
  }
}, null, 2));
