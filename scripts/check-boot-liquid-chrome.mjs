import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const boot = read('web/boot-lightfall-react.js');
const loader = read('web/client-runtime-loader.js');
const styles = read('web/styles.css');
const index = read('web/index.html');

assert.doesNotMatch(
  boot,
  /(?:from\s*['"]https?:\/\/|import\s*\(\s*['"]https?:\/\/|esm\.sh)/u,
  'the installed boot background must not need a runtime CDN'
);
assert.doesNotMatch(boot, /(?:from\s*['"]react(?:-dom)?|createRoot\s*\(|useEffect\s*\(|useRef\s*\()/u,
  'the registry shader must be adapted to the existing static ESM runtime instead of adding a second React runtime');

for (const contract of [
  /uniform\s+float\s+uTime/u,
  /uniform\s+vec3\s+uBaseColor/u,
  /uniform\s+float\s+uAmplitude/u,
  /uniform\s+float\s+uFrequencyX/u,
  /uniform\s+float\s+uFrequencyY/u,
  /for\s*\(\s*float\s+i\s*=\s*1\.0\s*;\s*i\s*<\s*10\.0/u,
  /falloff\s*=\s*exp\s*\(\s*-dist\s*\*\s*20\.0/u,
  /ripple\s*=\s*sin\s*\(\s*10\.0\s*\*\s*dist\s*-\s*uTime\s*\*\s*2\.0/u,
  /gl_FragColor/u
]) {
  assert.match(boot, contract, `LiquidChrome shader contract is missing: ${contract}`);
}

assert.match(boot, /getContext\(\s*['"]webgl2['"]/u,
  'LiquidChrome must render locally through a real WebGL canvas');
assert.match(boot, /powerPreference:\s*['"]high-performance['"]/u);
assert.match(boot, /antialias:\s*false/u,
  'the fullscreen boot shader must keep multisampling bounded');
assert.match(boot, /BOOT_TARGET_FPS\s*=\s*60/u);
assert.match(boot, /frameCarryRef\.current\s*=\s*Math\.min/u);
assert.match(boot, /frameCarryRef\.current\s*%=\s*BOOT_FRAME_BUDGET_MS/u);

assert.match(boot, /matchMedia\(\s*['"]\(prefers-reduced-motion:\s*reduce\)['"]\s*\)/u);
assert.match(boot, /visibilitychange/u);
assert.match(boot, /ResizeObserver/u);
assert.match(boot, /fe-lightfall-ready/u);
assert.match(boot, /fe-lightfall-stop/u);
assert.match(boot, /WEBGL_lose_context/u);
assert.match(boot, /deleteProgram/u);
assert.match(boot, /deleteBuffer/u);

assert.match(boot, /window\.FeMonsterBootLiquidChrome/u,
  'the boot-only renderer needs a public diagnostic/lifecycle seam');
assert.match(boot, /bootBackground\s*=\s*['"]liquid-chrome['"]/u);
assert.doesNotMatch(boot, /sonic|pet-assistant|pet-particle|companion/iu,
  'LiquidChrome must remain isolated to the boot surface');

assert.match(index, /id="bootLightfallMount"/u);
assert.match(index, /id="bootLogoButton"/u);
assert.match(index, /id="bootLogoText">FE moster</u);
assert.match(styles, /\.boot-logo-text::before/u);
assert.match(styles, /\.boot-logo-text::after/u);
assert.match(styles, /@keyframes\s+bootCharReveal/u);
assert.match(styles, /@keyframes\s+bootGloss/u);
assert.match(styles, /@keyframes\s+bootPinkScan/u);

assert.match(loader, /boot-lightfall-react\.js\?v=[^'"\s)]+/u,
  'the dynamic import must use the LiquidChrome cache key');
assert.match(index, /client-runtime-loader\.js\?v=[^"\s]+/u,
  'the loader itself must be cache-busted so installed clients receive the new import');
assert.match(index, /styles\.css\?v=[^"\s]+/u,
  'boot material CSS must be cache-busted');

console.log('boot LiquidChrome offline, isolation, lifecycle, reduced-motion, and preserved-logo contracts PASS');
