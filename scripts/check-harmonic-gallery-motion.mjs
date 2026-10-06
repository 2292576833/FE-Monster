import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../web/harmonic-state-runtime.js', import.meta.url), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source.replace('    create,', '    cardOrbitPose, layoutCardText,\n    create,'), sandbox);
const { cardOrbitPose, layoutCardText } = sandbox.window.FeHarmonicStateRuntime;

for (const phase of [0, 0.4, 2, 10, 400, 20000]) {
  const cards = Array.from({ length: 7 }, (_, i) => cardOrbitPose(i, 7, phase));
  for (const card of cards) {
    assert.ok(Object.values(card).every(Number.isFinite), 'card pose must always be finite');
    assert.ok(Math.abs(card.y) < 1.3, 'closed horizontal gallery must not climb away from the camera');
    assert.ok(Math.abs(card.x) <= 9.5 && Math.abs(card.z) <= 5, 'orbit must remain bounded');
  }
  assert.ok(cards.some(card => card.z > 2), 'orbit has foreground cards');
  assert.ok(cards.some(card => card.z < -2), 'orbit has background cards');
}
assert.equal(cardOrbitPose(0, 7, 0).x, 0, 'initial current lyric should be on the reading axis');
for (const angle of [Math.PI, -Math.PI, Math.PI * 3]) {
  const before = cardOrbitPose(0, 7, angle - 0.00001);
  const after = cardOrbitPose(0, 7, angle + 0.00001);
  const turn = Math.atan2(Math.sin(after.yaw - before.yaw), Math.cos(after.yaw - before.yaw));
  assert.ok(Math.abs(turn) < 0.0001, 'glass orientation must stay continuous across the rear of the orbit');
}
const fakeContext = { font: '', measureText(text) { return { width: Array.from(text).length * parseFloat(this.font) * 0.9 }; } };
const text = '这是一句超过十八个字的中文歌词，必须完整显示而不能把后半句悄悄截掉。';
const layout = layoutCardText(fakeContext, text, 820, 280);
assert.equal(Array.from(layout.lines).join(''), text, 'long Chinese lyric must survive wrapping');
assert.ok(layout.lines.length * layout.lineHeight <= 280, 'wrapped title must fit in its card');
assert.ok(layout.lines.every(line => fakeContext.measureText(line).width <= 820.01), 'wrapped title must fit horizontally');
const mixed = 'A soft voice 轻轻唱 🎵';
assert.equal(Array.from(layoutCardText(fakeContext, mixed, 400, 200).lines).join(''), mixed,
  'mixed-case text and surrogate pairs must remain unchanged');
console.log('PASS harmonic horizontal orbit stays bounded and long lyrics remain complete');
