import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const html = readFileSync('web/index.html', 'utf8');
const loader = readFileSync('web/runtime-module-loader.js', 'utf8');
const css = readFileSync('web/pet-assistant.css', 'utf8');
const installerBuild = readFileSync('scripts/build-installer.ps1', 'utf8');
const installerRuntime = readFileSync('scripts/install-fe-monster.ps1', 'utf8');
const runtimePath = 'web/pet-particle-orb.js';

assert.ok(existsSync(runtimePath), 'white particle-orb runtime is missing');
const runtime = readFileSync(runtimePath, 'utf8');

const characterMarkup = html.match(/<button class="pet-assistant__character"[\s\S]*?<\/button>/)?.[0] || '';
assert.match(characterMarkup, /<canvas[^>]+id="petAssistantParticleOrb"[^>]+class="pet-assistant__particle-orb"/,
  'desktop pet must render the particle orb in one canvas');
assert.match(css, /\.pet-assistant__vector\s*\{[\s\S]*?display:\s*none\s*!important/,
  'the replaced dragon rig must not render behind the particle orb');
assert.ok(html.indexOf('vendor/three.r128.min.js') < html.indexOf('runtime-module-loader.js'),
  'Three.js must load before the pet runtime module loader');
assert.match(loader, /pet-particle-orb\.js\?v=[^"\s]+/,
  'the particle runtime cache key must change whenever its alpha surface changes');
assert.match(runtime, /data-pet-behavior[\s\S]*data-pet-reaction/,
  'the particle surface must consume the companion behavior and reaction state');
assert.match(runtime, /runtime\.points\.scale\.setScalar\s*\(/,
  'the living sphere must use one uniform GPU object transform instead of per-particle CPU updates');

assert.equal((runtime.match(/new THREE\.Points\s*\(/g) || []).length, 1,
  'the dense orb must remain a single GPU Points draw call');
assert.equal((runtime.match(/renderer\.render\s*\(/g) || []).length, 1,
  'the particle runtime must issue one scene render per visual frame');
assert.match(runtime, /const\s+LATITUDE_COUNT\s*=\s*64/,
  'the video-matched surface must preserve all 64 ordered latitude rows');
assert.match(runtime, /const\s+LONGITUDE_COUNT\s*=\s*128/,
  'the video-matched surface must keep 8192 ordered lavender pearls');
assert.match(runtime, /uLow[\s\S]*uMid[\s\S]*uHigh/,
  'low, mid and high bands must drive different light and pearl-size responses');
assert.match(runtime, /getByteFrequencyData\s*\(/,
  'pet reply audio must use real frequency-bin data');
assert.match(runtime, /petAssistantAudio/,
  'the particle orb must analyse the actual pet reply audio element');
assert.match(runtime, /const\s+DPR_LIMIT\s*=\s*2[\s\S]*Math\.min\(DPR_LIMIT\s*,/,
  'particle rendering DPR must preserve pearl detail up to 2x while remaining capped');
assert.match(runtime, /DEFAULT_RENDER_STEP_MS\s*=\s*1000\s*\/\s*60[\s\S]*VISIBLE_FRAME_INTERVAL_MS\s*=\s*DEFAULT_RENDER_STEP_MS/,
  'visible particle motion must stay display paced near 60fps in idle and realtime states');
assert.match(runtime, /requestAnimationFrame\s*\(\s*frame\s*\)/,
  'active particle motion must be driven by the display requestAnimationFrame cadence');
assert.match(runtime, /prefers-reduced-motion:\s*reduce/,
  'the particle orb must respect reduced-motion preference');
assert.doesNotMatch(runtime, /createElement\s*\([^)]*(?:span|i|div)/,
  'particles must not allocate one DOM element per point');

assert.match(css, /\.pet-assistant__particle-orb\s*\{[\s\S]*position:\s*absolute[\s\S]*inset:\s*0/,
  'the particle canvas must own the complete character surface');
assert.match(css, /\.pet-assistant__particle-orb\s*\{[\s\S]*background(?:-color)?:\s*transparent\s*!important/,
  'the particle canvas must never paint a CSS backing plate');
assert.match(runtime, /renderer\.setClearColor\(0x000000,\s*0\)[\s\S]*renderer\.setClearAlpha\(0\)/,
  'the GPU surface must explicitly clear every frame with zero alpha');
assert.match(css, /\.pet-assistant\[data-pet-proactive="true"\][\s\S]*\.pet-assistant__speech[\s\S]*background:\s*rgba\(255\s*,\s*255\s*,\s*255\s*,\s*\.30\)/,
  'proactive replies must use a 30% white speech bubble');
assert.match(css, /\.pet-assistant\[data-pet-proactive="true"\][\s\S]*border:\s*1px\s+solid\s+rgba\(255\s*,\s*255\s*,\s*255/,
  'proactive replies must use a fine white outline');
assert.match(css, /--pet-glass-surface:\s*rgba\(255\s*,\s*255\s*,\s*255\s*,\s*\.10\)/,
  'desktop chat panel must use the requested flat 10% white material');
assert.match(css, /html\[data-fe-client="desktop-pet"\][\s\S]*\.pet-assistant__message p\s*\{[\s\S]*background:\s*rgba\(255\s*,\s*255\s*,\s*255\s*,\s*\.16\)/,
  'desktop chat messages must keep their readable layered white material');

for (const manifest of [installerBuild, installerRuntime]) {
  assert.ok(manifest.includes('web\\pet-particle-orb.js'),
    'Windows package integrity list must include the particle-orb runtime');
}

await import('./check-pet-particle-orb-lifecycle.mjs');
await import('./check-pet-particle-choreography.mjs');

process.stdout.write('Desktop pet white particle-orb contract passed.\n');
