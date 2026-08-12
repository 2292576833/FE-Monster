import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const css = fs.readFileSync(path.join(root, 'web', 'styles.css'), 'utf8');
const fixturePath = path.join(root, 'scripts', 'fixtures', 'multirow-lyric-visual-polish.html');
const edgeCandidates = [
  process.env.EDGE_PATH,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
].filter(Boolean);
const edgePath = edgeCandidates.find((candidate) => fs.existsSync(candidate));
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function ruleBodies(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Array.from(css.matchAll(new RegExp(`${escaped}\\s*\\{([^{}]*)\\}`, 'g')), (match) => match[1]);
}

const lineSeparators = ruleBodies('.multi-row-lyric-line::after');
assert(
  lineSeparators.some((body) => /content\s*:\s*none\s*!important/.test(body)
    && /display\s*:\s*none\s*!important/.test(body)),
  'multi-row lyrics must explicitly remove the horizontal row separator'
);

const glyphRule = ruleBodies('.multi-row-lyric-main,\n.multi-row-lyric-translation');
assert(
  glyphRule.some((body) => /min-inline-size\s*:\s*0/.test(body)
    && /max-inline-size\s*:\s*100%/.test(body)
    && /overflow\s*:\s*hidden/.test(body)
    && /text-overflow\s*:\s*clip/.test(body)),
  'long multi-row glyph boxes need explicit single-row bounds so adjacent rows cannot mix'
);
assert(
  glyphRule.some((body) => /font-synthesis\s*:\s*none/.test(body)),
  'multi-row glyphs must disable synthetic bold/italic to remain precise while scaled and rotated'
);

const lineRules = ruleBodies('.multi-row-lyric-line');
assert(
  lineRules.some((body) => /-webkit-font-smoothing\s*:\s*antialiased/.test(body)
    && /text-rendering\s*:\s*geometricPrecision/.test(body)),
  'multi-row rows need an explicit high-resolution font raster policy at the final cascade layer'
);
assert(
  /\[data-multi-lyric-stage="true"\][\s\S]{0,1800}background\s*:\s*none\s*!important/.test(css),
  'the visual polish must retain the panel-free multi-row stage'
);

function decodeHtml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

if (!edgePath) {
  failures.push('Microsoft Edge is required for real-browser multi-DPI lyric validation');
} else {
  const fixtureUrl = pathToFileURL(fixturePath).href;
  for (const dpr of [1, 1.25, 1.5, 2]) {
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-multirow-edge-'));
    const result = spawnSync(edgePath, [
      '--headless=new',
      '--no-first-run',
      '--disable-extensions',
      '--hide-scrollbars',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=1500',
      `--force-device-scale-factor=${dpr}`,
      '--window-size=1600,900',
      `--user-data-dir=${profile}`,
      '--dump-dom',
      fixtureUrl
    ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000 });
    fs.rmSync(profile, { recursive: true, force: true });
    assert(result.status === 0, `Edge fixture failed at DPR ${dpr}: ${result.stderr || result.error || 'unknown error'}`);
    const match = result.stdout?.match(/<pre id="result">([\s\S]*?)<\/pre>/);
    assert(match, `Edge fixture did not emit metrics at DPR ${dpr}`);
    if (!match) continue;
    const metrics = JSON.parse(decodeHtml(match[1]));
    assert(Math.abs(metrics.dpr - dpr) < 0.02, `browser DPR mismatch: wanted ${dpr}, got ${metrics.dpr}`);
    assert(metrics.sceneOpacity === 1 && metrics.sceneVisibility === 'visible', `browser fixture is not visibly painted at DPR ${dpr}`);
    assert(!metrics.hasOverlap, `multi-row line boxes overlap at DPR ${dpr}`);
    assert(metrics.overflows.length === 0, `long lyric text overflows at DPR ${dpr}: ${metrics.overflows.join(' | ')}`);
    assert(metrics.currentCenterDelta < 2, `current lyric left the visual centre at DPR ${dpr}`);
    assert(metrics.fontSizes[0] > metrics.fontSizes[1] && metrics.fontSizes[1] > metrics.fontSizes[2], `font-size hierarchy collapsed at DPR ${dpr}`);
    assert(metrics.opacities[0] > metrics.opacities[1] && metrics.opacities[1] > metrics.opacities[2], `opacity hierarchy collapsed at DPR ${dpr}`);
    assert(metrics.stageBackground === 'rgba(0, 0, 0, 0)' && metrics.listBackground === 'rgba(0, 0, 0, 0)', `a multi-row panel reappeared at DPR ${dpr}`);
    assert(metrics.stageBackdrop === 'none' && metrics.listBackdrop === 'none', `backdrop blur reappeared at DPR ${dpr}`);
    assert(metrics.separatorContent === 'none', `row separator is still visible at DPR ${dpr}`);
    assert(metrics.fontSynthesis === 'none', `synthetic glyph styling is active at DPR ${dpr}`);
    assert(metrics.textRendering === 'geometricprecision', `geometric text rendering is inactive at DPR ${dpr}`);
    assert(Math.abs(metrics.layoutZoom - 2.5) < 0.01, `multi-row layout zoom is not re-rasterized at 2.5x on DPR ${dpr}`);
    assert(['hidden', 'clip'].includes(metrics.overflowX), `long lyric row boundary is not enforced at DPR ${dpr}`);
    assert(metrics.angle !== 'none', `multi-row angle was lost at DPR ${dpr}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`);
  console.error(`\nMulti-row visual polish failed: ${failures.length}`);
  process.exit(1);
}

console.log('PASS multi-row visual polish: static contract and Edge DPR 1/1.25/1.5/2');
