import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('web/pet-particle-orb.js', 'utf8');
const vertex = source.match(/function\s+vertexShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';
const fragment = source.match(/function\s+fragmentShader\s*\(\s*\)\s*\{\s*return\s*`([\s\S]*?)`;\s*\}/)?.[1] || '';

assert.match(source, /root\.dataset\.liveConversation\s*===\s*['"]active['"]/,
  'the orb must derive realtime glow from the canonical live-conversation state');
assert.match(source, /['"]data-live-conversation['"]/,
  'live-conversation changes must be observed without polling');
assert.match(source, /FeMonsterPetEmotionRuntime\?\.snapshot\?\.\(\)/,
  'the initial emotion snapshot must seed the particle palette');
assert.match(source, /addEventListener\(['"]fe-monster-pet-emotion-change['"],\s*onEmotionChanged\)/,
  'emotion changes must update the target palette immediately');
assert.match(source, /removeEventListener\(['"]fe-monster-pet-emotion-change['"],\s*onEmotionChanged\)/,
  'the emotion listener must be released with the particle runtime');
assert.match(source, /data(?:set)?\.petMood|dataset\.petMood/,
  'the resolved mood must be exposed on the pet root for the outer glow');
assert.match(source, /--pet-particle-emotion-rgb/,
  'the Canvas palette must expose a matching CSS color token');

assert.match(source, /EMOTION_COLOR_TIME_CONSTANT_MS\s*=\s*900/,
  'emotion colors need a visible, stable smoothing time constant');
assert.match(source, /1\s*-\s*Math\.exp\([^;]*EMOTION_COLOR_TIME_CONSTANT_MS/,
  'emotion color changes must use frame-rate-independent exponential smoothing');
assert.match(source, /emotionColor\[channel\]\s*\+=/,
  'the three shared color channels must be smoothed once per frame, not per particle');
assert.doesNotMatch(source, /hue-rotate|Math\.random\(\).*emotion|uHueCycle/,
  'emotion color must use a restrained fixed palette rather than an RGB cycle');

for (const uniform of ['uLiveGlow', 'uLivePulse', 'uEmotionEnergy']) {
  assert.match(vertex, new RegExp(`uniform\\s+float\\s+${uniform}\\s*;`),
    `${uniform} must drive the single GPU point surface`);
}
for (const uniform of ['uMoodR', 'uMoodG', 'uMoodB', 'uMoodMix', 'uLiveGlow', 'uLivePulse']) {
  assert.match(fragment, new RegExp(`uniform\\s+float\\s+${uniform}\\s*;`),
    `${uniform} must participate in particle shading`);
}
assert.match(fragment, /float\s+liveOuterAura\b/,
  'realtime particles need a finite outer aura inside each point sprite');
assert.match(fragment, /float\s+liveInnerCore\b/,
  'realtime particles need a separate bright inner layer');
assert.match(fragment, /pearlWhite\s*\*\s*core\s*\*\s*uLiveGlow/,
  'the particle core must remain white and legible at every mood');
assert.match(fragment, /moodTint[\s\S]*liveTint/,
  'emotion color should tint the body and realtime aura without replacing the white core');

assert.equal((source.match(/new\s+THREE\.Points\s*\(/g) || []).length, 1,
  'realtime glow must remain in the existing one-draw-call Points surface');
assert.equal((source.match(/renderer\.render\s*\(/g) || []).length, 1,
  'realtime glow must not add a second scene render');
assert.doesNotMatch(source, /shadowBlur|AdditiveBlending|UnrealBloomPass|EffectComposer/,
  'glow must not introduce per-particle CPU shadows or fullscreen bloom');
assert.match(source, /live:\s*runtime\.liveConversationActive[\s\S]*liveGlow:[\s\S]*mood:[\s\S]*emotionColor:/,
  'status() must expose live glow and smoothed emotion color for black-box QA');

process.stdout.write('Desktop pet realtime glow and emotion-color contract passed.\n');
