import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const appSource = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const depthSource = readFileSync(new URL('../web/cover-depth-light.js', import.meta.url), 'utf8');
const sampleStart = appSource.indexOf('function buildCoverParticleSamples(');
const sampleEnd = appSource.indexOf('function syncCoverParticleCanvas(', sampleStart);
assert(sampleStart >= 0 && sampleEnd > sampleStart, 'Particle sampling entry point must be available.');

let depthBuilds = 0;
let pixelReads = 0;
let latestField = null;
const cover = { image: null, imageSignature: '', sampleSignature: '', particles: [] };
const scope = {
  state: { coverParticle: cover },
  window: {},
  clamp: (value, low, high) => Math.max(low, Math.min(high, value)),
  reducedMotion: false,
  MOBILE_RENDER_TARGET: false,
  graphicsSafeFallbackActive: () => true,
  coverParticleFallbackColor: () => ({ r: 100, g: 120, b: 140 }),
  coverParticleNoise: () => 0.5,
  coverParticleDisplayChannel: value => value,
  COVER_PARTICLE_MICRO_WAVE_SEGMENTS: 16,
  COVER_PARTICLE_BASS_JITTER_BASE_RATE: 28,
  document: {
    createElement(tag) {
      assert.equal(tag, 'canvas');
      const canvas = { width: 0, height: 0 };
      let drawnImage = null;
      canvas.getContext = () => ({
        clearRect() {},
        drawImage(image) { drawnImage = image; },
        getImageData() {
          pixelReads += 1;
          if (drawnImage.kind === 'tainted') throw new Error('Mock CORS-tainted canvas');
          const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
          for (let y = 0; y < canvas.height; y += 1) {
            for (let x = 0; x < canvas.width; x += 1) {
              const index = (y * canvas.width + x) * 4;
              const gray = drawnImage.kind === 'vertical'
                ? Math.round(y / Math.max(1, canvas.height - 1) * 255)
                : Math.round(x / Math.max(1, canvas.width - 1) * 255);
              data[index] = data[index + 1] = data[index + 2] = gray;
              data[index + 3] = drawnImage.kind === 'transparent' ? 0 : 255;
            }
          }
          return { data };
        }
      });
      return canvas;
    }
  }
};

vm.createContext(scope);
vm.runInContext(depthSource, scope);
const actualBuildField = scope.window.FeCoverDepthLight.buildField;
scope.window.FeCoverDepthLight.buildField = (...args) => {
  depthBuilds += 1;
  latestField = actualBuildField(...args);
  return latestField;
};
vm.runInContext(appSource.slice(sampleStart, sampleEnd), scope);
const sample = () => scope.buildCoverParticleSamples(640, 480, 1, false);
const readyImage = kind => ({ complete: true, naturalWidth: 64, naturalHeight: 64, kind });
const assertFallback = () => {
  assert(cover.particles.length > 0, 'A missing/unreadable cover must retain the existing visual fallback.');
  assert(cover.particles.every(particle => Number.isFinite(particle.z)
    && particle.normalX === 0 && particle.normalY === 0 && particle.normalZ === 1),
  'Fallback particles must have finite depth and neutral normals.');
};

cover.image = readyImage('horizontal');
cover.imageSignature = 'horizontal-cover';
sample();
assert.equal(depthBuilds, 1);
assert.equal(pixelReads, 1);
assert.equal(cover.particles.length, latestField.width * latestField.height);
const originalParticles = cover.particles;
const originalField = latestField;
for (let index = 0; index < originalParticles.length; index += 1) {
  const particle = originalParticles[index];
  assert.equal(particle.z, Math.pow(originalField.heights[index], 1.42) * 0.14 - 0.04,
    'Geometry must map the shared estimated heights, not separately sampled raw luminance.');
  assert.equal(particle.normalX, originalField.normals[index * 3]);
  assert.equal(particle.normalY, originalField.normals[index * 3 + 1]);
  assert.equal(particle.normalZ, originalField.normals[index * 3 + 2]);
}
sample();
sample();
assert.equal(cover.particles, originalParticles, 'Unchanged covers must reuse the particle sample array.');
assert.equal(depthBuilds, 1, 'Idle frames must reuse the generated depth field.');
assert.equal(pixelReads, 1, 'Idle frames must not read the cover again.');
Object.assign(cover, { depthEnabled: false, depthStrength: 2, depthContrast: 3, depthInvert: true });
sample();
assert.equal(depthBuilds, 1, 'Rendering controls must not regenerate source depth.');

cover.image = readyImage('vertical');
cover.imageSignature = 'vertical-cover';
sample();
assert.equal(depthBuilds, 2, 'Changing the cover must generate its own depth.');
assert.notDeepEqual(latestField.heights, originalField.heights);
assert.notDeepEqual(latestField.normals, originalField.normals);
assert.notDeepEqual(cover.particles.map(particle => particle.z), originalParticles.map(particle => particle.z));

cover.image = readyImage('transparent');
cover.imageSignature = 'transparent-cover';
sample();
assert.equal(cover.particles.length, 0, 'A fully transparent cover is a valid empty particle result.');
const emptyParticles = cover.particles;
const transparentBuilds = depthBuilds;
const transparentReads = pixelReads;
sample();
sample();
assert.equal(cover.particles, emptyParticles);
assert.equal(depthBuilds, transparentBuilds, 'Empty particle results must not rebuild depth every frame.');
assert.equal(pixelReads, transparentReads, 'Empty particle results must not reread pixels every frame.');

cover.image = null;
cover.imageSignature = 'missing-cover';
sample();
assert.equal(depthBuilds, transparentBuilds, 'No image must not call the RGBA depth builder.');
assertFallback();
const missingParticles = cover.particles;
sample();
assert.equal(cover.particles, missingParticles);

cover.image = readyImage('tainted');
cover.imageSignature = 'tainted-cover';
sample();
assertFallback();
const failedReads = pixelReads;
assert.equal(depthBuilds, transparentBuilds);
sample();
sample();
assert.equal(pixelReads, failedReads, 'A failed pixel read must be cached until the image changes.');

cover.image = { ...readyImage('horizontal'), complete: false };
cover.imageSignature = 'loading-cover';
sample();
assertFallback();
assert.equal(pixelReads, failedReads, 'Images still loading must not be sampled.');
cover.image.complete = true;
// updateCoverParticleImage.onload calls resetCoverParticleSamples, including this invalidation.
cover.sampleSignature = '';
cover.particles = [];
sample();
assert.equal(depthBuilds, transparentBuilds + 1, 'A loaded cover must replace its cached loading fallback.');
assert(cover.particles.some(particle => particle.normalX !== 0));

console.log('Automatic cover depth checks passed: shared geometry/normals, cover-change invalidation, idle/transparent caches, missing/CORS fallbacks, and loading recovery.');
