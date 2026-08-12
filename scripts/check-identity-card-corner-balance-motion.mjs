import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const client = readFileSync(path.join(root, 'web', 'fe-identity-card.js'), 'utf8');
const css = readFileSync(path.join(root, 'web', 'fe-identity-card.css'), 'utf8');

function blockAt(source, marker) {
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

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function degrees(value, label) {
  const match = String(value).match(/^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)deg$/i);
  assert.ok(match, `${label} must be expressed in degrees: ${value}`);
  return Number(match[1]);
}

function transformPose(frame, index) {
  const number = '([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)';
  const match = String(frame.transform).match(new RegExp(
    `^translate3d\\(\\s*${number}\\s*,\\s*${number}vh\\s*,\\s*${number}(?:px)?\\s*\\)\\s*`
      + `rotateX\\(${number}deg\\)\\s*rotateZ\\(${number}deg\\)\\s*rotateX\\(${number}deg\\)\\s*`
      + `rotateZ\\(${number}deg\\)\\s*scale\\(${number}\\)$`,
    'i'
  ));
  assert.ok(match, `frame ${index} has an unobservable transform: ${frame.transform}`);
  return {
    x: Number(match[1]),
    y: Number(match[2]),
    z: Number(match[3]),
    floorPitch: Number(match[4]),
    spinAngle: Number(match[5]),
    tipAngle: Number(match[6]),
    balanceRoll: Number(match[7]),
    scale: Number(match[8]),
    angle: degrees(frame['--fe-card-angle'], `frame ${index} angle`),
    angularSpeed: degrees(frame['--fe-card-angular-speed'], `frame ${index} angular speed`),
    spinSpeed: degrees(frame['--fe-card-spin-speed'], `frame ${index} spin speed`),
    declaredSpinAngle: degrees(frame['--fe-card-spin-angle'], `frame ${index} spin angle`)
  };
}

function cardClearances(pose) {
  const width = 1.586;
  const height = 1;
  const roll = pose.balanceRoll * Math.PI / 180;
  const angle = pose.angle * Math.PI / 180;
  const clearance = (x, y) => {
    const rolledY = x * Math.sin(roll) + y * Math.cos(roll);
    return -rolledY * Math.sin(angle) * pose.scale;
  };
  return {
    support: clearance(0, 0),
    lowerRight: clearance(width, 0),
    upperLeft: clearance(0, -height),
    upperRight: clearance(width, -height),
    centre: clearance(width / 2, -height / 2)
  };
}

function productionTrajectory(durationMs = 1480) {
  const marker = 'function cornerFallMotion(durationMs)';
  const body = blockAt(client, marker);
  // The physics generator is deliberately pure: evaluating this function tests the exact
  // frames consumed by Element.animate without relying on wall-clock browser scheduling.
  // eslint-disable-next-line no-new-func
  const generate = Function(`"use strict"; return function cornerFallMotion(durationMs) {${body}};`)();
  return generate(durationMs);
}

function entranceRule() {
  return blockAt(
    css,
    '.fe-identity-card__stage.is-entering[data-entrance="corner-fall-float"] .fe-identity-card__shell'
  );
}

