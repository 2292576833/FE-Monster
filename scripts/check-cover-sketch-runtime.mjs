import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(path.resolve(import.meta.dirname, '../web/cover-sketch-runtime.js'), 'utf8');
let sampleReads = 0;
let failRead = false;
let projectedPoints = [];
let strokes = 0;
let projectedTiles = 0;
let lastProjectedTexture = null;
const drawing = {
  clearRect() { projectedPoints = []; strokes = 0; projectedTiles = 0; },
  beginPath() {},
  closePath() {}, clip() {}, save() {}, restore() {},
  setTransform(...values) { assert(values.every(Number.isFinite)); },
  drawImage(image) { projectedTiles += 1; lastProjectedTexture = image; },
  moveTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); projectedPoints.push([x, y]); },
  lineTo(x, y) { assert(Number.isFinite(x) && Number.isFinite(y)); projectedPoints.push([x, y]); },
  stroke() { strokes += 1; }
};
const scope = {
  document: {
    createElement() {
      const scratch = { width: 0, height: 0 };
      let drawnImage = null;
      const ink = {
        drawImage(image) { drawnImage = image; },
        clearRect() {}, setTransform() {},
        beginPath() {}, moveTo() {}, lineTo() {}, stroke() { strokes += 1; scratch.hasPencil = true; },
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        putImageData(pixels) { scratch.pixelData = new Uint8ClampedArray(pixels.data); },
        getImageData() {
          sampleReads += 1;
          if (failRead) throw new Error('Mock tainted image');
          const cached = scratch.pixelData || drawnImage?.pixelData;
          if (cached) return { data: new Uint8ClampedArray(cached), width: scratch.width, height: scratch.height };
          const data = new Uint8ClampedArray(scratch.width * scratch.height * 4);
          for (let y = 0; y < scratch.height; y += 1) {
            for (let x = 0; x < scratch.width; x += 1) {
              const index = (y * scratch.width + x) * 4;
              const inside = Math.hypot(x / scratch.width - 0.5, y / scratch.height - 0.5) < 0.3;
              data[index] = inside ? 236 : 30;
              data[index + 1] = inside ? 125 : 80;
              data[index + 2] = Math.round(x / scratch.width * 255);
              data[index + 3] = scratch.hasPencil || drawnImage?.hasPencil ? ((x + y) % 5 === 0 ? 0 : (x + y) % 3 === 0 ? 128 : 255) : 255;
              if (drawnImage?.alternate) data[index] = data[index + 1] = data[index + 2] = Math.round(y / scratch.height * 255);
            }
          }
          return { data };
        }
      };
      scratch.getContext = () => ink;
      return scratch;
    }
  }
};
vm.runInNewContext(source, scope);
const { create, depthFromLuminance } = scope.FeCoverSketch;
assert.equal(depthFromLuminance(1, {}), 0.1);
assert.equal(depthFromLuminance(0, {}), -0.04);
assert.equal(depthFromLuminance(0, { depthInvert: true }), 0.1);
assert.equal(depthFromLuminance(0.8, { depthEnabled: false }), 0);
assert.equal(depthFromLuminance(0.8, { depthStrength: 0 }), 0);
assert.equal(depthFromLuminance(0.8, { depthContrast: 3 }), 0.1);
assert.equal(depthFromLuminance(0.8, { depthInvert: true, depthContrast: 3 }), -0.04);
for (const value of [NaN, Infinity, undefined, -50, 50]) assert(Number.isFinite(depthFromLuminance(value, {})));

const canvas = { width: 0, height: 0, getContext: () => drawing };
const renderer = create(canvas);
const frame = {
  width: 900, height: 760, dpr: 1.5, now: 0, deltaMs: 16.667,
  image: { complete: true, naturalWidth: 500, naturalHeight: 500 },
  imageSignature: 'test-cover', settings: {}, yaw: 0.15, pitch: -0.08, zoom: 1
};
assert.equal(renderer.render(frame), true);
assert.equal(renderer.getStats().imageStatus, 'ready');
assert.equal(renderer.getStats().sampleBuilds, 1);
assert.equal(renderer.getStats().depthSampleBuilds, 1);
assert.equal(renderer.getStats().depthImageStatus, 'generated');
assert.equal(renderer.getStats().geometryBuilds, 1);
assert(renderer.getStats().points > 5000);
assert(renderer.getStats().points <= 28000);
assert(projectedTiles > 100);
assert.equal(renderer.getStats().sampleSize, 512, 'Desktop detail sampling must retain facial and text details');
assert(renderer.getStats().paths > 10000, 'Continuous sparse layer curves retain locally sampled colour spans');
assert.equal(renderer.getStats().layers, 8);
assert(renderer.getStats().layerDetails.every(layer => layer.estimatedCoverage < 0.18), 'Each default layer stays sparse');
const initial = JSON.stringify(projectedPoints.slice(0, 30));
renderer.render({ ...frame, now: 100, deltaMs: 64 });
assert.notEqual(JSON.stringify(projectedPoints.slice(0, 30)), initial, 'Idle flow must move line geometry');
assert.equal(sampleReads, 1, 'Unchanged image is sampled once');
assert.equal(renderer.getStats().geometryBuilds, 1);
assert.equal(renderer.getStats().textureBuilds, 1, 'Idle flow must reuse the pencil texture');
assert.equal(renderer.getStats().compositeBuilds, 2, 'Idle flow recomposes separately moving cached layers');
assert.equal(renderer.getStats().depthSampleBuilds, 1, 'Idle flow reuses automatic depth from the cover');

