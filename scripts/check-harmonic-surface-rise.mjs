import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const scope = { window: {}, console };
for (const file of ['vendor/three.r128.min.js', 'harmonic-state-settings.js', 'harmonic-orbital-core.js']) {
  vm.runInNewContext(readFileSync(new URL('../web/' + file, import.meta.url), 'utf8'), scope);
}
const settingsApi = scope.window.FeHarmonicSettings;
const core = scope.window.FeHarmonicOrbitalCore.create(scope.THREE);
const defaults = settingsApi.normalize({ ringsEnabled: false, raysEnabled: false, floatAmount: 0 });
const frame = { delta: .08, playing: true, bass: .75, mid: .25, treble: .1 };
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-10,
  `${message}: expected ${expected}, received ${actual}`);
function sample(settings = {}, playback = {}, frames = 32) {
  for (let i = 0; i < frames; i++) core.update({ ...frame, ...playback, settings: { ...defaults, ...settings } });
  return core.diagnostics();
}
// Rise levels move with real frame deltas, so paused expectations are sampled
// after the release transition has run out.
function settle(settings = {}, playback = {}, seconds = 2) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const delta = Math.min(1 / 60, remaining);
    core.update({ ...frame, ...playback, delta, settings: { ...defaults, ...settings } });
    remaining -= delta;
  }
  return core.diagnostics();
}

try {
  const playing = sample({ bassRiseStrength: .6, rippleStrength: 0 });
  close(playing.rippleAmplitude, playing.bass * .6 * .47, 'music rise uses the bass height control');
  assert.ok(playing.rippleAmplitude > .1, 'bass height still works with idle ripple height at zero');
  const idleSliderChanged = sample({ bassRiseStrength: .6, rippleStrength: 2 }, {}, 1);
  close(idleSliderChanged.rippleAmplitude, playing.rippleAmplitude,
    'changing idle ripple height does not change playing height');
  const higherBass = sample({ bassRiseStrength: 1.2, rippleStrength: 2 }, {}, 1);
  close(higherBass.rippleAmplitude, playing.rippleAmplitude * 2, 'doubling bass height doubles music rise');
  const oldMaximum = sample({ bassRiseStrength: 2, rippleStrength: 2 }, {}, 1);
  for (const value of [3.5, 5]) {
    const extended = sample({ bassRiseStrength: value, rippleStrength: 2 }, {}, 1);
    assert.equal(extended.surface.bassRiseStrength, value, `runtime diagnostics preserve music height ${value}`);
    close(extended.rippleAmplitude, extended.bass * value * .47, `${value} reaches the actual displacement amplitude`);
    close(extended.rippleAmplitude, oldMaximum.rippleAmplitude * value / 2, 'height scales beyond the old maximum');
  }
  const capped = sample({ bassRiseStrength: 6, rippleStrength: 2 }, {}, 1);
  assert.equal(capped.surface.bassRiseStrength, 5, 'runtime caps out-of-range music height at five');
  close(capped.rippleAmplitude, capped.bass * 5 * .47, 'runtime displacement uses the new cap');
  close(sample({ bassRiseStrength: 0, rippleStrength: 2 }).rippleAmplitude, 0,
    'zero bass height leaves playing tiles flat despite a nonzero idle ripple');

  sample({ bassRiseStrength: 2, rippleStrength: 2 }, { bass: 1 });
  const silent = sample({ bassRiseStrength: 2, rippleStrength: 2 }, { bass: 0 });
  close(silent.rippleAmplitude, 0, 'silence has no fixed playing baseline after the bass envelope settles');
  sample({ bassRiseStrength: 2 }, { bass: 1 });
  close(sample({ audioReactive: false, bassRiseStrength: 2, rippleStrength: 2 }, {}, 1).rippleAmplitude, 0,
    'disabling audio response removes a previously active music rise immediately');

  for (const idleMotion of [true, false]) {
    const playingHeight = sample({ bassRiseStrength: 5, rippleStrength: .4 }, { bass: 1 });
    core.update({ ...frame, playing: false, idleMotion, delta: 0,
      settings: { ...defaults, bassRiseStrength: 5, rippleStrength: .4 } });
    close(core.diagnostics().rippleAmplitude, playingHeight.rippleAmplitude,
      `the pause frame keeps the music height instead of snapping flat with idleMotion=${idleMotion}`);
    const midway = settle({ bassRiseStrength: 5, rippleStrength: .4 }, { playing: false, idleMotion, bass: 1 }, .2);
    assert.ok(midway.rippleAmplitude < playingHeight.rippleAmplitude && midway.rippleAmplitude > .4 * .055,
      `the paused surface retracts across a transition with idleMotion=${idleMotion}`);
    const paused = settle({ bassRiseStrength: 5, rippleStrength: .4 }, { playing: false, idleMotion }, 2);
    close(paused.rippleAmplitude, .4 * .055,
      `a settled pause selects only idle ripple height, including stale bass with idleMotion=${idleMotion}`);
    close(settle({ bassRiseStrength: 0, rippleStrength: .4 }, { playing: false, idleMotion }, 2).rippleAmplitude,
      paused.rippleAmplitude, 'changing music height cannot change paused ripple height');
    close(settle({ bassRiseStrength: 5, rippleStrength: 0 }, { playing: false, idleMotion }, 2).rippleAmplitude,
      0, 'zero idle ripple height stays flat despite stale music energy');
    close(settle({ bassRiseStrength: 0, rippleStrength: 1.6 }, { playing: false, idleMotion }, 2).rippleAmplitude,
      1.6 * .055, 'idle ripple height works independently with music height at zero');
  }
  close(sample({ audioReactive: false, rippleStrength: 1.3 }, { playing: false, idleMotion: true }).rippleAmplitude,
    1.3 * .055, 'audio response off still permits the independently controlled idle ripple');
  for (const playing of [true, false]) {
    close(sample({ surfaceRiseEnabled: false, bassRiseStrength: 2, rippleStrength: 2 },
      { playing, idleMotion: !playing, bass: 1 }).rippleAmplitude, 0,
    `the surface rise switch disables both height channels while playing=${playing}`);
  }
  const resumed = sample({ bassRiseStrength: 1.1, rippleStrength: 2 }, { bass: .5 });
  close(resumed.rippleAmplitude, resumed.bass * 1.1 * .47, 'resume removes the idle baseline again');
} finally {
  core.dispose();
}
console.log('PASS harmonic surface rise: independent playing/idle heights, silence, disabled audio response, pause/resume and master switch');
