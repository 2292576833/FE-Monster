import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Optional local before/after comparison: LYRIC_HIGHLIGHT_BASELINE=/path/to/before.js.
// No private media or saved baseline is required for the standalone regression checks.
const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
let chromium;
for (const location of ['playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { ({ chromium } = require(location)); break; } catch {}
}
if (!chromium) throw new Error('Playwright is required for the isolated particle benchmark');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
const outputDir = path.join(root, 'output/lyric-highlight-performance');
mkdirSync(outputDir, { recursive: true });
const candidate = readFileSync(path.join(root, 'web/lyric-highlight-particles.js'), 'utf8');
const baselinePath = process.env.LYRIC_HIGHLIGHT_BASELINE;
const sources = baselinePath ? { baseline: readFileSync(path.resolve(baselinePath), 'utf8'), candidate } : { candidate };
const browser = await chromium.launch({ executablePath: edge, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 700 }, deviceScaleFactor: 2 });
  page.on('pageerror', error => errors.push(String(error)));
  await page.setContent('<style>body{margin:0;background:#050710}#host{width:700px;height:240px;position:relative}#target{position:absolute;left:220px;top:90px;font:40px monospace;color:white}canvas{position:absolute}</style><div id="host"><span id="target">LYRICS</span></div>');
  await page.addScriptTag({ path: path.join(root, 'web/vendor/three.r128.min.js') });
  const results = {};
  for (let round = 0; round < 3; round += 1) {
    const names = Object.keys(sources);
    if (round % 2) names.reverse();
    for (const name of names) {
      await page.addScriptTag({ content: sources[name] });
      const result = await page.evaluate(() => {
        const host = document.getElementById('host');
        const target = document.getElementById('target');
        const canvas = document.createElement('canvas');
        let renderer, geometry, attributes;
        let uploadBytes = 0, uploadCalls = 0, sizeCalls = 0, ratioCalls = 0;
        let drawCalls = 0;
        const runtime = FeMonsterLyricHighlightParticles.create({ canvas, maxPixelRatio: 2, createRenderer(options) {
          renderer = new THREE.WebGLRenderer(options);
          const gl = renderer.getContext();
          const subData = gl.bufferSubData.bind(gl);
          gl.bufferSubData = (target, offset, data, sourceOffset, count) => {
            uploadCalls += 1;
            uploadBytes += count === undefined ? data.byteLength : count * data.BYTES_PER_ELEMENT;
            return sourceOffset === undefined ? subData(target, offset, data) : subData(target, offset, data, sourceOffset, count);
          };
          const setSize = renderer.setSize.bind(renderer), setRatio = renderer.setPixelRatio.bind(renderer);
          renderer.setSize = (...args) => { sizeCalls += 1; return setSize(...args); };
          renderer.setPixelRatio = (...args) => { ratioCalls += 1; return setRatio(...args); };
          const render = renderer.render.bind(renderer);
          renderer.render = (scene, camera) => {
            geometry = scene.children[0].geometry;
            attributes = geometry.attributes;
            drawCalls += 1;
            return render(scene, camera);
          };
          return renderer;
        } });
        runtime.setTarget(target, host);
        const hash = (values) => {
          let value = 2166136261;
          const bytes = new Uint8Array(values.buffer, values.byteOffset, values.byteLength);
          for (const byte of bytes) value = Math.imul(value ^ byte, 16777619) >>> 0;
          return value;
        };
        const snapshot = () => {
          const count = runtime.diagnostics().activeCount;
          const gl = renderer.getContext();
          const pixels = new Uint8Array(canvas.width * canvas.height * 4);
          gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          return { count, emitted: runtime.diagnostics().emittedTotal,
            attributes: Object.fromEntries(Object.entries(attributes).map(([key, attr]) => [key, hash(attr.array.subarray(0, count * attr.itemSize))])),
            pixels: hash(pixels) };
        };
        const sample = (frames, low, active, dirty = false) => {
          renderer.getContext().finish();
          const before = { uploadBytes, uploadCalls, sizeCalls, ratioCalls, drawCalls };
          const started = performance.now();
          for (let frame = 0; frame < frames; frame += 1) {
            if (dirty) runtime.markBoundsDirty();
            runtime.update(low, 1000 / 60, active);
          }
          const cpuMs = performance.now() - started;
          renderer.getContext().finish();
          const counters = { uploadBytes, uploadCalls, sizeCalls, ratioCalls, drawCalls };
          return { frames, cpuMs, perFrameMs: cpuMs / frames,
            ...Object.fromEntries(Object.entries(counters).map(([key, value]) => [key, value - before[key]])),
            ...snapshot() };
        };
        for (let frame = 0; frame < 90; frame += 1) runtime.update(.92, 1000 / 60, true);
        const active = sample(180, .92, true);
        const repeatedBounds = sample(45, .92, true, true);
        const release = sample(100, 0, false);
        const versions = Object.values(attributes).map(attr => attr.version);
        const idle = sample(20000, 0, false);
        idle.attributeVersionChanges = Object.values(attributes).reduce((sum, attr, index) => sum + attr.version - versions[index], 0);
        const resume = sample(60, .07, true);
        const shortWidth = canvas.width;
        target.textContent = 'LYRICS LONGER';
        runtime.markBoundsDirty();
        const resized = sample(20, .72, true);
        const longWidth = canvas.width;
        target.textContent = 'LYRICS';
        runtime.markBoundsDirty();
        runtime.clear();
        const restart = sample(60, .92, true);
        const restoredWidth = canvas.width;
        const beforeDestroy = { width: canvas.width, height: canvas.height };
        runtime.destroy();
        const afterDestroy = { width: canvas.width, height: canvas.height, geometryCount: renderer.info.memory.geometries };
        canvas.remove();
        return { active, repeatedBounds, release, idle, resume, resized, restart, shortWidth, longWidth, restoredWidth, beforeDestroy, afterDestroy };
      });
      (results[name] ||= []).push(result);
    }
  }
  assert.deepEqual(errors, [], 'isolated renderer must produce no browser errors');
  for (const runs of Object.values(results)) {
    for (const run of runs) {
      assert.ok(run.active.count > 0 && run.resume.count > 0, 'both strong and weak bass retain particles');
      assert.equal(run.idle.count, 0, 'inactive particles finish fading');
      assert.equal(run.idle.drawCalls, 0, 'fully inactive renderer does not draw');
      assert.equal(run.afterDestroy.geometryCount, 0, 'destroy releases GPU geometry');
      assert.ok(run.longWidth > run.shortWidth, 'a longer lyric must still enlarge the canvas');
      assert.equal(run.restoredWidth, run.shortWidth, 'shorter lyrics restore the tight canvas after clear');
    }
  }
  for (const run of results.candidate) {
    assert.ok(run.active.uploadBytes < 2000000, 'active uploads must remain bounded to live attribute ranges');
    assert.ok(run.resume.uploadBytes < 40000, 'weak bass must not upload the unused particle pool');
    assert.equal(run.repeatedBounds.sizeCalls, 0, 'unchanged bounds must not reallocate the canvas');
    assert.equal(run.repeatedBounds.ratioCalls, 0, 'unchanged DPR must not reallocate the canvas');
    assert.equal(run.idle.attributeVersionChanges, 0, 'idle frames must not dirty GPU attributes');
    assert.equal(run.afterDestroy.width * run.afterDestroy.height, 1, 'destroy must release the retained DOM canvas backing store');
  }
  if (results.baseline) {
    for (let round = 0; round < results.candidate.length; round += 1) {
      for (const stage of ['active', 'repeatedBounds', 'release', 'idle', 'resume', 'resized', 'restart']) {
        const before = results.baseline[round][stage], after = results.candidate[round][stage];
        for (const key of ['count', 'emitted', 'attributes', 'pixels']) {
          assert.deepEqual(after[key], before[key], `${stage} ${key}: optimization must preserve the exact particle output`);
        }
      }
    }
  }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const summary = Object.fromEntries(Object.entries(results).map(([name, runs]) => [name,
    Object.fromEntries(['active', 'repeatedBounds', 'release', 'idle', 'resume'].map(stage => [stage,
      Object.fromEntries(['perFrameMs', 'uploadBytes', 'uploadCalls', 'sizeCalls', 'ratioCalls', 'drawCalls', 'attributeVersionChanges'].filter(key => key in runs[0][stage]).map(key => [key, median(runs.map(run => run[stage][key]))]))
    ]))
  ]));
  const report = { browser: await browser.version(), renderer: 'Three.js r128; Edge headless SwiftShader; DPR 2; balanced 78% density', timing: 'CPU submission time; GPU finish is outside the timed sample', rounds: 3, summary, results, errors };
  writeFileSync(path.join(outputDir, baselinePath ? 'comparison.json' : 'candidate-measurement.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ pass: true, summary, teardown: Object.fromEntries(Object.entries(results).map(([name, runs]) => [name, runs[0].afterDestroy])) }, null, 2));
} finally {
  await browser.close();
}
