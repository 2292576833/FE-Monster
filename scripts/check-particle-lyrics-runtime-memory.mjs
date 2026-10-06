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
const label = process.argv.find(arg => arg.startsWith('--label='))?.slice(8) || 'memory-after';
const sourceFile = process.argv.find(arg => arg.startsWith('--source='))?.slice(9) || 'web/particle-lyrics-runtime.js';
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' } : {}), args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setContent('<style>html,body{margin:0;width:100%;height:100%}#host{position:absolute;inset:0}</style><div id="host"></div>');
  for (const file of ['web/vendor/three.r128.min.js', 'web/particle-lyrics-settings.js', sourceFile]) await page.addScriptTag({ content: readFileSync(path.resolve(root, file), 'utf8') });
  const result = await page.evaluate(() => {
    window.api = FeParticleLyricsRuntime;
    window.runtime = api.create(document.getElementById('host'), { pixelRatio: 1, settings: { bloomStrength: 0 } });
    window.frame = { now: 1000, playing: true, hasLyric: true, text: '星光聚成回声', lyricKey: 'memory', lineStart: 0, lineEnd: 10, audioTime: 2, bass: 0, beat: 0, reducedMotion: true };
    window.step = () => { frame.now += 1000 / 60; api.update(runtime, frame); };
    window.configure = patch => api.setSettings(runtime, { ...runtime.settings, ...patch });
    window.snapshot = () => ({
      textures: runtime.renderer.info.memory.textures,
      sizes: [runtime.bloom.full, runtime.bloom.a, runtime.bloom.b].map(target => [target.width, target.height]),
      rgbaTextureBytes: runtime.renderer.info.memory.textures ? [runtime.bloom.full, runtime.bloom.a, runtime.bloom.b].reduce((sum, target) => sum + target.width * target.height * 4, 0) : 0,
      canvas: [runtime.renderer.domElement.width, runtime.renderer.domElement.height],
      canvasRgbaBytes: runtime.renderer.domElement.width * runtime.renderer.domElement.height * 4
    });
    window.pixels = () => { const gl = runtime.renderer.getContext(); const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4); gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data); return data; };
    window.difference = (a, b) => { let changed = 0, maximum = 0; for (let i = 0; i < a.length; i += 1) { if (a[i] !== b[i]) changed += 1; maximum = Math.max(maximum, Math.abs(a[i] - b[i])); } return { changed, maximum, sameLength: a.length === b.length }; };
    step(); const coldDisabled = snapshot();
    configure({ bloomStrength: 0.55 }); step();
    const enabled = snapshot(), originalPixels = pixels();
    configure({ bloomStrength: 0 }); step(); const disabledAfterUse = snapshot();
    configure({ bloomStrength: 0.55 }); step();
    const reenabled = snapshot(), togglePixelDifference = difference(originalPixels, pixels());
    configure({ bloomStrength: 0 }); step();
    runtime.host.style.width = '960px'; runtime.host.style.height = '640px';
    return { coldDisabled, enabled, disabledAfterUse, reenabled, togglePixelDifference };
  });
  await page.waitForFunction(() => runtime.width === 960 && runtime.height === 640);
  Object.assign(result, await page.evaluate(() => {
    api.resize(runtime, 1.5); step(); const disabledResized = snapshot();
    configure({ bloomStrength: 0.55 }); step(); const resizedEnabled = snapshot();
    window.resizedPixels = pixels();
    configure({ bloomStrength: 0 }); step(); configure({ bloomStrength: 0.55 }); step();
    return { disabledResized, resizedEnabled, resizedToggleDifference: difference(resizedPixels, pixels()) };
  }));
  await page.evaluate(() => runtime.renderer.forceContextLoss());
  await page.waitForFunction(() => runtime.contextLost === true);
  await page.waitForTimeout(150);
  await page.evaluate(() => runtime.renderer.forceContextRestore());
  await page.waitForFunction(() => runtime.contextLost === false);
  Object.assign(result, await page.evaluate(() => {
    step(); const restored = snapshot(), contextRestoreDifference = difference(resizedPixels, pixels());
    const surface = runtime.renderer.domElement;
    api.dispose(runtime);
    return { restored, contextRestoreDifference, disposed: { canvas: [surface.width, surface.height], canvasRgbaBytes: surface.width * surface.height * 4, connected: surface.isConnected, textures: runtime.renderer.info.memory.textures, geometries: runtime.renderer.info.memory.geometries } };
  }));
  assert.equal(result.coldDisabled.textures, 0, 'Cold disabled bloom never allocates GPU textures');
  assert.equal(result.enabled.textures, 3);
  assert.equal(result.enabled.rgbaTextureBytes, 5832000);
  assert.equal(result.reenabled.rgbaTextureBytes, result.enabled.rgbaTextureBytes);
  assert.deepEqual(result.resizedEnabled.sizes, [[1440, 960], [360, 240], [360, 240]]);
  for (const key of ['togglePixelDifference', 'resizedToggleDifference', 'contextRestoreDifference']) assert.deepEqual(result[key], { changed: 0, maximum: 0, sameLength: true }, key);
  if (!label.includes('before')) {
    assert.equal(result.disabledAfterUse.textures, 0, 'Disabling used bloom deletes its GPU textures');
    assert.deepEqual(result.disabledAfterUse.sizes, [[1, 1], [1, 1], [1, 1]]);
    assert.equal(result.disabledResized.textures, 0, 'Resizing while disabled keeps bloom unallocated');
    assert.deepEqual(result.disabledResized.sizes, [[1, 1], [1, 1], [1, 1]]);
    assert.deepEqual(result.disposed.canvas, [1, 1]);
  }
  assert.equal(result.disposed.textures, 0); assert.equal(result.disposed.geometries, 0); assert.equal(result.disposed.connected, false);
  assert.deepEqual(errors, []);
  const output = path.join(root, 'output/particle-lyrics-performance'); mkdirSync(output, { recursive: true });
  writeFileSync(path.join(output, `${label}.json`), JSON.stringify({ label, browser: await browser.version(), ...result, errors }, null, 2));
  console.log(label, JSON.stringify(result));
} finally { if (browser) await browser.close(); }