frame.settings.sketchFlowSpeed = 0;
renderer.render(frame);
const frozen = JSON.stringify(projectedPoints);
renderer.render({ ...frame, now: 2000 });
assert.equal(JSON.stringify(projectedPoints), frozen, 'Speed zero must freeze the image');
frame.settings.depthStrength = 2.5;
renderer.render(frame);
assert.notEqual(JSON.stringify(projectedPoints), frozen, 'Depth changes must affect projected positions');
assert.equal(renderer.getStats().geometryBuilds, 1, 'Depth changes must not rebuild geometry');
frame.settings.sketchLineWidth = 1.5;
renderer.render(frame);
assert.equal(renderer.getStats().geometryBuilds, 1, 'Line width changes must not rebuild geometry');
assert.equal(renderer.getStats().textureBuilds, 2, 'Line width changes rebuild the cached pencil marks');
assert.equal(renderer.getStats().depthSampleBuilds, 1, 'Depth and line parameters reuse automatic depth samples');
frame.settings.sketchLayers = 16;
frame.settings.sketchDensity = 1.6;
renderer.render(frame);
assert.equal(renderer.getStats().layers, 16);
assert(renderer.getStats().points <= 28000);
assert.equal(sampleReads, 1, 'Geometry changes reuse sampled image');
renderer.render({ ...frame, mobile: true });
assert(renderer.getStats().points <= 12500);
assert.equal(renderer.getStats().sampleSize, 384);

frame.settings.sketchFlowSpeed = 1.6;
renderer.render({ ...frame, reducedMotion: true });
const reduced = JSON.stringify(projectedPoints);
renderer.render({ ...frame, reducedMotion: true, now: 5000 });
assert.equal(JSON.stringify(projectedPoints), reduced, 'Reduced motion must remain still');
const legacyFrame = { ...frame, reducedMotion: true, depthImage: { complete: true, naturalWidth: 500, naturalHeight: 500, alternate: true }, depthImageSignature: 'legacy-import' };
const samplesBeforeLegacy = sampleReads;
const depthBeforeLegacy = renderer.getStats().depthSampleBuilds;
renderer.render(legacyFrame);
assert.equal(renderer.getStats().depthImageStatus, 'generated');
assert.equal(JSON.stringify(projectedPoints), reduced, 'Legacy imported depth fields must not override automatic cover depth');
assert.equal(sampleReads, samplesBeforeLegacy, 'Legacy depth images are not read');
assert.equal(renderer.getStats().depthSampleBuilds, depthBeforeLegacy, 'Legacy depth fields do not invalidate automatic depth');
renderer.render({ ...frame, settings: { ...frame.settings, sketchLayers: 2, sketchDensity: 0.4 }, reducedMotion: true,
  image: { complete: true, naturalWidth: 500, naturalHeight: 500, alternate: true }, imageSignature: 'alternate-cover' });
assert.equal(renderer.getStats().depthSampleBuilds, depthBeforeLegacy + 1, 'Changing the cover generates new automatic depth');
assert.notEqual(JSON.stringify(projectedPoints), reduced, 'Different covers produce different depth displacement even without the lighting module');
frame.image = null;
renderer.render(frame);
assert.equal(renderer.getStats().imageStatus, 'placeholder');
assert.equal(renderer.getStats().depthImageStatus, 'placeholder');
assert(renderer.getStats().points > 0, 'Missing images should still draw lines');

failRead = true;
frame.image = { complete: true, naturalWidth: 300, naturalHeight: 300 };
renderer.render(frame);
const readsAfterFailure = sampleReads;
assert.equal(renderer.getStats().imageStatus, 'unavailable');
renderer.render(frame);
renderer.render(frame);
assert.equal(sampleReads, readsAfterFailure, 'A tainted image must not be retried every frame');

