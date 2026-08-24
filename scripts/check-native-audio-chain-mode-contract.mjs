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
