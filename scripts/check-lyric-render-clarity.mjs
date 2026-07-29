import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'web', 'index.html'), 'utf8');

const checks = [];

function check(name, condition, detail) {
  checks.push({ name, ok: Boolean(condition), detail });
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleBodies(selector) {
  const pattern = new RegExp(`${escapeRegex(selector)}\\s*\\{([^{}]*)\\}`, 'g');
  return Array.from(css.matchAll(pattern), (match) => match[1]);
}

function anyRule(selector, predicate) {
  return ruleBodies(selector).some(predicate);
}

const lyricCanvasDraw = /(?:lyric|subtitle)[\s\S]{0,120}\.(?:fillText|strokeText)\s*\(|\.(?:fillText|strokeText)\s*\([^)]*(?:lyric|subtitle)/i;
check(
  'scene lyrics remain DOM text instead of a low-resolution canvas bitmap',
  /<span[^>]+id="playbackLyricText"/.test(html)
    && /<div[^>]+id="playbackLyricSubtitle"/.test(html)
    && !lyricCanvasDraw.test(app),
  'Primary and translated lyrics must stay as DOM text; a future Canvas path needs DPR-sized backing storage.'
);

check(
  'the lyric scene exposes a layout/raster scale',
  anyRule('.playback-lyric-scene', (body) => /--lyric-raster-scale\s*:\s*1\s*;/.test(body)),
  'Missing --lyric-raster-scale; transform-only enlargement reuses a low-resolution compositor texture.'
);

check(
  'single-line lyric zoom changes layout rasterization instead of magnifying a cached texture',
  anyRule('.playback-lyric-rig', (body) => /zoom\s*:\s*var\(--lyric-raster-scale/.test(body))
    && ruleBodies('.playback-lyric-rig')
      .every((body) => !/scale\s*\(\s*var\(--text-preset-scale\)/.test(body)),
  'The main lyric rig still scales --text-preset-scale inside transform.'
);

check(
  'multi-row lyric zoom changes layout rasterization instead of magnifying a cached texture',
  anyRule('.multi-row-lyric-stage', (body) => /zoom\s*:\s*var\(--lyric-raster-scale/.test(body))
    && ruleBodies('.multi-row-lyric-stage')
      .every((body) => !/scale\s*\(\s*var\(--text-preset-scale\)/.test(body)),
  'The multi-row lyric stage still scales --text-preset-scale inside transform.'
);

check(
  'Sonic camera zoom stays independent from the user lyric raster scale',
  /function\s+updateLyricRasterScale\s*\([^)]*\)\s*\{[\s\S]{0,900}--lyric-raster-scale[\s\S]{0,900}\}/.test(app)
    && /const\s+cameraScale\s*=\s*isSonicTopographyPreset\(\)[\s\S]{0,180}\?\s*1[\s\S]{0,180}:\s*clamp\(state\.playbackVisual\.zoom/.test(app)
    && (
      /\(cameraScale\s*\*\s*userScale\)\.toFixed\(3\)/.test(app)
      || (
        /const\s+rasterScale\s*=\s*cameraScale\s*\*\s*userScale/.test(app)
        && /rasterScale\.toFixed\(3\)/.test(app)
        && /lastLyricRasterScale/.test(app)
      )
    )
    && /updateLyricRasterScale\(\)/.test(app),
  'Sonic camera zoom is still entering --lyric-raster-scale, or user lyric zoom no longer triggers layout rasterization.'
);

check(
  'audio pulse scale no longer includes the large camera zoom',
  /const\s+scale\s*=\s*1\s*\+\s*visual\.lyricPulse/.test(app)
    && !/const\s+scale\s*=\s*\(1\s*\+\s*visual\.lyricPulse[\s\S]{0,180}\)\s*\*\s*zoom\s*;/.test(app),
  'Camera zoom is still multiplied into the continuously transformed lyric compositor layer.'
);

check(
  'persistent lyric compositor hints are explicitly disabled',
  /\/\*\s*High-resolution lyric raster contract\.[\s\S]{0,1800}will-change\s*:\s*auto\s*!important\s*;/.test(css),
  'Long-lived will-change: transform/filter pins lyric text to an old raster resolution.'
);

check(
  'high precision text rasterization is requested for scene lyrics',
  /\/\*\s*High-resolution lyric raster contract\.[\s\S]{0,1800}text-rendering\s*:\s*geometricPrecision\s*;/.test(css),
  'The lyric scene does not request geometric precision text rendering.'
);

check(
  'semantic blur for unplayed multi-row lyrics is preserved',
  anyRule('.multi-row-lyric-line.is-future', (body) => /filter\s*:\s*blur\(/.test(body)),
  'Do not remove the intentional future/unplayed lyric blur while fixing raster blur.'
);

const failures = checks.filter((item) => !item.ok);
for (const item of checks) {
  console.log(`${item.ok ? 'PASS' : 'FAIL'} ${item.name}`);
  if (!item.ok) console.log(`  ${item.detail}`);
}

if (failures.length) {
  console.error(`\nLyric clarity contract failed: ${failures.length}/${checks.length}`);
  process.exit(1);
}

console.log(`\nLyric clarity contract passed: ${checks.length}/${checks.length}`);
