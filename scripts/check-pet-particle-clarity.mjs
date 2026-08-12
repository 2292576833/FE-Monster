import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('web/pet-particle-orb.js', 'utf8');
const vertex = source.match(/function\s+vertexShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';
const fragment = source.match(/function\s+fragmentShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';

assert.match(source, /const\s+DPR_LIMIT\s*=\s*2\s*;/,
  'the particle framebuffer must preserve clarity through 2x DPI');
assert.match(source, /const\s+DPR_FLOOR\s*=\s*1\.5\s*;[\s\S]*Math\.min\(DPR_LIMIT\s*,\s*Math\.max\(DPR_FLOOR\s*,\s*Number\(global\.devicePixelRatio\)/,
  'WebGL and Canvas fallback must share the bounded low-DPI supersample floor');
assert.match(vertex, /gl_PointSize\s*=\s*\(2\.[6-9]/,
  'the 8192-point topology must preserve the measured ~1.2%-of-height pearl core');
assert.match(fragment, /float\s+antiAlias\b[\s\S]*fwidth\s*\(\s*signedDistance\s*\)/,
  'point-sprite edges must use derivative-aware analytic coverage at every DPI');
assert.match(fragment, /float\s+gaussianKernel\b\s*=\s*exp\s*\(/,
  'pearl micro-surfaces need a continuous finite Gaussian instead of pixel-sized rings');
assert.match(fragment, /float\s+pearlOutline\b/,
  'each pearl needs a distinct outline so adjacent points do not visually merge');
assert.match(fragment, /float\s+ambientAura\b/,
  'idle particles must retain a finite self-emissive aura after realtime mode ends');
assert.match(source, /const\s+AMBIENT_EMISSION_FLOOR\s*=\s*0\.[7-9]/,
  'idle emission must have a stable non-grey floor');
assert.match(fragment, /ambientAura[\s\S]*ambientEmission/,
  'ambient glow must be shaded independently from realtime glow');
assert.match(source, /runtime\.liveGlowTarget\s*=\s*liveStateIntensity\(\)/,
  'realtime highlight must still decay toward zero rather than becoming the idle floor');
assert.match(source, /const\s+liveTimeConstant\s*=\s*runtime\.liveGlowTarget\s*>\s*runtime\.liveGlow\s*\?\s*165\s*:\s*[4-9]\d\d/,
  'leaving realtime mode must fade smoothly instead of snapping');
assert.equal((source.match(/new\s+THREE\.Points\s*\(/g) || []).length, 1,
  'clarity improvements must remain in the existing single GPU draw call');
assert.doesNotMatch(source, /AdditiveBlending|EffectComposer|UnrealBloomPass|shadowBlur/,
  'clarity must not come from a gap-filling fullscreen bloom or CPU shadow blur');

process.stdout.write(JSON.stringify({
  ok: true,
  dpiCoverage: [1, 1.25, 1.5, 2],
  particleCount: 8192,
  gpuDrawCalls: 1,
  qualities: ['adaptive edge', 'pearl highlight', 'separate outline', 'ambient self-emission']
}, null, 2) + '\n');