test('the production entrance passes the exact generated trajectory to WAAPI', () => {
  const runBody = blockAt(client, 'function runCornerFall(entrance)');
  assert.match(runBody,
    /const\s+motion\s*=\s*cornerFallMotion\(entrance\.durationMs\);[\s\S]*?elements\.shell\.animate\(motion\.frames,/,
    'the production entrance must animate the audited cornerFallMotion frames without a second easing layer');
  assert.match(runBody, /easing:\s*'linear'/,
    'WAAPI must not distort the already-integrated gravity samples');
  const trajectory = productionTrajectory();
  assert.ok(Array.isArray(trajectory.frames) && trajectory.frames.length >= 30,
    'the production trajectory is not a dense WAAPI frame sequence');
});

test('one grounded corner supports a near-vertical card through a friction-limited spin', () => {
  assert.match(entranceRule(), /animation:\s*none\s*;/,
    'the old CSS timeline can race the rigid-body WAAPI trajectory');
  assert.match(entranceRule(), /transform-origin:\s*(?:0|0px|0%)\s+(?:100%|[\d.]+px)\s*;/,
    'the supporting bottom-left corner is not the transform pivot');

  const motion = productionTrajectory();
  assert.ok(motion.totalMs >= 2800 && motion.totalMs <= 4600,
    `spin, instability and impact need a readable 2800-4600ms, received ${motion.totalMs}`);
  assert.ok(motion.criticalMs >= 1500 && motion.criticalMs <= 2800,
    `the card did not remain gyroscopically stable long enough: ${motion.criticalMs}ms`);
  assert.ok(motion.criticalOffset > 0 && motion.criticalOffset < motion.impactOffset,
    'the critical-speed transition must precede face impact');
  assert.ok(motion.impactMs < motion.totalMs && motion.totalMs - motion.impactMs <= 180,
    'metal ringing must finish within 180ms after the face meets the floor');
  const frames = motion.frames.map(transformPose);
  for (let index = 1; index < motion.frames.length; index += 1) {
    assert.ok(motion.frames[index].offset >= motion.frames[index - 1].offset,
      `WAAPI offsets moved backwards at frame ${index}`);
  }

  // With transform-origin at the support corner, constant translation is equivalent to
  // keeping the projected contact point fixed. This also rejects hidden whole-card bounce.
  assert.ok(frames.every((pose) => (
    Math.abs(pose.x) <= 0.001 && Math.abs(pose.y - 8) <= 0.001 && Math.abs(pose.z) <= 0.001
  )), 'the support corner drifted or the whole card rebounded');

  const spinning = motion.frames
    .map((frame, index) => ({ frame, pose: frames[index], time: frame.offset * motion.totalMs / 1000 }))
    .filter(({ frame }) => frame.offset <= motion.impactOffset + 1e-7);
  assert.ok(spinning.length >= 36, 'the decelerating spin needs a dense physical sample sequence');
  assert.ok(spinning[0].pose.angle >= 89.5 && spinning[0].pose.angle <= 90,
    `initial card-to-floor angle must be visibly vertical (89.5-90deg), received ${spinning[0].pose.angle}`);
  assert.ok(spinning.every(({ pose }) => Math.abs(pose.floorPitch - 78) <= 0.001),
    'spin is not expressed in the virtual floor coordinate frame');
  assert.ok(spinning.every(({ pose }) => Math.abs(pose.tipAngle + pose.angle) <= 0.001),
    'card-to-floor angle and rendered rigid-body tilt diverged');
  assert.ok(spinning.every(({ pose }) => Math.abs(pose.spinAngle - pose.declaredSpinAngle) <= 0.001),
    'declared spin angle diverged from the rendered vertical-axis rotation');
  assert.ok(spinning[0].pose.spinSpeed >= 1000,
    `initial spin is not visibly fast: ${spinning[0].pose.spinSpeed}deg/s`);
  const rotationDeg = Math.abs(spinning.at(-1).pose.spinAngle - spinning[0].pose.spinAngle);
  assert.ok(rotationDeg >= 900,
    `the card must complete at least 2.5 turns before impact, received ${(rotationDeg / 360).toFixed(2)}`);
  const positiveSpin = spinning.filter(({ pose }) => pose.spinSpeed > 1e-3);
  assert.ok(positiveSpin[0].pose.spinSpeed >= positiveSpin.at(-1).pose.spinSpeed * 8,
    `spin did not visibly slow: ${positiveSpin[0].pose.spinSpeed} -> ${positiveSpin.at(-1).pose.spinSpeed}deg/s`);
  for (let index = 1; index < spinning.length; index += 1) {
    assert.ok(spinning[index].pose.spinSpeed <= spinning[index - 1].pose.spinSpeed + 0.05,
      `friction increased spin speed at frame ${index}`);
    assert.ok(spinning[index].pose.spinSpeed >= 0,
      `spin direction reversed at frame ${index}`);
    const deltaTime = spinning[index].time - spinning[index - 1].time;
    const spinDelta = spinning[index - 1].pose.spinAngle - spinning[index].pose.spinAngle;
    assert.ok(spinDelta >= -0.001,
      `right-to-left spin angle reversed at frame ${index}`);
    assert.ok(spinDelta <= 30,
      `spin angle jumped ${spinDelta.toFixed(2)}deg at frame ${index}`);
    if (deltaTime > 0) {
      const expectedDelta = deltaTime
        * (spinning[index - 1].pose.spinSpeed + spinning[index].pose.spinSpeed) / 2;
      assert.ok(Math.abs(spinDelta - expectedDelta) <= Math.max(0.12, expectedDelta * 0.012),
        `spin angle is discontinuous with its angular speed at frame ${index}`);
    }
  }
  const meanTime = positiveSpin.reduce((sum, sample) => sum + sample.time, 0) / positiveSpin.length;
  const meanLogSpeed = positiveSpin.reduce((sum, sample) => sum + Math.log(sample.pose.spinSpeed), 0) / positiveSpin.length;
  let covariance = 0;
  let timeVariance = 0;
  let logVariance = 0;
  for (const sample of positiveSpin) {
    const timeDelta = sample.time - meanTime;
    const speedDelta = Math.log(sample.pose.spinSpeed) - meanLogSpeed;
    covariance += timeDelta * speedDelta;
    timeVariance += timeDelta ** 2;
    logVariance += speedDelta ** 2;
  }
  const exponentialR2 = covariance ** 2 / (timeVariance * logVariance);
  assert.ok(exponentialR2 >= 0.985,
    `spin friction is not an exponential decay (R²=${exponentialR2.toFixed(4)})`);

  const balanced = spinning.filter(({ frame }) => frame.offset < motion.criticalOffset - 1e-7);
  const balancedHeights = balanced.map(({ pose }) => cardClearances(pose));
  assert.ok(balancedHeights.every((height) => Math.abs(height.support) <= 1e-6),
    'the lower-left support corner lifted away from the floor');
  assert.ok(balancedHeights.every((height) => (
    height.lowerRight >= 0.7 && height.upperLeft >= 0.45 && height.upperRight >= 1.15
  )), 'the vertical spin acquired a second ground contact');
  const centreHeights = balancedHeights.map((height) => height.centre);
  assert.ok(Math.max(...centreHeights) - Math.min(...centreHeights) <= 0.001,
    'centre-of-mass height changed before the critical spin speed');

  const falling = motion.frames
    .map((frame, index) => ({ frame, pose: frames[index] }))
    .filter(({ frame }) => frame.offset >= motion.criticalOffset - 1e-7 && frame.offset <= motion.impactOffset)
    .filter(({ pose }) => pose.angularSpeed > 0 || pose.angle === 0);
  assert.ok(falling.length >= 20, 'the gravity fall needs at least 20 physical samples');
  assert.ok(falling[0].pose.angle >= 89 && falling[0].pose.angle <= 90,
    `loss of balance must begin near vertical, received ${falling[0].pose.angle}`);
  for (let index = 1; index < falling.length; index += 1) {
    assert.ok(falling[index].pose.angle <= falling[index - 1].pose.angle + 0.02,
      `the centre of mass rose at gravity frame ${index}`);
    assert.ok(falling[index].pose.angle >= 0,
      `the free edge penetrated the floor at gravity frame ${index}`);
    assert.ok(falling[index].pose.angularSpeed + 0.08 >= falling[index - 1].pose.angularSpeed,
      `gravity failed to accelerate the fall at frame ${index}`);
    const clearance = cardClearances(falling[index].pose);
    assert.ok(Math.min(clearance.support, clearance.lowerRight, clearance.upperLeft, clearance.upperRight) >= -1e-6,
      `a card corner penetrated the floor at gravity frame ${index}`);
  }
  assert.ok(falling.at(-1).pose.angle <= 0.15,
    `the free edge never reached the floor (${falling.at(-1).pose.angle}deg)`);

  const speeds = falling.map(({ pose }) => pose.angularSpeed);
  const third = Math.max(3, Math.floor(speeds.length / 3));
  const earlySpeed = median(speeds.slice(0, third));
  const lateSpeed = median(speeds.slice(-third));
  assert.ok(lateSpeed >= earlySpeed * 1.5,
    `gravity torque did not accelerate the fall: early=${earlySpeed.toFixed(2)}, late=${lateSpeed.toFixed(2)}deg/s`);
});

test('flat impact has only a tiny, strictly damped metal ring and ends motionless', () => {
  const motion = productionTrajectory();
  const afterImpact = motion.frames
    .filter((frame) => frame.offset >= motion.impactOffset)
    .map(transformPose);
  assert.ok(afterImpact.length >= 5, 'post-impact rigid-metal ring samples are missing');
  assert.ok(afterImpact.every((pose) => pose.angle >= 0 && pose.angle <= 2),
    'post-impact motion penetrates the floor or exceeds the 2deg rigid-metal limit');

  // Duplicate offset at impact is allowed: angle 0 records visual contact, followed by the
  // first tiny recoil frame. Every later visible peak must lose energy.
  const visibleRing = afterImpact.filter((pose) => pose.angle > 0.01);
  for (let index = 1; index < visibleRing.length; index += 1) {
    assert.ok(visibleRing[index].angle < visibleRing[index - 1].angle,
      'post-impact angular energy did not strictly decay');
  }
  const rest = afterImpact.at(-1);
  assert.ok(rest.angle === 0 && rest.floorPitch === 78
    && Math.abs((rest.spinAngle + rest.balanceRoll) % 360) <= 0.001,
    `card does not finish flat and motionless: ${JSON.stringify(rest)}`);
});

test('corner contact and face impact sounds align to their visual events', () => {
  const runBody = blockAt(client, 'function runCornerFall(entrance)');
  assert.match(runBody,
    /emitEntrancePhase\('corner-contact',\s*entrance\);\s*playCornerContactCue\(entrance\.soundCue\);/,
    'the first noble metal tick must occur when the supporting corner touches');
  assert.match(runBody,
    /setTimeout\(\(\)\s*=>\s*\{[\s\S]*?emitEntrancePhase\('face-impact',\s*entrance\);[\s\S]*?playImpactCue\(entrance\.soundCue\);[\s\S]*?\},\s*motion\.impactMs\)/,
    'the full-card metal impact must use the exact visual impact timestamp');
});

test('landing stays landed until a click; reduced motion settles immediately', () => {
  assert.match(client,
    /function\s+settleCardOnGround\(\)[\s\S]*?classList\.remove\('is-entering',\s*'is-lifting',\s*'is-showcasing'\)[\s\S]*?classList\.add\('is-landed'\)/);
  assert.match(client,
    /function\s+liftCardFromGround\(\)[\s\S]*?if\s*\(!cardAwaitingLift\(\)\)\s*return\s+false[\s\S]*?classList\.add\('is-lifting'\)/);
  assert.match(client, /elements\.card\.addEventListener\('click',[\s\S]*?liftCardFromGround\(\)/);
  assert.match(client, /if\s*\(motionPreference\.matches\)\s*\{\s*settleCardOnGround\(\);\s*return;\s*\}/);
  const reducedMotion = blockAt(css, '@media (prefers-reduced-motion: reduce)');
  assert.match(reducedMotion,
    /\.fe-identity-card__stage\.is-entering \.fe-identity-card__shell[\s\S]*?animation:\s*none\s*!important/);
});

test('click-to-lift keeps the grounded pivot until the card has left the floor', () => {
  const landed = blockAt(css, '.fe-identity-card__stage.is-landed .fe-identity-card__shell');
  const lifting = blockAt(css, '.fe-identity-card__stage.is-lifting .fe-identity-card__shell');
  const landedOrigin = landed.match(/transform-origin:\s*([^;]+);/)?.[1]?.trim();
  const liftingOrigin = lifting.match(/transform-origin:\s*([^;]+);/)?.[1]?.trim();
  assert.ok(landedOrigin && liftingOrigin, 'landed and lifting poses must declare their pivot');
  assert.equal(liftingOrigin, landedOrigin,
    'switching transform-origin on click makes the visibly grounded card jump before lift begins');
});
