import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const cssPath = path.join(root, 'web', 'lyric-render-quality.css');
const appPath = path.join(root, 'web', 'app.js');
const indexPath = path.join(root, 'web', 'index.html');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8') : '';
const app = fs.readFileSync(appPath, 'utf8');
const index = fs.readFileSync(indexPath, 'utf8');

function ruleBodies(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, 'g')), (match) => match[1]);
}

assert(
  /lyric-render-quality\.css\?v=/.test(index),
  'the shared high-DPI lyric quality layer is not loaded after the main stylesheet'
);
assert(
  /\.fe-lyric-crisp-text[\s\S]*?text-rendering\s*:\s*geometricPrecision/.test(css)
    && /paint-order\s*:\s*stroke fill/.test(css)
    && /font-synthesis\s*:\s*none/.test(css),
  'single-row, multi-row and playback-card lyrics do not share one crisp glyph contract'
);
assert(
  /\.playback-lyric-scene:not\(\.is-book-text\)[\s\S]*?--fe-lyric-edge-width/.test(css)
    && /\.multi-row-lyric-main/.test(css)
    && /\.playback-lyric-layer/.test(css),
  'the high-zoom glyph contour is not applied to both single-row and multi-row lyrics'
);
assert(
  /#qishuiPlaybackPhone[\s\S]*?transform\s*:\s*none\s*!important/.test(css),
  'the playback-card text is still painted through a persistent 3D transform'
);
assert(
  /#qishuiPlaybackLyricPage[\s\S]*?scale\(/.test(css) === false,
  'playback-card lyric rows are still compositor-scaled instead of laid out at their final font size'
);
assert(
  ruleBodies('.qishui-playback-card').some((body) => (
    /transition\s*:/.test(body) && !/\bwidth\b/.test(body)
  )),
  'the playback card still animates width and forces lyric layout on every animation frame'
);
assert(
  /function\s+animateQishuiPlaybackExpansion\s*\(/.test(app)
    && /\.animate\s*\(\s*\[[\s\S]{0,900}transform/.test(app)
    && /setQishuiPlaybackExpanded[\s\S]{0,600}getBoundingClientRect\(\)/.test(app),
  'expand/collapse does not use a compositor-only FLIP transition from the old visible bounds'
);
assert(
  /prefers-reduced-motion:\s*reduce[\s\S]*?qishui-playback/.test(css),
  'playback expansion has no reduced-motion fallback'
);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\nHigh-zoom lyric quality contract failed: ${failures.length}`);
  process.exit(1);
}

console.log('PASS high-zoom lyric quality and transform-only playback expansion contract');
