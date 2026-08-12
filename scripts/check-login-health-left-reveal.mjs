import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const adventurePath = path.join(root, 'web', 'pixel-login-adventure.js');
const source = fs.readFileSync(adventurePath, 'utf8');
const exportNeedle = `    characterPreviewDataUrl\n  });`;

assert.match(source, /const PLAYER_MAX_HEALTH = 10;/, 'the player must start with ten health points');
assert.match(source, /const SECRET_LEFT_LOCK_TIME = 1\.5;/, 'the hidden scene gate must wait for one and a half seconds');
assert.match(source, /const SECRET_ENTRY_X = 8;/, 'the hidden scene gate must start at the visible left edge');
assert.match(source, /const SECRET_DRAWER_REVEAL_TIME = 2;/, 'the four-provider page must reveal at two seconds');
assert.match(source, /function drawPixelHeart\(/, 'health must be rendered as pixel hearts');
assert.match(source, /function updateHellProjectiles\(/, 'inferno music blocks must own an attack projectile update');
assert.ok(source.includes(exportNeedle), 'pixel login export seam changed');

const instrumentedSource = source.replace(exportNeedle, `    characterPreviewDataUrl,
  __test: {
    game,
    createPlayer,
    createHellLayout,
    updatePlayer,
    updateSecret,
    updateCamera,
    updateHellBlocks,
    updateHellProjectiles,
    damagePlayer,
    leftSceneProgress,
    constants: {
      PLAYER_MAX_HEALTH,
      SECRET_LEFT_LOCK_TIME,
      SECRET_ENTRY_X,
      SECRET_DRAWER_REVEAL_TIME,
      HELL_BLOCK_PROJECTILE_SPEED
    }
  }
});`);

let seed = 0x51f15e;
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
assert.equal(test.constants.PLAYER_MAX_HEALTH, 10);
assert.equal(test.constants.SECRET_LEFT_LOCK_TIME, 1.5);
assert.equal(test.constants.SECRET_ENTRY_X, 8);
assert.equal(test.constants.SECRET_DRAWER_REVEAL_TIME, 2);

const player = test.createPlayer(72);
assert.equal(player.health, 10, 'a new life must contain ten pixel hearts');
assert.equal(player.maxHealth, 10);

assert.equal(test.leftSceneProgress(1.499), 0, 'the scene must remain locked during the first 1.5 seconds');
assert.equal(test.leftSceneProgress(1.5), 0, 'the reveal must begin only after the gate unlocks');
assert.ok(Math.abs(test.leftSceneProgress(1.75) - 0.5) < 1e-9, 'the left scene must be half revealed at 1.75 seconds');
assert.equal(test.leftSceneProgress(2), 1, 'the four-platform page must be fully revealed at two seconds');

test.game.layout = {
  kind: 'surface',
  minX: -900,
  secretExitX: -836,
  width: 1740,
  blocks: [],
  segments: [{ start: -900, end: 1740 }]
};
test.game.player = test.createPlayer(200);
test.game.keyboard.left = true;
test.game.keyboard.right = false;
test.updatePlayer(0.1);
assert.ok(test.game.player.x < 200, 'normal left movement must respond immediately before the screen edge');
test.updateSecret(0.1);
assert.equal(test.game.secret.held, 0, 'walking left away from the screen edge must not start the hidden-scene timer');

test.game.player = test.createPlayer(test.constants.SECRET_ENTRY_X);
test.game.cameraX = 0;
test.game.secret.held = 0;
test.updatePlayer(0.1);
test.updateSecret(0.1);
test.updateCamera(0.1);
assert.equal(test.game.player.x, test.constants.SECRET_ENTRY_X, 'the player must stop at the visible left edge while the gate waits');
assert.equal(test.game.cameraX, 0, 'the hidden scene must not appear before the 1.5 second gate finishes');
for (let frame = 1; frame < 15; frame += 1) {
  test.updatePlayer(0.1);
  test.updateSecret(0.1);
  test.updateCamera(0.1);
}
assert.ok(test.game.secret.held >= 1.5, 'holding left at the edge must unlock the gate after 1.5 seconds');
test.updatePlayer(0.1);
test.updateCamera(0.1);
assert.ok(test.game.player.x < test.constants.SECRET_ENTRY_X, 'left movement must enter the hidden scene after the gate unlocks');
assert.ok(test.game.cameraX < 0, 'the camera must follow only after the hidden scene gate unlocks');

const hell = test.createHellLayout();
test.game.layout = hell;
test.game.player = test.createPlayer(hell.blocks[0].x - 130);
test.game.levelTime = 0;
test.game.hellHintShown = true;
hell.blocks.forEach((block, index) => {
  block.attackCooldown = index === 0 ? 0 : 99;
});
for (let frame = 0; frame < 360 && hell.projectiles.length === 0; frame += 1) {
  test.game.levelTime += 1 / 120;
  test.updateHellBlocks(1 / 120);
}
assert.ok(hell.projectiles.length > 0, 'a nearby inferno music block must attack the player');
for (const projectile of hell.projectiles) {
  assert.ok(
    Math.hypot(projectile.vx, projectile.vy) <= test.constants.HELL_BLOCK_PROJECTILE_SPEED + 0.001,
    'music-block projectiles must remain dodgeable'
  );
}

test.game.player = test.createPlayer(72);
assert.equal(test.damagePlayer(1, 'test hit', 0), true, 'the first hit must damage the player');
assert.equal(test.game.player.health, 9);
assert.ok(test.game.player.invulnerability > 0, 'a hit must grant a brief fairness window');
assert.equal(test.damagePlayer(1, 'overlapping hit', 0), false, 'overlapping hazards must not drain several hearts in one frame');
assert.equal(test.game.player.health, 9);

console.log('Pixel login health, inferno attacks, and left reveal PASS');
