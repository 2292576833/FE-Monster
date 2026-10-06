import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert(chromium, 'Playwright is required');
const output = path.join(root, 'output/particle-lyrics-performance');
mkdirSync(output, { recursive: true });
const baselineFile = path.join(output, 'runtime-before.js');
if (!existsSync(baselineFile)) copyFileSync(path.join(root, 'web/particle-lyrics-runtime.js'), baselineFile);
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || 'before';
const sourceFile = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
const source = readFileSync(sourceFile || (label === 'before' ? baselineFile : path.join(root, 'web/particle-lyrics-runtime.js')), 'utf8');
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/particle-lyrics-runtime.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(source); return; }
  const file = pathname === '/' ? path.join(root, 'scripts/fixtures/particle-lyrics.html') : path.join(root, 'web', pathname);
  if (!file.startsWith(root) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.html') ? 'text/html; charset=utf-8' : file.endsWith('.css') ? 'text/css' : 'application/javascript');
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}), args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--enable-precise-memory-info'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.runtime);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapBefore = await cdp.send('Runtime.getHeapUsage');
  await page.evaluate(() => {
    window.perfFrame = { now: 1000, playing: true, hasLyric: true, text: '让星光落在你的眼里听见宇宙的回声', lyricKey: 'perf', lineStart: 0, lineEnd: 20, audioTime: 6.2, displayTime: 6.2, bass: 0.4, beat: 0.15 };
    window.perfUpdate = (count, cpuOnly) => {
      const render = runtime.renderer.render;
      if (cpuOnly) runtime.renderer.render = () => {};
      const times = [];
      try {
        for (let i = 0; i < count; i += 1) {
          perfFrame.now += 1000 / 60;
          const start = performance.now(); api.update(runtime, perfFrame); times.push(performance.now() - start);
        }
      } finally { runtime.renderer.render = render; }
      return times;
    };
    const gl = runtime.renderer.getContext();
    window.uploadBytes = 0; window.uploadCalls = 0;
    const subData = gl.bufferSubData.bind(gl);
    gl.bufferSubData = (...args) => { uploadBytes += args.length >= 5 ? args[4] * args[2].BYTES_PER_ELEMENT : args[2]?.byteLength || 0; uploadCalls += 1; return subData(...args); };
  });
  const scenarios = [
    { name: 'idle', settings: { presentation: 'line', idle: 'floatRotate' }, frame: { playing: false, hasLyric: false, text: '' } },
    { name: 'settled-line', settings: { presentation: 'line', idle: 'floatRotate' }, frame: { playing: true, hasLyric: true, text: '让星光落在你的眼里听见宇宙的回声' } },
    { name: 'sung-flight', settings: { presentation: 'sung', aggregation: 'vortex' }, frame: { playing: true, hasLyric: true, text: '让星光落在你的眼里', audioTime: 0.05, glyphTimings: [{ char: '让', start: 0, end: 1 }, { char: '星光', start: 1, end: 3 }, { char: '落在你的眼里', start: 3, end: 10 }] } },
    { name: 'progressive-flight', settings: { presentation: 'progressive', aggregation: 'spiral' }, frame: { playing: true, hasLyric: true, text: '让星光落在你的眼里听见宇宙的回声', audioTime: 6.05, glyphTimings: Array.from('让星光落在你的眼里听见宇宙的回声', (char, i) => ({ char, start: i, end: i + 1 })) } }
  ];
  const results = [];
  for (const scenario of scenarios) {
    await page.evaluate(item => { configure({ ...settingsApi.defaults, ...item.settings }); Object.assign(perfFrame, { glyphTimings: [], audioTime: 6.2, displayTime: 6.2 }, item.frame); perfUpdate(100, true); }, scenario);
    const batches = [];
    for (let batch = 0; batch < 5; batch += 1) {
      const times = await page.evaluate(() => perfUpdate(180, true));
      batches.push(times.reduce((a, b) => a + b, 0) / times.length);
    }
    await page.evaluate(() => { perfUpdate(5, false); uploadBytes = 0; uploadCalls = 0; });
    const rendered = await page.evaluate(() => { const times = perfUpdate(45, false); return { averageMs: times.reduce((a, b) => a + b, 0) / times.length, uploadBytesPerFrame: uploadBytes / 45, uploadCallsPerFrame: uploadCalls / 45, count: runtime.geometry.drawRange.count, assembled: runtime.activeCount }; });
    const sorted = [...batches].sort((a, b) => a - b);
    results.push({ scenario: scenario.name, batchesMs: batches, medianCpuMs: sorted[2], minCpuMs: sorted[0], maxCpuMs: sorted[4], ...rendered });
    console.log(label, scenario.name, JSON.stringify(results.at(-1)));
  }
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
  await cdp.send('Profiler.start');
  await page.evaluate(() => perfUpdate(300, true));
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(path.join(output, `${label}.cpuprofile`), JSON.stringify(profile));
  const counts = new Map();
  for (const sample of profile.samples || []) counts.set(sample, (counts.get(sample) || 0) + 1);
  const hot = profile.nodes.map(node => ({ function: node.callFrame.functionName, line: node.callFrame.lineNumber + 1, samples: counts.get(node.id) || 0 })).sort((a, b) => b.samples - a.samples).slice(0, 15);
  await cdp.send('HeapProfiler.collectGarbage');
  const heapAfter = await cdp.send('Runtime.getHeapUsage');
  const resizeProbe = await page.evaluate(() => {
    const read = runtime.host.getBoundingClientRect.bind(runtime.host);
    let reads = 0;
    runtime.host.getBoundingClientRect = () => { reads += 1; return read(); };
    for (let i = 0; i < 240; i += 1) api.resize(runtime, 1);
    const steadyReads = reads;
    runtime.host.style.width = '960px'; runtime.host.style.height = '640px';
    return { steadyReads };
  });
  await page.waitForFunction(() => runtime.width === 960 && runtime.height === 640);
  Object.assign(resizeProbe, await page.evaluate(() => {
    api.resize(runtime, 1.5); perfUpdate(1, true);
    return { width: runtime.width, height: runtime.height, pixelRatio: runtime.pixelRatio, bloomWidth: runtime.bloom.full.width, bloomHeight: runtime.bloom.full.height, viewWidth: runtime.viewWidth, hitBoxWidth: parseFloat(runtime.interaction.style.width), finite: api.diagnostics(runtime).finite };
  }));
  assert.equal(resizeProbe.bloomWidth, 1440); assert.equal(resizeProbe.bloomHeight, 960);
  assert.equal(resizeProbe.viewWidth, 1350); assert(resizeProbe.hitBoxWidth > 0 && resizeProbe.finite);
  const result = { label, browser: await browser.version(), viewport: '1440x900 DPR1', fixedBudget: '100 warmup; 5x180 CPU frames; 5 warmup + 45 rendered frames per scenario', results, heapBefore, heapAfter, resizeProbe, hot, errors };
  writeFileSync(path.join(output, `${label}.json`), JSON.stringify(result, null, 2));
  assert.deepEqual(errors, []);
  console.log('hot', JSON.stringify(hot));
} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
