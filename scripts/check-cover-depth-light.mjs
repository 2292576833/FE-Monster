import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = readFileSync(path.resolve(import.meta.dirname, '../web/cover-depth-light.js'), 'utf8');
const scope = {};
vm.runInNewContext(source, scope);
const api = scope.FeCoverDepthLight;

assert.equal(typeof api.depthMapColor, 'function', 'The depth-map look must be a distinct color transform, independent of 3D depth strength.');
assert.equal(typeof api.glslDepthMapSnippet, 'string');
const black = api.depthMapColor(0, 0, 0);
const white = api.depthMapColor(1, 1, 1);
assert(black.every(channel => channel === 0));
assert(white.every(channel => channel === 1));
assert(api.depthMapColor(.2, .2, .2)[0] < .06, 'The reference look has deep, dark shadows.');
assert(api.depthMapColor(.8, .8, .8)[0] > .9, 'Bright areas should approach a white highlight.');
let previousTone = -1;
let midtoneSteps = 0;
for (let step = 0; step <= 100; step += 1) {
  const input = step / 100;
  const result = api.depthMapColor(input, input, input);
  assert(result.every(channel => channel === result[0]), 'Neutral tones must remain neutral.');
  assert(result[0] >= previousTone, 'The contrast curve must preserve tonal ordering.');
  if (input >= .25 && input <= .75 && result[0] > previousTone) midtoneSteps += 1;
  previousTone = result[0];
}
assert(midtoneSteps > 45, 'A continuous midtone gradient must retain detail instead of becoming a two-color threshold.');
for (const color of [[.1,.8,.3],[.2,.3,.9],[.85,.6,.15],[.7,.3,.5],[.6,.2,.1]]) {
  const result = api.depthMapColor(...color);
  assert(result.every(channel => channel === result[0]), 'Ordinary colored cover regions must convert to grayscale.');
}
const redAccent = api.depthMapColor(.98,.04,.03);
assert(redAccent[0] > .65 && redAccent[1] < .08 && redAccent[2] < .08, 'Only bright saturated red accents may retain the reference eye glow.');
assert(api.depthMapColor(.3,.02,.02).every((channel, index, result) => channel === result[0]), 'Dark red regions must join the monochrome shadows.');
assert(api.depthMapColor(NaN, Infinity, -5).every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1));
assert(api.glslDepthMapSnippet.includes('vec3 feCoverDepthMapColor(vec3 sourceColor)'));

// Independent transcription of the shader expression verifies every part of
// the CPU mapping on a grid, including the narrow red-accent transition.
const smooth = (low, high, value) => { const t = Math.max(0, Math.min(1, (value-low)/(high-low))); return t*t*(3-2*t); };
for (let ri=0;ri<=10;ri++) for (let gi=0;gi<=10;gi++) for (let bi=0;bi<=10;bi++) {
  const r=ri/10,g=gi/10,b=bi/10;
  const tone=smooth(.08,.9,r*.2126+g*.7152+b*.0722)**1.35;
  const other=Math.max(g,b);
  const accent=.82*smooth(.7,.95,r)*(1-smooth(.12,.3,other))*smooth(.55,.8,r-other);
  const gpu=[tone*(1-accent)+Math.max(tone,.92)*accent,tone*(1-accent*.92),tone*(1-accent*.92)];
  const cpu=api.depthMapColor(r,g,b);
  cpu.forEach((channel,index)=>assert(Math.abs(channel-gpu[index])<1e-12,'Depth-map CPU and shader color equations must match.'));
}

function image(width, height, valueAt) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = valueAt(x / Math.max(1, width - 1), y / Math.max(1, height - 1));
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = Math.round(value * 255);
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

