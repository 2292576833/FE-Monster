import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output', 'playwright', 'harmonic-cards');
const require = createRequire(import.meta.url);
let chromium;
for (const module of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(module)); break; } catch {}
}
assert.ok(chromium, 'Playwright must be installed');
mkdirSync(output, { recursive: true });
const scripts = ['vendor/three.r128.min.js', 'harmonic-state-settings.js', 'harmonic-orbital-core.js', 'harmonic-orbital-atmosphere.js', 'harmonic-state-runtime.js'];
const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#020907}#host{width:1440px;height:900px}canvas{display:block;width:100%;height:100%}</style><div id="host"></div>${scripts.map(src => `<script src="/web/${src}"></script>`).join('')}`;
const server = createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html); return; }
  if (!scripts.some(file => pathname === '/web/' + file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', 'application/javascript');
  response.end(readFileSync(path.join(root, pathname)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const errors = [];
try {
  const fallback = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) && fallback ? { executablePath: fallback } : {}), args: ['--use-angle=d3d11', '--disable-background-timer-throttling'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const initial = await page.evaluate(() => {
    const api = window.FeHarmonicStateRuntime, settings = window.FeHarmonicSettings;
    let runtime, reflectionTarget, now = 1000;
    const passes = [], draws = [], textDraws = [];
    runtime = api.create(document.getElementById('host'), {
      THREE, pixelRatio: 1,
      createRenderer(options) {
        const renderer = new THREE.WebGLRenderer({ ...options, preserveDrawingBuffer: true });
        const render = renderer.render;
        renderer.render = function(scene, camera) {
          const target = this.getRenderTarget();
          if (target?.texture.name === 'HarmonicWaterReflection') reflectionTarget = target;
          passes.push({ target: target === runtime?.backdrop ? 'backdrop' : target?.texture.name === 'HarmonicWaterReflection' ? 'reflection' : 'main', galleryVisible: runtime?.gallery.visible });
          return render.call(this, scene, camera);
        };
        return renderer;
      }
    });
    runtime.cards.forEach((card, index) => {
      const context = card.canvas.getContext('2d'), fillText = context.fillText;
      context.fillText = function(text, ...args) {
        textDraws.push({ index, text: String(text) });
        return fillText.call(this, text, ...args);
      };
      card.mesh.onBeforeRender = renderer => {
        const target = renderer.getRenderTarget();
        draws.push(target?.texture.name === 'HarmonicWaterReflection' ? 'reflection' : target === runtime.backdrop ? 'backdrop' : 'main');
      };
    });
    let frame = { playing: false, reducedMotion: true, zoom: 2.35, pixelRatio: 1, songKey: 'cards-fixture', lyricKey: 'first',
      lines: { previous: '前一句歌词', current: '第一句正在歌唱', next: '下一句歌词' }, lyricFraction: .2 };
    const tick = (changes = {}) => { now += 80; frame = { ...frame, ...changes }; api.update(runtime, { ...frame, now }); };
    const captureReflection = () => {
      const target = reflectionTarget;
      const pixels = new Uint8Array(target.width * target.height * 4);
      runtime.renderer.readRenderTargetPixels(target, 0, 0, target.width, target.height, pixels);
      return pixels;
    };
    const diff = (a, b) => {
      let sum = 0, pixels = 0;
      for (let i = 0; i < a.length; i += 4) {
        const difference = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        sum += difference; if (difference > 12) pixels++;
      }
      return { sum, pixels };
    };
    const layout = () => runtime.cards.map(card => ({ position: card.mesh.position.toArray(), quaternion: card.mesh.quaternion.toArray(), scale: card.mesh.scale.toArray() }));
    const sceneVisibility = () => ({ core: runtime.orbital.group.visible, towers: runtime.lightTowers.group.visible, atmosphere: runtime.atmosphere.group.visible,
      children: runtime.atmosphere.group.children.map(child => ({ name: child.name, visible: child.visible })) });
    tick();
    const baseline = captureReflection(), initialLayout = layout();
    window.fixture = { api, settings, runtime, tick, passes, draws, textDraws, baseline, captureReflection, diff, layout, initialLayout, sceneVisibility };
    return { defaultEnabled: settings.defaults.lyricCardsEnabled, galleryVisible: runtime.gallery.visible, count: runtime.cards.length,
      reflectionReady: !!reflectionTarget, reflectionDraws: draws.filter(pass => pass === 'reflection').length, backdropPasses: passes.filter(pass => pass.target === 'backdrop').length };
  });
  assert.equal(initial.defaultEnabled, true, 'existing projects retain the seven-card gallery by default');
  assert.equal(initial.galleryVisible, true); assert.equal(initial.count, 7);
  assert.ok(initial.reflectionReady && initial.reflectionDraws > 0 && initial.backdropPasses > 0, 'enabled cards are rendered in the main scene and real water reflection');
  await page.screenshot({ path: path.join(output, 'cards-on.png') });

  const hidden = await page.evaluate(() => {
    const { api, settings, runtime, tick, passes, draws, baseline, captureReflection, diff, sceneVisibility } = fixture;
    const before = sceneVisibility(), clockBefore = runtime.visualTime;
    api.setEffects(runtime, { ...settings.defaults, lyricCardsEnabled: false });
    const immediate = runtime.gallery.visible, clockAfter = runtime.visualTime;
    passes.length = 0; draws.length = 0;
    tick();
    return { immediate, clockBefore, clockAfter, before, after: sceneVisibility(), finalVisible: runtime.gallery.visible,
      passes: [...passes], cardDraws: [...draws], reflectionDifference: diff(baseline, captureReflection()) };
  });
  assert.equal(hidden.immediate, false, 'setEffects hides paused cards immediately');
  assert.equal(hidden.finalVisible, false, 'rendering must not restore cards unconditionally');
  assert.equal(hidden.clockAfter, hidden.clockBefore, 'visibility edits never advance animation time');
  assert.deepEqual(hidden.after, hidden.before, 'card visibility leaves the core, pillars, fog and rain untouched');
  assert.equal(hidden.passes.filter(pass => pass.target === 'backdrop').length, 0, 'hidden cards do not incur their refraction capture');
  assert.equal(hidden.cardDraws.length, 0, 'hidden cards contribute no main or reflection draw calls');
  assert.ok(hidden.passes.some(pass => pass.target === 'reflection' && !pass.galleryVisible), 'water reflection captures the scene without cards');
  assert.ok(hidden.reflectionDifference.pixels > 20, `actual card pixels disappear from the reflection: ${JSON.stringify(hidden.reflectionDifference)}`);
  await page.screenshot({ path: path.join(output, 'cards-off.png') });

  const restored = await page.evaluate(() => {
    const { api, settings, runtime, tick, layout, initialLayout } = fixture;
    api.setEffects(runtime, settings.defaults);
    const immediate = runtime.gallery.visible;
    tick();
    return { immediate, layout: layout(), initialLayout, activeText: runtime.cards.find(card => card.data?.active)?.data.text };
  });
  assert.equal(restored.immediate, true, 'setEffects restores paused cards immediately');
  assert.deepEqual(restored.layout, restored.initialLayout, 'toggling alone preserves the existing gallery layout');
  assert.equal(restored.activeText, '第一句正在歌唱');

  const lyricSync = await page.evaluate(() => {
    const { api, settings, runtime, tick, passes, draws, textDraws } = fixture;
    api.setEffects(runtime, { ...settings.defaults, lyricCardsEnabled: false });
    passes.length = 0; draws.length = 0; textDraws.length = 0;
    const hiddenTextureVersionsBefore = runtime.cards.map(card => card.texture.version);
    for (let index = 1; index <= 3; index++) tick({ playing: true, lyricKey: `hidden-${index}`, lyricFraction: index / 4,
      lines: { previous: `过去歌词 ${index - 1}`, current: `隐藏时最新歌词 ${index}`, next: `将来歌词 ${index + 1}` } });
    const hiddenKey = runtime.lastLyricKey, hiddenDraws = draws.length, hiddenBackdropPasses = passes.filter(pass => pass.target === 'backdrop').length;
    const hiddenTextDraws = textDraws.length, hiddenTextureVersionsAfter = runtime.cards.map(card => card.texture.version);
    api.setEffects(runtime, settings.defaults);
    const immediateActive = runtime.cards.find(card => card.data?.active);
    const immediateText = immediateActive?.data.text;
    tick({ playing: false });
    const active = runtime.cards.find(card => card.data?.active);
    return { hiddenKey, hiddenDraws, hiddenBackdropPasses, hiddenTextDraws, hiddenTextureVersionsBefore, hiddenTextureVersionsAfter,
      restoredCanvasText: textDraws.filter(draw => draw.index === runtime.cards.indexOf(active)).map(draw => draw.text),
      immediateText, visibleText: active?.data.text, progress: active?.glassMaterial.uniforms.uProgress.value,
      textures: runtime.cards.map(card => card.texture.version), canvasSize: [active.canvas.width, active.canvas.height] };
  });
  assert.equal(lyricSync.hiddenKey, 'hidden-3');
  assert.equal(lyricSync.hiddenDraws, 0); assert.equal(lyricSync.hiddenBackdropPasses, 0);
  assert.equal(lyricSync.hiddenTextDraws, 0, 'hidden lyric updates do not redraw text canvases');
  assert.deepEqual(lyricSync.hiddenTextureVersionsAfter, lyricSync.hiddenTextureVersionsBefore, 'hidden lyrics do not upload textures');
  assert.equal(lyricSync.immediateText, '隐藏时最新歌词 3', 're-enabling shows the latest hidden lyric immediately');
  assert.equal(lyricSync.visibleText, '隐藏时最新歌词 3'); assert.equal(lyricSync.progress, .75);
  assert.ok(lyricSync.restoredCanvasText.includes('隐藏时最新歌词 3'), 're-enabling paints the latest lyric into the active canvas');
  assert.ok(lyricSync.textures.every(version => version > 0) && lyricSync.canvasSize.every(size => size > 0));

  const resources = await page.evaluate(() => {
    const { api, settings, runtime, tick } = fixture;
    api.setEffects(runtime, settings.defaults); tick();
    const before = { ...runtime.renderer.info.memory }, identities = runtime.cards.map(card => [card.mesh.uuid, card.texture.uuid]);
    for (let index = 0; index < 36; index++) { api.setEffects(runtime, { ...settings.defaults, lyricCardsEnabled: index % 2 === 1 }); tick(); }
    const after = { ...runtime.renderer.info.memory }, finalIdentities = runtime.cards.map(card => [card.mesh.uuid, card.texture.uuid]);
    api.dispose(runtime);
    return { before, after, identities, finalIdentities };
  });
  assert.deepEqual(resources.after, resources.before, 'repeated card toggles retain stable GPU resource counts');
  assert.deepEqual(resources.finalIdentities, resources.identities, 'the switch reuses the original seven meshes and textures');
  assert.deepEqual(errors, [], 'no browser or shader errors');
  const evidence = { initial, hidden, restored, lyricSync, resources };
  writeFileSync(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: true, initial, hidden: { ...hidden, before: undefined, after: undefined }, lyricSync, resources: { before: resources.before, after: resources.after }, output }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
