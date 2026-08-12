import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('web/pet-particle-orb.js', 'utf8');
const css = readFileSync('web/pet-assistant.css', 'utf8');
const failures = [];
const expect = (condition, message) => {
  if (!condition) failures.push(message);
};

const vertexShader = runtime.match(/function\s+vertexShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';
const fragmentShader = runtime.match(/function\s+fragmentShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';

function functionBody(name) {
  const signature = `function ${name}(`;
  const start = runtime.indexOf(signature);
  if (start < 0) return '';
  const openingBrace = runtime.indexOf('{', start + signature.length);
  if (openingBrace < 0) return '';
  let depth = 0;
  for (let cursor = openingBrace; cursor < runtime.length; cursor += 1) {
    if (runtime[cursor] === '{') depth += 1;
    if (runtime[cursor] === '}') depth -= 1;
    if (depth === 0) return runtime.slice(openingBrace + 1, cursor);
  }
  return '';
}

const gpuAttributeNames = [...runtime.matchAll(/geometry\.setAttribute\(\s*['"](a[A-Za-z0-9_]+)['"]/g)]
  .map((match) => match[1]);
expect(gpuAttributeNames.includes('aSurfaceUv'),
  'the ordered video-reference surface must carry its stable UV coordinates on the GPU');
expect(/attribute\s+vec2\s+aSurfaceUv\s*;/.test(vertexShader)
    && (vertexShader.match(/\baSurfaceUv\b/g) || []).length >= 2,
  'surface UVs must retain stable pearl identity for coherent twinkle');
expect(/vec3\s+sphericalSurfacePosition\s*\(/.test(vertexShader)
    && /return\s+direction\s*\*\s*radius\s*;/.test(vertexShader),
  'the ordered lattice must remain a radial sphere-derived surface');
expect(!/\b(?:personalArc|personalLoop|individualOffset|particleOffset)\b/.test(vertexShader),
  'per-pearl random walks must not tear apart the visible longitude/latitude lattice');
expect(!/superellipsoidSurface|primaryDent|oppositePrimaryDent|counterBulge|latitudeFold|diagonalFold/.test(vertexShader),
  'sphere choreography must not contain cube, lobe, dent or fold geometry');
expect(/SPHERE_BREATH_FREQUENCY_HZ\s*=\s*0\.36/.test(runtime),
  'the living sphere must use a slow shared radial breath');
expect(/float\s+audioSurfaceDisplacement\s*\(/.test(vertexShader)
    && /LOW_SURFACE_RESPONSE/.test(vertexShader)
    && /MID_SURFACE_RESPONSE/.test(vertexShader)
    && /HIGH_SURFACE_RESPONSE/.test(vertexShader),
  'low, mid and high frequencies must produce bounded radial surface motion');

for (const band of ['low', 'mid', 'high']) {
  const weight = new RegExp(`float\\s+${band}Weight\\s*=[^;]*aBand[^;]*;`, 'i');
  const response = new RegExp(`u${band[0].toUpperCase()}${band.slice(1)}\\s*\\*\\s*${band}Weight|${band}Weight\\s*\\*\\s*u${band[0].toUpperCase()}${band.slice(1)}`, 'i');
  expect(weight.test(vertexShader), `${band} frequency response must target a stable particle region through aBand`);
  expect(response.test(vertexShader), `${band} frequency region weight must modulate light or pearl size without deforming the sphere`);
}

expect(/gl_PointCoord/.test(fragmentShader) && /float\s+core\b/.test(fragmentShader) && /float\s+edge\b/.test(fragmentShader),
  'each particle must render a luminous core with a soft edge');
expect(/uniform\s+float\s+uEmission\s*;/.test(vertexShader)
    && /varying\s+float\s+vEmission\s*;/.test(vertexShader)
    && /varying\s+float\s+vEmission\s*;/.test(fragmentShader),
  'each particle must carry an explicit GPU self-emission signal');
expect(/float\s+halo\b/.test(fragmentShader)
    && /float\s+pearlBody\b/.test(fragmentShader)
    && /float\s+pinpointHighlight\b/.test(fragmentShader),
  'particle shading must separate the thin halo, pearl body and specular highlight');
expect(/blending:\s*THREE\.NormalBlending/.test(runtime)
    && !/(?:AdditiveBlending|EffectComposer|UnrealBloomPass)/.test(runtime),
  'self-emission must preserve particle gaps with one NormalBlending pass');
expect(/varying\s+float\s+vDepth\s*;/.test(vertexShader) && /varying\s+float\s+vDepth\s*;/.test(fragmentShader),
  'particle quality must include a per-point depth signal');
expect(/float\s+(?:depthFade|depthSoftness|depthGlow)\b/.test(fragmentShader),
  'fragment shading must turn depth into a visible softness/glow falloff');
expect(/(?:alpha|color)[^;]*(?:depthFade|depthSoftness|depthGlow)|(?:depthFade|depthSoftness|depthGlow)[^;]*(?:alpha|color)/.test(fragmentShader),
  'depth falloff must affect particle appearance, not remain unused');

const renderVisualFrame = functionBody('renderVisualFrame');
expect(renderVisualFrame.length > 0, 'renderVisualFrame must remain inspectable');
expect(!/\b(?:for|while)\s*\(/.test(renderVisualFrame),
  'WebGL visual frames must not update particles one-by-one on the CPU');
expect(!/\.needsUpdate\s*=|\.setXYZ\s*\(|\.array\s*\[/.test(renderVisualFrame),
  'stable particle attributes must stay GPU-resident between frames');
expect((runtime.match(/new\s+THREE\.Points\s*\(/g) || []).length === 1,
  'all particles must remain in one THREE.Points draw call');
expect((runtime.match(/renderer\.render\s*\(/g) || []).length === 1,
  'the orb must issue exactly one scene render per visual frame');
expect(/runtime\.behavior\s*===\s*['"]groove['"]/.test(renderVisualFrame)
    && /runtime\.behavior\s*===\s*['"]night-yawn['"]/.test(renderVisualFrame),
  'companion groove and night-yawn states must shape the particle object motion');
expect(/reactionEnvelope/.test(renderVisualFrame) && /eye-roll/.test(runtime),
  'rapid-skip reaction must become a bounded spatial particle gesture');
expect(/runtime\.points\.scale\.setScalar\s*\(/.test(renderVisualFrame),
  'all state choreography must preserve equal sphere scale on every axis');

const activeFrameInterval = functionBody('activeFrameInterval');
expect(/VISIBLE_FRAME_INTERVAL_MS\s*=\s*DEFAULT_RENDER_STEP_MS/.test(runtime),
  'visible motion must use the shared display-paced 60fps interval');
expect(/return\s+VISIBLE_FRAME_INTERVAL_MS\s*;/.test(activeFrameInterval),
  'idle and realtime states must share one bounded display cadence');
expect(/REDUCED_FRAME_INTERVAL_MS/.test(activeFrameInterval) && /runtime\.reducedMotion/.test(activeFrameInterval),
  'reduced-motion mode must retain its low-frequency pacing');
expect(/requestAnimationFrame\s*\(\s*frame\s*\)/.test(runtime),
  'active choreography must follow requestAnimationFrame');
expect(/function\s+stop\s*\([^)]*\)[\s\S]*?cancelAnimationFrame/.test(runtime)
    && /function\s+dispose\s*\([^)]*\)[\s\S]*?stop\s*\(\s*\)/.test(runtime),
  'hidden/disposed particle runtimes must stop their animation frame loop');
expect(/const\s+FALLBACK_POINT_STRIDE\s*=\s*8\s*;/.test(runtime)
    && /const\s+stride\s*=\s*FALLBACK_POINT_STRIDE\s*;/.test(runtime),
  'the Canvas fallback must use a fixed 1024-point ordered sample instead of an 8192-arc CPU loop');
expect(!/\.pet-assistant__particle-orb\s*\{[\s\S]*?filter:\s*drop-shadow\(0\s+0\s+5px/i.test(css),
  'a wide whole-canvas glow must not fill the deliberate gaps between particles');

assert.equal(failures.length, 0,
  `Desktop pet particle choreography contract failed:\n- ${failures.join('\n- ')}`);

process.stdout.write('Desktop pet per-particle choreography and quality contract passed.\n');
