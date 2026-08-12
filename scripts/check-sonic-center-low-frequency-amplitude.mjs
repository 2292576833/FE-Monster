import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

function numberConstant(name) {
  const match = app.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)\\s*;`));
  return match ? Number(match[1]) : Number.NaN;
}

function responsiveLimit(name) {
  const match = app.match(new RegExp(
    `const\\s+${name}\\s*=\\s*MOBILE_RENDER_TARGET\\s*\\?\\s*([0-9.]+)\\s*:\\s*([0-9.]+)\\s*;`
  ));
  return match ? { mobile: Number(match[1]), desktop: Number(match[2]) } : null;
}

const gain = numberConstant('SONIC_CENTER_COLUMN_CORE_LOW_FREQUENCY_GAIN');
const impactCurveStrength = numberConstant('SONIC_LOW_FREQUENCY_IMPACT_CURVE_STRENGTH');
const baseAttackSeconds = numberConstant('SONIC_BASS_COLUMN_ATTACK_SECONDS');
const impactAttackSeconds = numberConstant('SONIC_BASS_COLUMN_IMPACT_ATTACK_SECONDS');
const releaseSeconds = numberConstant('SONIC_BASS_COLUMN_RELEASE_SECONDS');
const kneeRatio = numberConstant('SONIC_CENTER_COLUMN_SOFT_KNEE_RATIO');
const maximumLift = responsiveLimit('SONIC_CENTER_COLUMN_MAX_LIFT');

assert.ok(Number.isFinite(gain), 'center/core low-frequency gain must be a named numeric constant');
assert.ok(gain >= 2.35 && gain <= 2.55, `center/core gain ${gain} does not deliver the stronger bounded rise`);
assert.ok(
  impactCurveStrength >= 0.55 && impactCurveStrength <= 0.72,
  `low-frequency impact curve ${impactCurveStrength} is missing, too weak, or too aggressive`
);
assert.ok(baseAttackSeconds >= 0.045 && baseAttackSeconds <= 0.055, 'ordinary low-frequency attack changed unexpectedly');
assert.ok(
  impactAttackSeconds >= 0.024 && impactAttackSeconds <= 0.034 && impactAttackSeconds < baseAttackSeconds,
  'large low-frequency rises need a faster nonlinear impact attack without changing the ordinary attack floor'
);
assert.ok(releaseSeconds >= 0.2 && releaseSeconds <= 0.24, 'release must stay slower than attack and remain smooth');
assert.ok(Number.isFinite(kneeRatio) && kneeRatio >= 0.78 && kneeRatio <= 0.88, 'center lift needs a safe soft-knee window');
assert.ok(maximumLift, 'responsive center-column maximum lift is missing');
assert.ok(maximumLift.desktop >= 12.5 && maximumLift.desktop <= 13.5, 'desktop peak range is not increased safely');
assert.ok(maximumLift.mobile >= 9.2 && maximumLift.mobile <= 10, 'mobile peak range is not increased safely');

const maximumDynamicScale = 1.35 + 4.2 * 0.62 + 0.12;
const centerPeakAtUnitHeight = maximumDynamicScale * gain;
const moderateInput = 0.32;
const moderateImpactDrive = moderateInput
  * (1 + impactCurveStrength * (1 - moderateInput));
assert.ok(moderateImpactDrive >= 0.44, 'the nonlinear curve does not give a moderate bass hit enough initial travel');
assert.ok(centerPeakAtUnitHeight >= 9.5, 'unit-height core peak did not gain enough low-frequency travel');
assert.ok(centerPeakAtUnitHeight < maximumLift.desktop * 0.98, 'desktop core hits the limiter before normal peak travel');

assert.match(
  app,
  /float\s+bassColumnCoreLowFrequencyGainMask\s*=\s*bassColumnCoreHeightMix\s*\*\s*bassColumnCoreHeightMix\s*;[\s\S]{0,180}?mix\(\s*1\.0,\s*\$\{SONIC_CENTER_COLUMN_CORE_LOW_FREQUENCY_GAIN\.toFixed\(2\)\},\s*bassColumnCoreLowFrequencyGainMask\s*\)/,
  'GPU gain must fade from 1x outside the core instead of lifting the full terrain'
);
assert.match(
  app,
  /const\s+centerColumnCoreLowFrequencyGainMask\s*=\s*bassColumnCoreMix\s*\*\s*bassColumnCoreMix\s*;[\s\S]{0,180}?1\s*\+\s*\(SONIC_CENTER_COLUMN_CORE_LOW_FREQUENCY_GAIN\s*-\s*1\)\s*\*\s*centerColumnCoreLowFrequencyGainMask/,
  'CPU collision mirror does not match the core-only GPU gain'
);
assert.match(
  app,
  /float\s+bassColumnImpactDrive\s*=\s*bassColumnDrive\s*\*\s*\(\s*1\.0\s*\+\s*\$\{SONIC_LOW_FREQUENCY_IMPACT_CURVE_STRENGTH\.toFixed\(2\)\}\s*\*\s*\(1\.0\s*-\s*bassColumnDrive\)\s*\)/,
  'GPU center columns do not use the bounded nonlinear low-frequency impact curve'
);
assert.match(
  app,
  /const\s+centerColumnImpactDrive\s*=\s*sonicLowFrequencyImpactDrive\(bandDrive\)/,
  'CPU collision mirror does not use the same nonlinear center impact curve'
);
assert.match(
  app,
  /function\s+sonicBassAttackResponse\([\s\S]{0,500}?rise\s*\*\s*\(2\s*-\s*rise\)[\s\S]{0,250}?impactAttackResponse/,
  'large transient attack is not adaptively accelerated'
);
assert.match(
  app,
  /const\s+impactAttackResponse\s*=\s*1\s*-\s*Math\.exp\([\s\S]{0,120}?SONIC_BASS_COLUMN_IMPACT_ATTACK_SECONDS/,
  'the nonlinear attack does not use the bounded fast-impact time constant'
);
assert.match(app, /function\s+sonicCenterColumnSoftLimit\(/, 'CPU center height still uses a hard clip');
assert.match(app, /1\.0\s*-\s*exp\(/, 'GPU center height still uses a hard clip');
assert.match(app, /SONIC_BASS_COLUMN_ATTACK_SECONDS[\s\S]*SONIC_BASS_COLUMN_RELEASE_SECONDS/, 'low-frequency smoothing was removed');
assert.match(app, /else if \(holdPausedAudio\)[\s\S]*Keep the exact last low-frequency terrain frame/, 'pause hold behavior changed');

console.log(JSON.stringify({
  pass: true,
  gain,
  impactCurveStrength,
  attackSeconds: { base: baseAttackSeconds, impact: impactAttackSeconds, release: releaseSeconds },
  kneeRatio,
  maximumLift,
  centerPeakAtUnitHeight: Number(centerPeakAtUnitHeight.toFixed(3)),
  moderateImpactDrive: Number(moderateImpactDrive.toFixed(3))
}, null, 2));