for (const [width, height] of [[1, 1], [2, 5], [64, 48]]) {
  const pixels = image(width, height, () => 0.5);
  const before = pixels.slice();
  const flat = api.buildField(pixels, width, height);
  assert.deepEqual(pixels, before, 'Field preparation must not change the cover pixels.');
  assert.equal(flat.heights.length, width * height);
  assert.equal(flat.normals.length, width * height * 3);
  for (let i = 0; i < width * height; i += 1) {
    assert.equal(flat.normals[i * 3], 0);
    assert.equal(flat.normals[i * 3 + 1], 0);
    assert.equal(flat.normals[i * 3 + 2], 1);
  }
  const flatShade = api.sampleLighting(flat, 0.5, 0.5, api.prepare({}, 0));
  assert(flatShade >= 1 && flatShade < 1.05, 'Default lighting must preserve a flat cover tone.');
}
assert.throws(() => api.buildField(new Uint8Array(4), 2, 2), /complete RGBA/);
assert.throws(() => api.buildField(new Uint8Array(4), 0, 1), /positive integer/);

const relief = api.buildField(image(128, 128, (u, v) => 0.15 + 0.75 * Math.exp(-((u - 0.5) ** 2 + (v - 0.5) ** 2) * 18)), 128, 128);
for (let i = 0; i < relief.heights.length; i += 1) {
  assert(relief.heights[i] >= 0 && relief.heights[i] <= 1);
  const n = relief.normals.subarray(i * 3, i * 3 + 3);
  assert(Math.abs(Math.hypot(...n) - 1) < 1e-6, 'Estimated normals must be unit vectors.');
}
const east = api.prepare({ depthLightAngle: 0, depthLightSpeed: 0 }, 0);
const west = api.prepare({ depthLightAngle: 180, depthLightSpeed: 0 }, 0);
const eastSlope = api.sampleLighting(relief, 0.65, 0.5, east);
const westSlope = api.sampleLighting(relief, 0.65, 0.5, west);
assert(eastSlope - westSlope > 0.15, 'Light direction must reveal actual image slopes.');
assert(api.sampleLighting(relief, 0.35, 0.5, west) - api.sampleLighting(relief, 0.35, 0.5, east) > 0.15, 'The opposite slope must respond to the opposite light.');

for (const prefs of [{ depthEnabled: false }, { depthLightingEnabled: false }, { depthLightStrength: 0 }, { depthStrength: 0 }]) {
  assert.equal(api.sampleLighting(relief, 0.3, 0.4, prefs, 10), 1, 'Disabled lighting must preserve exact cover color.');
}
assert.equal(api.sampleLighting(null, 0.5, 0.5, {}), 1);
assert.equal(api.lightingFromNormal(0, 0, 0, {}), 1);
assert.equal(api.lightingFromNormal(NaN, 0, 1, {}), 1);
assert.equal(api.sampleLighting(relief, NaN, Infinity, {}), api.sampleLighting(relief, 0.5, 0.5, {}));
assert.equal(api.sampleLighting(relief, -1, 2, {}), api.sampleLighting(relief, 0, 1, {}));

const stationaryStart = api.prepare({ depthLightSpeed: 0 }, 0);
const stationaryLater = api.prepare({ depthLightSpeed: 0 }, 90);
assert.deepEqual(stationaryStart, stationaryLater, 'Zero speed must hold the light still.');
const rotatingStart = api.prepare({}, 0);
const rotatingLater = api.prepare({}, 28);
assert(Math.abs(api.sampleLighting(relief, 0.65, 0.5, rotatingStart) - api.sampleLighting(relief, 0.65, 0.5, rotatingLater)) > 0.08, 'The idle light must move over the estimated shape.');

const normalOffset = (64 * relief.width + 83) * 3;
const nx = relief.normals[normalOffset];
const ny = relief.normals[normalOffset + 1];
const nz = relief.normals[normalOffset + 2];
assert(Math.abs(api.lightingFromNormal(nx, ny, nz, { depthLightAngle: 0, depthInvert: true }) - api.lightingFromNormal(-nx, -ny, nz, { depthLightAngle: 0 })) < 1e-12, 'Invert must flip relief slopes before lighting.');
const noSpec = api.lightingFromNormal(...east.halfVector, { depthLightAngle: 0, depthHighlight: 0 });
const withSpec = api.lightingFromNormal(...east.halfVector, { depthLightAngle: 0, depthHighlight: 1 });
assert(withSpec - noSpec > 0.3, 'Highlight strength must affect specular reflections.');

