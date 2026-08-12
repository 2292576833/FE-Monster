import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const runtimePath = 'web/pet-particle-orb.js';
const runtime = readFileSync(runtimePath, 'utf8');
const normalized = runtime.replace(/\r\n/g, '\n');

// Lossless frame-forensics contract for:
// C:/Users/27736/Downloads/share_78cd72a96b51ed4fb4c6481fdc5ffbfa1785955750.mp4
// 720x1280, AVC, 586 frames at exact 30fps, 19.533333s.
const reference = Object.freeze({
  sha256: 'EDB8A0F814F7DF6B8F5AE694C7CACC8C38713681456EB171A7EF1BCA39AC023B',
  clearFrameStart: 52,
  clearFrameEnd: 116,
  latitudeRows: 64,
  longitudeColumns: 128,
  particleCount: 8192,
  coreColorHex: '#C9BEDF',
  shadowColorHex: '#8F88AC',
  highlightColorHex: '#EEE2FE',
  sphereBreathFrequencyHz: 0.36
});

assert.equal(createHash('sha256').update(readFileSync(
  'C:/Users/27736/Downloads/share_78cd72a96b51ed4fb4c6481fdc5ffbfa1785955750.mp4'
)).digest('hex').toUpperCase(), reference.sha256,
'the parity oracle must remain tied to the exact inspected source video');

assert.match(normalized, new RegExp(`const\\s+LATITUDE_COUNT\\s*=\\s*${reference.latitudeRows}\\b`),
  'the reference surface needs all 64 visible latitude rows');
assert.match(normalized, new RegExp(`const\\s+LONGITUDE_COUNT\\s*=\\s*${reference.longitudeColumns}\\b`),
  'the reference surface needs a 128-column ordered longitude lattice');
assert.match(normalized, /const\s+SURFACE_PROFILE\s*=\s*['"]lavender-audio-reactive-sphere-v1['"]/,
  'the renderer must expose the audio-reactive spherical surface profile');
assert.match(normalized, /const\s+SPHERE_BREATH_FREQUENCY_HZ\s*=\s*0\.36\b/,
  'the spherical companion must retain one slow uniform breath');
assert.match(normalized, /vec3\s+sphericalSurfacePosition\s*\(/,
  'the ordered video lattice must now be constrained to a true sphere');
assert.match(normalized, /float\s+audioSurfaceDisplacement\s*\(/,
  'low, mid and high bands must be able to move the spherical surface');
assert.match(normalized, /return\s+direction\s*\*\s*radius\s*;/,
  'frequency motion must remain radial and return to a sphere at silence');
assert.doesNotMatch(normalized, /superellipsoidSurface|primaryDent|latitudeFold|diagonalFold/,
  'the updated sphere must not retain the former cube or lobe deformation');
assert.doesNotMatch(normalized, /float\s+personalArc\s*=/,
  'random per-pearl orbit noise must not destroy the visible latitude/longitude lattice');
assert.match(normalized, /#C9BEDF/i,
  'the measured lavender-white core color must be documented in production source');
assert.match(normalized, /#8F88AC/i,
  'the measured deep lavender surface color must be documented in production source');
assert.match(normalized, /#EEE2FE/i,
  'the measured near-white highlight color must be documented in production source');

assert.equal((normalized.match(/new THREE\.Points\s*\(/g) || []).length, 1,
  '8192 pearls must remain one WebGL draw call');
assert.match(normalized, /surfaceProfile:\s*SURFACE_PROFILE/,
  'status diagnostics must identify which frame-forensics profile is active');
assert.match(normalized, /particleCount:\s*PARTICLE_COUNT/,
  'status diagnostics must expose all ordered surface points');

process.stdout.write(JSON.stringify({
  ok: true,
  source: reference.sha256,
  clearFrames: [reference.clearFrameStart, reference.clearFrameEnd],
  topology: `${reference.latitudeRows}x${reference.longitudeColumns}`,
  particleCount: reference.particleCount,
  colors: [reference.shadowColorHex, reference.coreColorHex, reference.highlightColorHex],
  sphereBreathHz: reference.sphereBreathFrequencyHz
}) + '\n');
