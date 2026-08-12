import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const css = readFileSync(path.join(root, 'web', 'fe-identity-card.css'), 'utf8');
const client = readFileSync(path.join(root, 'web', 'fe-identity-card.js'), 'utf8');

function braceBody(source, marker) {
  const markerAt = source.indexOf(marker);
  assert.ok(markerAt >= 0, `missing ${marker}`);
  const openAt = source.indexOf('{', markerAt + marker.length);
  assert.ok(openAt >= 0, `missing block for ${marker}`);
  let depth = 0;
  for (let index = openAt; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(openAt + 1, index);
  }
  throw new Error(`unterminated block for ${marker}`);
}

function declarations(body) {
  return Object.fromEntries(body.split(';').map((entry) => {
    const splitAt = entry.indexOf(':');
    return splitAt < 0 ? null : [entry.slice(0, splitAt).trim(), entry.slice(splitAt + 1).trim()];
  }).filter(Boolean));
}

function numeric(value) {
  return Number.parseFloat(String(value));
}

const motionFactory = new Function('durationMs', braceBody(client, 'function cornerFallMotion(durationMs)'));
const motion = motionFactory(1480);
const tipping = motion.frames.filter((frame) => (
  frame.offset >= motion.criticalOffset - 1e-7 && frame.offset <= motion.impactOffset + 1e-7
))
  .filter((frame, index, frames) => index === 0 || frame.offset > frames[index - 1].offset + 1e-7);
const ringing = motion.frames.filter((frame) => frame.offset >= motion.impactOffset - 1e-7).slice(-5);
const entranceRule = declarations(braceBody(
  css,
  '.fe-identity-card__stage.is-entering[data-entrance="corner-fall-float"] .fe-identity-card__shell'
));

test('identity card uses its lower-left corner as the fixed support point', () => {
  assert.match(entranceRule['transform-origin'] || '', /^0(?:px|%)?\s+100%$/,
    `the supporting corner is not the transform pivot: ${entranceRule['transform-origin'] || 'missing'}`);
  for (const frame of motion.frames) {
    assert.match(frame.transform, /^translate3d\(0, 8vh, 0\)/,
      `supporting corner drifted at ${(frame.offset * 100).toFixed(1)}%`);
  }
});

test('friction holds a near-vertical spin until the critical speed', () => {
  const precession = motion.frames.filter((frame) => frame.offset <= motion.criticalOffset + 1e-7);
  const angles = precession.map((frame) => numeric(frame['--fe-card-angle']));
  const spinSpeeds = precession.map((frame) => numeric(frame['--fe-card-spin-speed']));
  assert.ok(angles[0] >= 89.5 && angles[0] <= 90, `unexpected initial angle: ${angles[0]}`);
  assert.ok(Math.min(...angles) >= 87.5, `card fell before critical speed: ${Math.min(...angles)}deg`);
  assert.ok(spinSpeeds[0] >= 1000, `initial spin is too slow: ${spinSpeeds[0]}deg/s`);
  for (let index = 1; index < spinSpeeds.length; index += 1) {
    assert.ok(spinSpeeds[index] <= spinSpeeds[index - 1] + 0.05,
      `spin speed rose despite friction at frame ${index}`);
  }
  const spinAngles = motion.frames
    .filter((frame) => frame.offset <= motion.impactOffset + 1e-7)
    .map((frame) => numeric(frame['--fe-card-spin-angle']));
  assert.ok(Math.abs(spinAngles.at(-1) - spinAngles[0]) >= 900,
    `spin completed fewer than 2.5 turns: ${Math.abs(spinAngles.at(-1) - spinAngles[0]) / 360}`);
});

