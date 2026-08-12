import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync('web/pet-assistant.css', 'utf8');
const liveSection = css.slice(css.lastIndexOf('/* LIVE PARTICLE PRESENCE'));

const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = liveSection.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
};

const idle = rule('#petAssistant #petAssistantParticleOrb');
const live = rule('#petAssistant[data-live-conversation="active"] #petAssistantParticleOrb');

assert.match(idle, /background(?:-color)?:\s*transparent\s*!important/,
  'idle particle canvas must remain transparent');
assert.match(idle, /brightness\(1\.04\)/,
  'idle particles need a restrained clarity lift above the shader output');
assert.doesNotMatch(idle, /contrast\(/,
  'CSS contrast must not re-quantize the analytic pearl edge');
assert.doesNotMatch(idle, /drop-shadow\(/,
  'idle clarity must come from each point sprite, not a whole-canvas blur');
assert.match(idle, /filter\s+6[0-9]{2}ms ease-out/,
  'leaving realtime must settle with a soft ease-out filter transition');
assert.match(idle, /opacity\s+4[0-9]{2}ms ease-out/,
  'idle opacity must settle gently after realtime');

assert.match(live, /filter\s+2[0-4][0-9]ms cubic-bezier\(\.22, 1, \.36, 1\)/,
  'realtime glow must enter faster than it exits');
assert.doesNotMatch(live, /drop-shadow\(/,
  'realtime highlight must preserve gaps instead of merging particles with CSS shadows');

assert.doesNotMatch(css,
  /#petAssistant(?:\[[^\]]+\])?\s+#petAssistantParticleOrb::(?:before|after)/,
  'particle glow must not add a pseudo-element backing disc or hit area');
assert.match(css,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?#petAssistant #petAssistantParticleOrb[\s\S]*?transition-duration:\s*\.001ms\s*!important/,
  'reduced-motion must suppress the decorative transition');
assert.match(css,
  /@media\s*\(forced-colors:\s*active\)[\s\S]*?#petAssistant #petAssistantParticleOrb[\s\S]*?filter:\s*none\s*!important/,
  'forced-colors must remove non-semantic glow filters');

console.log(JSON.stringify({
  ok: true,
  idle: 'brightness 1.04 / analytic shader-local pearl aura / 680ms ease-out',
  live: 'shader-local highlight / 220ms fast entrance',
  backingDisc: false
}, null, 2));