renderer.reset();
assert.equal(renderer.getStats().points, 0);
assert.equal(renderer.getStats().imageStatus, 'empty');
renderer.render(frame);
assert.equal(sampleReads, readsAfterFailure + 1, 'Reset should release the image cache');
renderer.destroy();
assert.equal(renderer.getStats().destroyed, true);
assert.equal(renderer.getStats().points, 0);
assert.equal(renderer.render(frame), false);
assert.equal(create({ getContext: () => null }).render(frame), false);

// Exercise the real shared transform with static lighting and independent toggles.
failRead = false;
vm.runInNewContext(readFileSync(path.resolve(import.meta.dirname, '../web/cover-depth-light.js'), 'utf8'), scope);
const mappedRenderer = create({ width: 0, height: 0, getContext: () => drawing });
const mapFrame = {
  width: 700, height: 600, dpr: 1, now: 0, deltaMs: 0, reducedMotion: true,
  image: { complete: true, naturalWidth: 400, naturalHeight: 400 }, imageSignature: 'map-cover',
  settings: { sketchLayers: 2, sketchFlowSpeed: 0, sketchFlowAmplitude: 0, depthLightSpeed: 0 }
};
function renderedPixels() {
  return lastProjectedTexture.getContext('2d').getImageData(0, 0, lastProjectedTexture.width, lastProjectedTexture.height).data;
}
let originalLayerBuilds = 0;
let originalMeshBuilds = 0;
for (const lightingSettings of [
  { depthEnabled: false },
  { depthEnabled: true, depthLightingEnabled: false },
  { depthEnabled: true, depthLightingEnabled: true, depthLightStrength: 0 },
  { depthEnabled: true, depthLightingEnabled: true, depthLightStrength: 1.1 }
]) {
  mapFrame.settings = { ...mapFrame.settings, ...lightingSettings, depthMapEnabled: false };
  mappedRenderer.render(mapFrame);
  const original = renderedPixels();
  assert(original.some((value, index) => index % 4 === 3 && value === 0), 'Fixture includes transparent gaps between pencil lines');
  assert(original.some((value, index) => index % 4 === 3 && value === 128), 'Fixture includes antialiased pencil coverage');
  originalLayerBuilds = mappedRenderer.getStats().textureBuilds;
  originalMeshBuilds = mappedRenderer.getStats().geometryBuilds;
  mapFrame.settings.depthMapEnabled = true;
  mappedRenderer.render(mapFrame);
  const mapped = renderedPixels();
  assert.notDeepEqual(mapped, original, 'Depth map toggle changes the current pencil pixels independently of lighting');
  for (let offset = 3; offset < mapped.length; offset += 4) assert.equal(mapped[offset], original[offset], 'Mapped pencil strokes preserve original alpha coverage');
  assert.equal(mappedRenderer.getStats().textureBuilds, originalLayerBuilds, 'Toggling the look does not regenerate pencil strokes');
  assert.equal(mappedRenderer.getStats().geometryBuilds, originalMeshBuilds, 'Toggling the look does not rebuild projection geometry');
  mapFrame.settings.depthMapEnabled = false;
  mappedRenderer.render(mapFrame);
  assert.deepEqual(renderedPixels(), original, 'Disabling depth map exactly restores the original texture and lighting');
}
assert.equal(mappedRenderer.getStats().depthMapTextureBuilds, 1, 'Repeated toggles reuse the same mapped layer cache');
mapFrame.settings = { ...mapFrame.settings, depthLightingEnabled: false, depthMapEnabled: true, sketchFlowSpeed: 1, sketchFlowAmplitude: 1 };
mappedRenderer.render(mapFrame);
const mappedReads = sampleReads;
for (let i = 1; i <= 4; i += 1) mappedRenderer.render({ ...mapFrame, reducedMotion: false, now: i * 17, deltaMs: 17 });
assert.equal(sampleReads, mappedReads, 'Animating mapped layers adds no per-frame pixel readback');
assert.equal(mappedRenderer.getStats().depthMapTextureBuilds, 1, 'Animated flow reuses mapped layer pixels');
mapFrame.settings.sketchLayers = 3;
mappedRenderer.render(mapFrame);
assert.equal(mappedRenderer.getStats().depthMapTextureBuilds, 2, 'Changing layers invalidates the mapped layer cache');
mapFrame.imageSignature = 'map-cover-new';
mapFrame.image = { ...mapFrame.image, alternate: true };
mappedRenderer.render(mapFrame);
assert.equal(mappedRenderer.getStats().depthMapTextureBuilds, 3, 'New covers generate their own mapped pencil textures');
mappedRenderer.destroy();
console.log('Cover sketch runtime: depth mapping, animated lines, cache invalidation, budgets, fallback, cleanup and reversible depth-map textures passed.');
