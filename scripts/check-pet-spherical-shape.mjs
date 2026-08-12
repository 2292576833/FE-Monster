import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const runtime = readFileSync('web/pet-particle-orb.js', 'utf8').replace(/\r\n/g, '\n');
const vertexShader = runtime.match(/function\s+vertexShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';

assert.match(runtime, /const\s+SURFACE_PROFILE\s*=\s*['"]lavender-audio-reactive-sphere-v1['"]/,
  'the renderer must identify the audio-reactive spherical surface profile');
assert.match(runtime, /const\s+SPHERE_BREATH_FREQUENCY_HZ\s*=\s*0\.36\b/,
  'the quiet sphere must retain one slow uniform radial pulse');
assert.match(runtime, /const\s+SPHERE_BASE_RADIUS\s*=\s*0\.82\b/,
  'the sphere must fill more of the existing transparent character canvas');
assert.match(runtime, /const\s+FALLBACK_RADIUS_SCALE\s*=\s*0\.38\b/,
  'Canvas2D fallback must receive the same larger visual scale');
assert.match(runtime, /const\s+LOW_SURFACE_RESPONSE\s*=\s*0\.13\b/);
assert.match(runtime, /const\s+MID_SURFACE_RESPONSE\s*=\s*0\.105\b/);
assert.match(runtime, /const\s+HIGH_SURFACE_RESPONSE\s*=\s*0\.12\b/);
assert.match(runtime, /const\s+AUDIO_RESPONSE_EXPONENT\s*=\s*0\.52\b/,
  'ordinary audio must receive a perceptual lift instead of linear under-response');

assert.match(vertexShader, /vec3\s+sphericalSurfacePosition\s*\(/,
  'the vertex shader must expose one inspectable spherical geometry function');
assert.match(vertexShader, /float\s+audioSurfaceDisplacement\s*\(/,
  'audio must drive a bounded radial surface deformation instead of locking the sphere');
assert.match(vertexShader, /return\s+clamp\([^;]+-0\.20\s*,\s*0\.20\s*\)\s*;/s,
  'combined frequency deformation must stay within a twenty-percent radial budget');
assert.match(vertexShader, /return\s+direction\s*\*\s*radius\s*;/,
  'audio motion must remain radial so the resting topology returns to a sphere');
assert.doesNotMatch(vertexShader,
  /superellipsoidSurface|primaryDent|oppositePrimaryDent|counterBulge|latitudeFold|diagonalFold|pairedDent|pairedBulge/,
  'the sphere must not retain the previous cube, lobe, dent or fold deformation');
assert.doesNotMatch(vertexShader, /deformed\s*\.[xyz]\s*\*=|surfaceTangent/,
  'the shader must not stretch individual axes or shear points along a tangent');
const pointSizeExpression = vertexShader.match(/gl_PointSize\s*=\s*([\s\S]*?);/)?.[1] || '';
assert.ok(pointSizeExpression, 'the pearl footprint expression must remain inspectable');
assert.doesNotMatch(pointSizeExpression, /aBand|highWeight|twinkle/,
  'frequency response must not grow only one latitude band and spike the spherical silhouette');

assert.match(runtime, /runtime\.points\.scale\.setScalar\s*\(/,
  'all companion state motion must preserve equal X/Y/Z object scale');
assert.doesNotMatch(runtime, /runtime\.points\.scale\.set\s*\(/,
  'no state may turn the sphere into an ellipsoid with non-uniform scale');
assert.match(runtime, /const\s+lowFrequencyPulse\s*=\s*Math\.pow\(runtime\.bands\.low\s*,\s*AUDIO_RESPONSE_EXPONENT\)/,
  'low frequencies must drive one uniform whole-sphere pulse');
assert.match(runtime, /const\s+midFrequencyOrbit\s*=\s*Math\.sin\([^;]+Math\.pow\(runtime\.bands\.mid\s*,\s*AUDIO_RESPONSE_EXPONENT\)/s,
  'mid frequencies must drive visible whole-sphere rotation');
assert.match(runtime, /const\s+highFrequencyTremble\s*=\s*Math\.sin\([^;]+Math\.pow\(runtime\.bands\.high\s*,\s*AUDIO_RESPONSE_EXPONENT\)/s,
  'high frequencies must drive a fast bounded whole-sphere tremble');
assert.match(runtime, /uniformScale\s*=\s*[^;]*lowFrequencyPulse/,
  'low-frequency motion must preserve uniform X/Y/Z sphere scale');

const fallback = runtime.match(/function\s+drawFallback\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}\n\n\s*function\s+renderVisualFrame/)?.[1] || '';
assert.match(fallback, /const\s+uniformRadius\b/,
  'Canvas2D fallback must use the same uniform spherical radius');
assert.doesNotMatch(fallback, /signedPower|shapeMix|surface[XYZ]\s*\*=|fold|dent|bulge/,
  'Canvas2D fallback must not silently keep the former deformed geometry');

assert.match(runtime, /const\s+LATITUDE_COUNT\s*=\s*64\b/);
assert.match(runtime, /const\s+LONGITUDE_COUNT\s*=\s*128\b/);
assert.equal((runtime.match(/new\s+THREE\.Points\s*\(/g) || []).length, 1,
  'the 8192-point sphere must remain one WebGL draw call');

process.stdout.write('Desktop pet audio-reactive spherical-shape contract passed.\n');
