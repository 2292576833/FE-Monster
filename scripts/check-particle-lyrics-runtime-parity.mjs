import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let chromium;
for (const p of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(p)); break; } catch {}
}
assert(chromium);
const output = path.join(root, 'output/particle-lyrics-performance');
const baseline = path.join(output, 'runtime-before.js');
assert(existsSync(baseline), 'Run the performance baseline first to preserve its runtime snapshot');
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.setContent('<style>.host{position:absolute;width:720px;height:450px;left:0;top:0}</style><div id="before" class="host"></div><div id="after" class="host"></div>');
  for (const file of ['web/vendor/three.r128.min.js', 'web/particle-lyrics-settings.js']) await page.addScriptTag({ content: readFileSync(path.join(root, file), 'utf8') });
  await page.addScriptTag({ content: readFileSync(baseline, 'utf8') });
  await page.evaluate(() => { window.beforeApi = FeParticleLyricsRuntime; });
  await page.addScriptTag({ content: readFileSync(path.join(root, 'web/particle-lyrics-runtime.js'), 'utf8') });
  const result = await page.evaluate(() => {
    const fakeRenderer = () => ({ domElement: document.createElement('canvas'), setClearColor() {}, setPixelRatio() {}, setSize() {}, setRenderTarget() {}, clear() {}, render() {}, dispose() {}, forceContextLoss() {} });
    const previous = beforeApi.create(document.getElementById('before'), { pixelRatio: 1, createRenderer: fakeRenderer });
    const current = FeParticleLyricsRuntime.create(document.getElementById('after'), { pixelRatio: 1, createRenderer: fakeRenderer });
    const metric = { frames: 0, maxPositionDelta: 0, maxTrailDelta: 0, maxDataDelta: 0, countsEqual: true, clocksEqual: true, cueEqual: true, shaderEqual: previous.material.vertexShader === current.material.vertexShader && previous.material.fragmentShader === current.material.fragmentShader };
    const frame = { now: 1000, playing: false, hasLyric: false, text: '', lyricKey: 'parity', lineStart: 0, lineEnd: 16, audioTime: 0, bass: 0.35, beat: 0.2 };
    const configure = patch => {
      beforeApi.setSettings(previous, { ...previous.settings, ...patch });
      FeParticleLyricsRuntime.setSettings(current, { ...current.settings, ...patch });
    };
    const update = patch => {
      Object.assign(frame, patch); frame.now += 1000 / 60;
      beforeApi.update(previous, frame); FeParticleLyricsRuntime.update(current, frame);
      metric.frames += 1;
      metric.countsEqual &&= previous.count === current.count && previous.activeCount === current.activeCount && previous.geometry.drawRange.count === current.geometry.drawRange.count;
      metric.clocksEqual &&= previous.clock === current.clock && previous.audioTime === current.audioTime;
      metric.cueEqual &&= previous.activeGlyph === current.activeGlyph && previous.timingExact === current.timingExact;
      const count = previous.geometry.drawRange.count;
      for (let i = 0; i < count * 3; i += 1) metric.maxPositionDelta = Math.max(metric.maxPositionDelta, Math.abs(previous.positions[i] - current.positions[i]));
      for (let i = 0; i < count * 4; i += 1) metric.maxDataDelta = Math.max(metric.maxDataDelta, Math.abs(previous.data[i] - current.data[i]));
      for (let i = 0; i < count * 18; i += 1) metric.maxTrailDelta = Math.max(metric.maxTrailDelta, Math.abs(previous.trailPositions[i] - current.trailPositions[i]));
    };
    for (const shape of ['circle', 'square', 'star', 'spot', 'snowflake', 'note']) {
      for (const idle of Object.keys(FeParticleLyricsSettings.idlePresets)) {
        configure({ shape, idle }); update({}); update({});
      }
    }
    for (const aggregation of ['vortex', 'corners', 'burst', 'breathe', 'rain', 'curve', 'spiral', 'direct']) {
      configure({ presentation: 'line', aggregation });
      for (let i = 0; i < 65; i += 1) update({ playing: true, hasLyric: true, text: `星光${aggregation}`, lyricKey: aggregation });
    }
    for (const presentation of ['sung', 'progressive']) {
      configure({ presentation, aggregation: 'vortex' });
      const timings = [{ char: '星', start: 0, end: 1 }, { char: '光', start: 2, end: 3 }];
      for (const audioTime of [0.02, 0.06, 0.5, 1.5, 2.04, 2.3, 2.04, 0.06]) {
        update({ playing: true, text: '星光', lyricKey: presentation, glyphTimings: timings, audioTime });
        update({ playing: false }); update({ playing: false });
      }
      timings[0].start = -0.5; update({ audioTime: 0.06 });
      update({ reducedMotion: true }); update({ reducedMotion: false, playing: true });
    }
    beforeApi.dispose(previous); FeParticleLyricsRuntime.dispose(current);
    metric.cacheReleased = current.random === null && current.idleTrig === null && current.cueCache === null;
    return metric;
  });
  assert(result.countsEqual && result.clocksEqual && result.cueEqual && result.shaderEqual && result.cacheReleased);
  assert(result.maxPositionDelta < 0.0001, `Position drift ${result.maxPositionDelta}`);
  assert(result.maxTrailDelta < 0.0002, `Trail drift ${result.maxTrailDelta}`);
  assert.equal(result.maxDataDelta, 0);
  mkdirSync(output, { recursive: true }); writeFileSync(path.join(output, 'parity.json'), JSON.stringify(result, null, 2));
  console.log('Baseline/runtime parity:', JSON.stringify(result));
} finally { if (browser) await browser.close(); }