// A multiplicative light cannot illuminate a cover channel already clipped to
// black. Keep a bounded, normal-dependent specular term separate from its color.
assert.equal(typeof api.highlightFromNormal, 'function', 'Dark cover surfaces need a separate additive specular response.');
const peakLight = api.prepare({ depthLightAngle: 0, depthLightSpeed: 0 }, 0);
const peakHighlight = api.highlightFromNormal(...peakLight.halfVector, peakLight);
assert(peakHighlight > 0.025 && peakHighlight < 0.04, 'Default highlights should reveal dark detail without washing out the cover.');
assert(0 * api.lightingFromNormal(...peakLight.halfVector, peakLight) + peakHighlight > 0.025, 'An illuminated black channel must receive a visible reflection.');
assert(api.highlightFromNormal(...peakLight.halfVector, { depthLightAngle: 180, depthLightSpeed: 0 }) < peakHighlight * 0.02, 'Highlights follow the actual surface normal and light direction.');
assert(api.highlightFromNormal(0, 0, 1, {}) < 0.008, 'Flat dark areas should not receive a broad gray wash.');
for (const prefs of [{ depthEnabled: false }, { depthLightingEnabled: false }, { depthLightStrength: 0 }, { depthStrength: 0 }, { depthHighlight: 0 }]) {
  assert.equal(api.highlightFromNormal(...peakLight.halfVector, prefs), 0, 'A disabled effect must not add any light.');
}
assert.equal(api.highlightFromNormal(0, 0, 0, {}), 0);
assert.equal(api.highlightFromNormal(NaN, 0, 1, {}), 0);

// Evaluate the documented GPU expression independently of the CPU helper.
for (const prefs of [{}, { depthLightStrength: 2, depthAmbient: 0.05, depthHighlight: 2, depthContrast: 3, depthInvert: true }]) {
  for (const time of [0, 7, 28]) {
    const light = api.prepare(prefs, time);
    for (let i = 0; i < relief.normals.length; i += 117) {
      const x = relief.normals[i] * light.normalScale;
      const y = relief.normals[i + 1] * light.normalScale;
      const z = relief.normals[i + 2];
      const length = Math.hypot(x, y, z);
      const diffuse = Math.max(0, (x * light.direction[0] + y * light.direction[1] + z * light.direction[2]) / length);
      const spec = Math.max(0, (x * light.halfVector[0] + y * light.halfVector[1] + z * light.halfVector[2]) / length) ** 24;
      const gpu = Math.max(0.2, Math.min(1.8, 1 + light.strength * (light.ambient + (1 - light.ambient) * diffuse / 0.72 - 1) + light.strength * light.highlight * 0.45 * spec));
      const cpu = api.lightingFromNormal(relief.normals[i], relief.normals[i + 1], relief.normals[i + 2], light);
      assert(Math.abs(cpu - gpu) < 1e-12);
      assert(cpu >= 0.2 && cpu <= 1.8);
      const gpuHighlight = Math.max(0, Math.min(0.32, light.strength * light.highlight * 0.12 * spec));
      const cpuHighlight = api.highlightFromNormal(relief.normals[i], relief.normals[i + 1], relief.normals[i + 2], light);
      assert(Math.abs(cpuHighlight - gpuHighlight) < 1e-12, 'Additive CPU and GPU highlight math must match.');
      for (const channel of [0, 0.12, 0.5, 1]) {
        const lit = channel * cpu + cpuHighlight * (1 - channel);
        assert(lit >= channel * cpu && lit <= channel * cpu + 0.32, 'Specular energy stays bounded and preserves the existing color term.');
        if (channel === 1) assert.equal(lit, cpu, 'Already white channels receive no additive washout.');
      }
    }
  }
}
assert(api.glslSnippet.includes('float feCoverDepthLighting('));
assert(api.glslSnippet.includes('float feCoverDepthHighlight('));
console.log('Cover depth light checks passed: smooth relief, image-dependent moving light, controls, detail-preserving defaults, CPU/GPU math parity.');