test('gravity torque tips the card from the near-vertical critical angle to first face contact', () => {
  const angles = tipping.map((frame) => numeric(frame['--fe-card-angle']));
  assert.ok(angles[0] >= 89 && angles[0] <= 90, `unexpected critical angle: ${angles[0]}`);
  assert.ok(angles.at(-1) <= 0.02, `free edge never reached the floor: ${angles.at(-1)}`);
  for (let index = 1; index < angles.length; index += 1) {
    assert.ok(angles[index] <= angles[index - 1] + 0.001,
      `centre of mass rose during the fall at frame ${index}`);
    assert.ok(angles[index] >= -0.001, `free edge crossed through the floor at frame ${index}`);
    assert.ok(Math.sin(angles[index] * Math.PI / 180) <= Math.sin(angles[index - 1] * Math.PI / 180) + 1e-5,
      `centre height is not monotonic at frame ${index}`);
  }
});

test('angular velocity accelerates as the centre of mass loses balance', () => {
  const speeds = tipping.slice(0, -1).map((frame) => numeric(frame['--fe-card-angular-speed']));
  const third = Math.floor(speeds.length / 3);
  const average = (values) => values.reduce((total, value) => total + value, 0) / values.length;
  const early = average(speeds.slice(0, third));
  const late = average(speeds.slice(-third));
  assert.ok(late >= early * 1.5,
    `gravity did not accelerate the fall enough: early=${early.toFixed(2)}, late=${late.toFixed(2)}`);
});

test('face contact has only a short, non-penetrating angular ring', () => {
  assert.ok(motion.totalMs - motion.impactMs <= 180, 'contact ring exceeds 180ms');
  const amplitudes = ringing.map((frame) => numeric(frame['--fe-card-angle']));
  assert.ok(amplitudes[0] <= 2, `first contact ring exceeds 2deg: ${amplitudes[0]}`);
  for (let index = 1; index < amplitudes.length; index += 1) {
    assert.ok(amplitudes[index] >= 0, 'contact ring penetrated the floor');
    assert.ok(amplitudes[index] < amplitudes[index - 1], 'contact ring did not strictly decay');
    assert.match(ringing[index].transform, /^translate3d\(0, 8vh, 0\)/,
      'contact ring caused a positional rebound');
  }
  assert.equal(amplitudes.at(-1), 0, 'card did not finish flat');
});

test('corner tick and face impact are separate, motion-aligned audio phases', () => {
  assert.match(client, /emitEntrancePhase\('corner-contact',\s*entrance\);\s*playCornerContactCue\(entrance\.soundCue\)/);
  assert.match(client, /setTimeout\(\(\)\s*=>\s*\{\s*emitEntrancePhase\('face-impact',\s*entrance\);\s*playImpactCue\(entrance\.soundCue\);[\s\S]*?\},\s*motion\.impactMs\)/);
  assert.match(client, /function\s+playCornerContactCue[\s\S]*?profile\.impactFrequencies\[2\][\s\S]*?profile\.bodyFrequency/);
});

test('landing waits for a click and reduced motion settles immediately', () => {
  assert.match(client, /function\s+settleCardOnGround\(\)[\s\S]*?classList\.add\('is-landed'\)/);
  assert.match(client, /function\s+liftCardFromGround\(\)[\s\S]*?if\s*\(!cardAwaitingLift\(\)\)\s*return\s+false[\s\S]*?classList\.add\('is-lifting'\)/);
  assert.match(client, /elements\.card\.addEventListener\('click',[\s\S]*?liftCardFromGround\(\)/);
  assert.match(client, /if\s*\(motionPreference\.matches\)\s*\{\s*settleCardOnGround\(\);\s*return;\s*\}/);
  const reduced = braceBody(css, '@media (prefers-reduced-motion: reduce)');
  assert.match(reduced, /\.fe-identity-card__stage\.is-entering \.fe-identity-card__shell[\s\S]*?animation:\s*none\s*!important/);
});

test('generated motion remains compositor-safe', () => {
  const allowed = new Set([
    'offset', 'transform', '--fe-card-angle', '--fe-card-angular-speed', '--fe-card-spin-speed',
    '--fe-card-spin-angle'
  ]);
  for (const frame of motion.frames) {
    for (const property of Object.keys(frame)) {
      assert.ok(allowed.has(property), `expensive animated property: ${property}`);
    }
  }
});
