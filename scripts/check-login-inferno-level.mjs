import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const adventurePath = path.join(root, 'web', 'pixel-login-adventure.js');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'web', 'pixel-adventure.css'), 'utf8');
const originalSource = fs.readFileSync(adventurePath, 'utf8');
const exportNeedle = `    characterPreviewDataUrl\n  });`;

assert.ok(originalSource.includes(exportNeedle), 'pixel login export seam changed');
const instrumentedSource = originalSource.replace(exportNeedle, `    characterPreviewDataUrl,
  __test: {
    game,
    createHellLayout,
    createPlayer,
    updateHellBlocks,
    shouldEnterHell,
    constants: {
      GROUND_Y,
      PLAYER_SPEED,
      JUMP_SPEED,
      GRAVITY,
      HELL_PITY_DEATHS,
      HELL_BLOCK_MAX_SPEED,
      HELL_BLOCK_VERTICAL_SPEED
    }
  }
});`);

let seed = 1;
const window = {
  crypto: {
    getRandomValues(buffer) {
      buffer[0] = seed >>> 0;
      return buffer;
    }
  }
};
const document = {
  readyState: 'loading',
  addEventListener() {}
};
vm.runInNewContext(instrumentedSource, {
  window,
  document,
  console,
  Math,
  Uint32Array,
  performance: { now: () => 0 }
}, { filename: adventurePath });

const test = window.fePixelLogin.__test;
const {
  GROUND_Y,
  PLAYER_SPEED,
  JUMP_SPEED,
  GRAVITY,
  HELL_PITY_DEATHS,
  HELL_BLOCK_MAX_SPEED,
  HELL_BLOCK_VERTICAL_SPEED
} = test.constants;

assert.equal(HELL_PITY_DEATHS, 4, 'the inferno level should have a bounded discovery pity');
test.game.deathsSinceHell = 0;
test.game.deathRandom = () => 1;
assert.deepEqual(
  Array.from({ length: HELL_PITY_DEATHS }, () => test.shouldEnterHell()),
  [false, false, false, true],
  'failed rolls must enter inferno on the fourth normal-world death'
);
test.game.deathsSinceHell = 0;
test.game.deathRandom = () => 0;
assert.equal(test.shouldEnterHell(), true, 'the first death must retain a real random entry chance');

const highestPlayerY = GROUND_Y - 28 - (JUMP_SPEED ** 2) / (2 * GRAVITY);
for (seed = 1; seed <= 512; seed += 1) {
  const layout = test.createHellLayout();
  assert.equal(layout.kind, 'hell');
  assert.equal(layout.blocks.length, 4);
  assert.ok(layout.gaps.every(([left, right]) => right - left <= 60), 'inferno gap exceeds jump-safe width');

  for (const block of layout.blocks) {
    assert.ok(block.minY >= 174 && block.maxY <= 204, 'music block escaped its reachable height band');
    assert.ok(highestPlayerY <= block.minY + block.height, 'music block underside is above the jump apex');
    assert.ok(block.maxY + block.height < GROUND_Y - 28 + 1, 'music block cannot be approached from below');
    const supportingGround = layout.segments.some(
      (segment) => block.minX >= segment.start && block.maxX + block.width <= segment.end
    );
    assert.ok(supportingGround, 'music block capture range crosses a lethal gap');
    for (const hazard of [...layout.vents, ...layout.crushers]) {
      const separation = Math.max(
        hazard.x - (block.maxX + block.width),
        block.minX - (hazard.x + hazard.width)
      );
      assert.ok(separation >= 48, 'a lethal trap is too close to a music block capture range');
    }
  }

  for (const checkpoint of layout.checkpoints) {
    const clear = [...layout.vents, ...layout.crushers].every(
      (hazard) => checkpoint + 19 <= hazard.x - 12 || checkpoint >= hazard.x + hazard.width + 12
    );
    assert.ok(clear, 'checkpoint overlaps a lethal trap');
  }
}

seed = 0x51f15e;
const motionLayout = test.createHellLayout();
test.game.layout = motionLayout;
test.game.player = test.createPlayer(72);
test.game.levelTime = 0;
test.game.hellHintShown = true;
for (let step = 0; step < 2400; step += 1) {
  test.game.levelTime += 1 / 120;
  test.updateHellBlocks(1 / 120);
  for (const block of motionLayout.blocks) {
    assert.ok(block.x >= block.minX - 0.001 && block.x <= block.maxX + 0.001);
    assert.ok(block.y >= block.minY - 0.001 && block.y <= block.maxY + 0.001);
    assert.ok(Math.abs(block.vx) <= HELL_BLOCK_MAX_SPEED + 0.001);
    assert.ok(Math.abs(block.vy) <= HELL_BLOCK_VERTICAL_SPEED + 0.001);
    assert.ok(Math.abs(block.vx) < PLAYER_SPEED, 'music block can outrun the player');
  }
}

const chasedBlock = motionLayout.blocks[0];
let exhaustedAt = Infinity;
for (let step = 0; step < 360; step += 1) {
  test.game.player.x = chasedBlock.x + chasedBlock.width / 2 - test.game.player.width / 2;
  test.game.player.y = chasedBlock.y + chasedBlock.height / 2 - test.game.player.height / 2;
  test.game.levelTime += 1 / 120;
  test.updateHellBlocks(1 / 120);
  if (chasedBlock.tired > 0) {
    exhaustedAt = step / 120;
    break;
  }
}
assert.ok(exhaustedAt <= 1.8, 'continuous pursuit did not force a catch window');

assert.match(html, /id="pixelLoginLevelLabel"/);
assert.match(html, /class="pixel-login-hell-fx"/);
assert.match(css, /\.pixel-login-hell-fx::before[\s\S]*?opacity:\s*var\(--hell-darkness\)/);
assert.match(css, /\.pixel-login-scene\.is-hell-transitioning \.pixel-login-hell-fx::after/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?pixel-login-hell-fx::after[\s\S]*?animation:\s*none/);
assert.match(originalSource, /phase:\s*'fade-out'/);
assert.match(originalSource, /transition\.phase = 'glitch'/);
assert.match(originalSource, /transition\.phase = 'fade-in'/);
assert.match(originalSource, /if \(isHellLevel\(\)\)[\s\S]{0,220}?game\.checkpointX/);

console.log('Pixel login inferno level behavior PASS');
