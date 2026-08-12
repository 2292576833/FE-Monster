import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8').replace(/\r\n/g, '\n');

const buildStart = app.indexOf('function buildSonicTopography()');
const resizeStart = app.indexOf('function resizeSonicTopographyRenderer()', buildStart);
assert.ok(buildStart >= 0 && resizeStart > buildStart, 'Sonic build path must remain independently inspectable');
const build = app.slice(buildStart, resizeStart);

const shaderStart = app.indexOf('function createSonicTopographyMaterial(');
const shaderEnd = app.indexOf('\nfunction sonicTopographyPaletteColors()', shaderStart);
assert.ok(shaderStart >= 0 && shaderEnd > shaderStart, 'Sonic terrain material must remain independently inspectable');
const shader = app.slice(shaderStart, shaderEnd);

assert.match(
  app,
  /const\s+SONIC_HARDWARE_ANTIALIAS\s*=\s*!MOBILE_RENDER_TARGET\s*\|\|\s*RENDER_PROFILE\.tier\s*!==\s*['"]economy['"]\s*;/,
  'Sonic must request hardware antialiasing on desktop and retain the economy-device fallback'
);
assert.match(
  build,
  /createDirectX11Renderer\(THREE,\s*\{\s*antialias:\s*SONIC_HARDWARE_ANTIALIAS\s*\}\)/,
  'the Sonic renderer must consume the hardware antialiasing policy'
);
assert.match(
  app,
  /sonicAtmosphereRuntimeSnapshot\(\)[\s\S]*?hardwareAntialias:\s*topo\.renderer\?\.getContext\?\.\(\)\?\.getContextAttributes\?\.\(\)\?\.antialias\s*===\s*true/,
  'runtime diagnostics must expose whether Edge actually created an antialiased Sonic framebuffer'
);

assert.match(shader, /float\s+surfaceEdge\s*=/, 'Sonic columns must retain local edge separation');
assert.match(
  shader,
  /fluorescentEmission\s*\/=\s*1\.0\s*\+\s*max\(0\.0,[\s\S]*?\-\s*0\.72\)\s*\*\s*1\.15/,
  'Sonic fluorescent highlights must remain bounded instead of washing adjacent columns together'
);
assert.match(
  shader,
  /columnBodyEnergy[\s\S]*?columnBodyGlow[\s\S]*?bodyColor\s*=\s*mix/,
  'the bass-column body light floor must remain in place so clarity work cannot restore black flashes'
);
assert.doesNotMatch(
  build,
  /EffectComposer|UnrealBloomPass|SMAAPass|FXAAPass/,
  'clarity must not add a post-process pass or extra draw-call chain'
);

console.log(JSON.stringify({
  pass: true,
  desktopHardwareAntialias: true,
  economyFallback: true,
  extraPostProcessPasses: 0,
  bassBlackFlashGuard: true
}, null, 2));
