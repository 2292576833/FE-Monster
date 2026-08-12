import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssPath = path.join(root, 'web', 'pet-assistant.css');
const css = readFileSync(cssPath, 'utf8');
const glassLayerStart = css.lastIndexOf('/* PET WHITE PANEL SURFACE */');

assert.ok(glassLayerStart >= 0,
  'pet assistant is missing the final flat white panel design layer');

const glass = css.slice(glassLayerStart);

assert.match(glass,
  /--pet-glass-surface:\s*rgba\(255,\s*255,\s*255,\s*\.10\)/,
  'outer white panel surface must use the requested 10% opacity');
assert.match(glass,
  /--pet-button-surface:\s*rgba\(0,\s*0,\s*0,\s*\.20\)/,
  'button surface must be exactly 20% translucent black');
assert.match(glass,
  /\.pet-assistant__panel\s*,[\s\S]*?\{[\s\S]*?background:\s*var\(--pet-glass-surface\);[\s\S]*?box-shadow:\s*none;[\s\S]*?backdrop-filter:\s*none/,
  'main chat panel is not a flat white surface without glass blur');
assert.match(glass,
  /\.pet-assistant__panel\s*,[\s\S]*?\{[\s\S]*?border-radius:\s*28px/,
  'chat glass radius must match the native 28 DIP desktop region');
assert.match(glass,
  /html\[data-fe-client="desktop-pet"\][\s\S]*?\.pet-assistant__panel\s*\{[\s\S]*?background:[\s\S]*?var\(--pet-glass-surface\)/,
  'desktop chat panel does not share the flat white surface');
assert.doesNotMatch(glass,
  /\.pet-assistant__panel\s*,[\s\S]*?\{[^}]*background:[^;]*(?:gradient|rgba\(63,\s*68,\s*78)/,
  'outer chat panel reintroduced a gradient or opaque fallback material');

assert.match(glass,
  /\.pet-assistant__voice-disclosure\s*\{/,
  'collapsible voice disclosure has no surface styling');
assert.match(glass,
  /\.pet-assistant__voice-summary(?::[\w-]+)?\s*\{/,
  'collapsible voice summary has no interaction styling');
assert.match(glass,
  /\.pet-assistant__voice-options\s*\{/,
  'collapsible voice options have no layout styling');

assert.match(glass,
  /\.pet-assistant[^\{]*button[\s\S]*?background:\s*var\(--pet-button-surface\)\s*!important/,
  'pet buttons do not share the 20% black material');
assert.match(glass, /button:hover[\s\S]*?--pet-button-surface-hover/,
  'button hover state is missing');
assert.match(glass, /button:focus-visible[\s\S]*?outline:/,
  'button keyboard focus state is missing');
assert.match(glass, /button:active[\s\S]*?--pet-button-surface-active/,
  'button pressed state is missing');
assert.match(glass, /button:disabled[\s\S]*?cursor:\s*not-allowed/,
  'button disabled state is missing');

assert.doesNotMatch(glass,
  /html\[data-fe-client="desktop-pet"\][\s\S]*?\.pet-assistant__panel\s*\{[^}]*background(?:-color)?:\s*(?:#0{3,6}|black|rgba?\(0,\s*0,\s*0)/,
  'desktop chat panel reintroduced a black backing surface');
assert.match(glass,
  /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?transition-duration:\s*\.001ms\s*!important/,
  'glass interactions have no reduced-motion fallback');

process.stdout.write(JSON.stringify({
  ok: true,
  css: path.relative(root, cssPath),
  flatWhitePanel: true,
  surfaceAlpha: 0.1,
  buttonAlpha: 0.2,
  desktopSafe: true
}, null, 2) + '\n');
