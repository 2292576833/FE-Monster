import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.cwd();
const modulePath = path.join(root, 'web', 'lyric-highlight-particles.js');
const indexPath = path.join(root, 'web', 'index.html');
const appPath = path.join(root, 'web', 'app.js');
const cssPath = path.join(root, 'web', 'styles.css');

assert.ok(fs.existsSync(modulePath), 'missing the dedicated 3D lyric highlight particle renderer');

const source = fs.readFileSync(modulePath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');
const app = fs.readFileSync(appPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');

const sandbox = {
  console,
  Float32Array,
  Uint8Array,
  Math,
  Number,
  Object,
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: modulePath });

const particles = sandbox.FeMonsterLyricHighlightParticles;
assert.ok(particles, 'particle renderer must publish FeMonsterLyricHighlightParticles');
assert.equal(typeof particles.create, 'function', 'particle renderer must expose create()');
assert.equal(typeof particles.normalizeSettings, 'function', 'particle renderer must expose normalizeSettings()');
assert.equal(typeof particles.particleDrive, 'function', 'particle renderer must expose particleDrive()');
assert.equal(typeof particles.nextEnvelope, 'function', 'particle renderer must expose nextEnvelope()');
assert.equal(typeof particles.particleBudget, 'function', 'particle renderer must expose particleBudget()');

const weakDrive = particles.particleDrive(0.07, 68);
const mediumDrive = particles.particleDrive(0.42, 68);
const strongDrive = particles.particleDrive(0.92, 68);
assert.equal(particles.particleDrive(0, 68), 0, 'silence must not continuously emit particles');
assert.ok(weakDrive > 0, 'weak bass must retain a small particle response');
assert.ok(mediumDrive > weakDrive, 'medium bass must emit more than weak bass');
assert.ok(strongDrive > mediumDrive, 'strong bass must emit more than medium bass');
assert.ok(strongDrive >= weakDrive * 3, 'strong bass response must be materially denser than weak bass');

const attackFrame = particles.nextEnvelope(0, 1, 16, 55, 220);
const secondAttackFrame = particles.nextEnvelope(attackFrame, 1, 16, 55, 220);
const firstReleaseFrame = particles.nextEnvelope(secondAttackFrame, 0, 16, 55, 220);
assert.ok(attackFrame > 0 && attackFrame < 0.5, 'particle envelope must fade in instead of popping on');
assert.ok(secondAttackFrame > attackFrame && secondAttackFrame < 1, 'particle attack must converge smoothly');
assert.ok(firstReleaseFrame > 0, 'particle envelope must fade out instead of disappearing');
assert.ok(firstReleaseFrame < secondAttackFrame, 'particle envelope must release toward silence');

const normalized = particles.normalizeSettings({
  enabled: true,
  size: 99,
  density: -10,
  sensitivity: 999,
  spread: -2,
  color: 'not-a-color'
});
assert.equal(normalized.size, 2.4, 'particle size must be clamped for clarity and performance');
assert.equal(normalized.density, 0, 'particle density must be clamped');
assert.equal(normalized.sensitivity, 100, 'particle sensitivity must be clamped');
assert.equal(normalized.spread, 0, 'particle spread must be clamped');
assert.equal(normalized.color, '#eafbff', 'invalid custom colors must use the clear default');

const lowBudget = particles.particleBudget(30, 'balanced', false);
const highBudget = particles.particleBudget(90, 'balanced', false);
const reducedBudget = particles.particleBudget(90, 'high', true);
assert.ok(highBudget > lowBudget, 'density must increase the active-particle budget');
assert.ok(reducedBudget <= 48, 'reduced motion must cap particle work');

assert.match(source, /new Float32Array\(/, 'particle storage must use a preallocated typed-array pool');
assert.match(source, /new THREE\.WebGLRenderer\(/, 'particles must render through Three.js WebGLRenderer');
assert.match(source, /new THREE\.BufferGeometry\(/, 'particles must use Three.js buffer geometry');
assert.match(source, /new THREE\.Points\(/, 'particles must use Three.js Points');
assert.match(source, /new THREE\.ShaderMaterial\(/, 'particles must use a programmable Three.js particle shader');
assert.match(source, /THREE\.AdditiveBlending/, 'particles must retain luminous additive blending');
assert.match(source, /options\.createRenderer/, 'particles must accept the application WebGL safety factory');
assert.match(source, /maxPixelRatio/, 'particles must honor the application render-profile DPR cap');
assert.doesNotMatch(source, /getContext\(\s*['"]2d['"]/, 'particle rendering must not fall back to Canvas2D');
assert.doesNotMatch(source, /requestAnimationFrame\s*\(/, 'particle renderer must reuse the application render frame');
assert.doesNotMatch(source, /createElement\s*\(/, 'particle renderer must not allocate per-particle DOM nodes');

for (const id of [
  'lyricHighlightParticlesFront',
  'textHighlightParticlesToggle',
  'textHighlightParticleSize',
  'textHighlightParticleDensity',
  'textHighlightParticleSensitivity',
  'textHighlightParticleSpread',
  'lyricParticlePaletteControl',
  'lyricParticleCustomColor'
]) {
  assert.match(index, new RegExp(`id=["']${id}["']`), `missing #${id}`);
}

const particleModuleIndex = index.indexOf('lyric-highlight-particles.js');
const threeModuleIndex = index.indexOf('vendor/three.r128.min.js');
const appScriptIndex = index.indexOf('app.js?v=');
assert.ok(threeModuleIndex >= 0 && threeModuleIndex < particleModuleIndex, 'Three.js must load before the particle module');
assert.ok(particleModuleIndex >= 0 && particleModuleIndex < appScriptIndex, 'particle module must load before app.js');
assert.match(index, /data-lyric-particle-palette-color=/, 'particle controls need dedicated color swatches');
assert.match(index, /data-lyric-particle-color-mode=["']auto["']/, 'particle palette needs an auto-follow option');

for (const setting of [
  'highlightParticlesEnabled',
  'highlightParticleSize',
  'highlightParticleDensity',
  'highlightParticleSensitivity',
  'highlightParticleSpread',
  'highlightParticleColorMode',
  'highlightParticleColor'
]) {
  assert.match(app, new RegExp(`${setting}:`), `missing persisted ${setting} setting`);
}
assert.match(app, /FeMonsterLyricHighlightParticles\.create\(/, 'app must initialize the particle renderer');
assert.match(app, /createRenderer: \(options\) => createDirectX11Renderer/, 'particles must use the application WebGL safety gate');
assert.match(app, /active \? ensureLyricHighlightParticleRenderer\(\) : null/, 'particles must create WebGL lazily only during active playback');
assert.match(app, /destroyLyricHighlightParticleRenderer\(\)/, 'particles must release their WebGL contexts during teardown');
assert.match(app, /updateLyricHighlightParticles\(/, 'app render loop must update lyric particles');
assert.match(app, /updatePlaybackSceneMotion[\s\S]*?updateLyricHighlightParticles\(/, 'particles must reuse playback scene motion');
assert.match(app, /state\.visualBridge\.lowFrequencyAmplitude/, 'particles must support native audio bridge bass');
assert.match(app, /saveTextComposerSettings\(/, 'particle settings must use the persisted text composer store');

assert.match(css, /\.lyric-highlight-particles/, 'missing particle canvas styling');
assert.match(css, /\.lyric-highlight-particles--front/, 'missing front depth layer styling');
assert.match(css, /pointer-events:\s*none/, 'particle canvas must never block lyric interaction');
assert.match(css, /prefers-reduced-motion:\s*reduce/, 'particle visual must respect reduced motion');

console.log('3D lyric highlight particle contract passed.');
