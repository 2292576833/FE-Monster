import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const app = readFileSync('web/app.js', 'utf8');
const start = app.indexOf('function fitSonicWallpaperTexture(');
const end = app.indexOf('\nfunction disposeSonicWallpaperSurface(', start);
assert.ok(start >= 0 && end > start, 'fitSonicWallpaperTexture must remain independently inspectable');

const context = { result: null };
vm.runInNewContext(`
  const state = { sonicTopography: null };
  const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
  ${app.slice(start, end)}
  result = fitSonicWallpaperTexture;
`, context);
const fit = context.result;

function probe(sourceWidth, sourceHeight, viewportAspect) {
  const contain = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const cover = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const texel = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const repeat = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const offset = { x: 0, y: 0, set(x, y) { this.x = x; this.y = y; } };
  const surface = {
    userData: {
      overscan: 1.08,
      verticalCoverage: 0.58,
      safeContentScale: 0.9
    },
    material: {
      uniforms: {
        uContainRegion: { value: contain },
        uCoverScale: { value: cover },
        uTexelSize: { value: texel }
      }
    }
  };
  const texture = {
    image: { width: sourceWidth, height: sourceHeight },
    repeat,
    offset,
    needsUpdate: false
  };
  const topo = { camera: { aspect: viewportAspect }, wallpaperSurface: surface };
  assert.equal(fit(topo, texture), true);
  return { contain, cover, texel, repeat, offset, surface, texture };
}

for (const [label, width, height, viewportAspect] of [
  ['16:9 image in 16:9 window', 1920, 1080, 16 / 9],
  ['21:9 image in 4:3 window', 2520, 1080, 4 / 3],
  ['portrait image in 16:9 window', 1080, 1920, 16 / 9]
]) {
  const result = probe(width, height, viewportAspect);
  assert.deepEqual([result.repeat.x, result.repeat.y], [1, 1], `${label} must retain the full source UV range`);
  assert.deepEqual([result.offset.x, result.offset.y], [0, 0], `${label} must not offset-crop the source`);
  assert.ok(result.contain.x > 0 && result.contain.x <= 0.9, `${label} contain width is invalid`);
  assert.ok(result.contain.y > 0 && result.contain.y <= 0.9, `${label} contain height is invalid`);
  const leftSourceUv = ((0.5 - result.contain.x * 0.5) - 0.5) / result.contain.x + 0.5;
  const rightSourceUv = ((0.5 + result.contain.x * 0.5) - 0.5) / result.contain.x + 0.5;
  const bottomSourceUv = ((0.5 - result.contain.y * 0.5) - 0.5) / result.contain.y + 0.5;
  const topSourceUv = ((0.5 + result.contain.y * 0.5) - 0.5) / result.contain.y + 0.5;
  assert.ok(Math.abs(leftSourceUv) < 1e-9 && Math.abs(rightSourceUv - 1) < 1e-9,
    `${label} does not expose both horizontal source edges`);
  assert.ok(Math.abs(bottomSourceUv) < 1e-9 && Math.abs(topSourceUv - 1) < 1e-9,
    `${label} does not expose both vertical source edges`);
}

assert.match(app, /new THREE\.ShaderMaterial\(\{[\s\S]{0,2600}?sampleBlurredCover/,
  'Sonic wallpaper blur must stay inside its GPU material');
assert.match(app, /float bottomFeather = smoothstep\(0\.0, 0\.28, vUv\.y\)/,
  'the wallpaper must feather into the lower scene');
assert.match(app, /float lowerDetail = smoothstep\(0\.07, 0\.29, vUv\.y\)/,
  'the lower edge must transition from blur to crisp content gradually');
assert.match(app, /const sideWrap = x \* x \* \(0\.26 \+ dome \* 0\.055\)/,
  'the upper wallpaper needs the deeper side wrap');
assert.match(app, /distance \* 0\.25/,
  'the deeper concave geometry needs a matching depth scale');
assert.doesNotMatch(app.slice(start, end), /repeatX|repeatY|offset\.set\(\(1 -/,
  'the old cover-crop UV path must not return');

console.log('Sonic full-frame concave wallpaper PASS');
