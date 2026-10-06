import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

// Isolated UI + in-memory HTTP boundary only: no application bootstrap, accounts,
// audio element, audio device or native activation. Optional live data is GET-only
// and is replayed here; browser mutations can never reach the live service.
const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const output = path.join(root, 'output/playwright/audio-mixer-preset-compat');
mkdirSync(output, { recursive: true });
const legacyLogic = process.argv.includes('--legacy-exact-count');
const staticCatalog = process.argv.includes('--legacy-static-catalog');
let uiSource = readFileSync(path.join(webRoot, 'audio-mixer-ui.js'), 'utf8');
if (legacyLogic) {
  assert.ok(uiSource.includes('if (received.size === 0)'), 'legacy RED replay requires the compatibility fix');
  uiSource = uiSource.replace('if (received.size === 0)', 'if (received.size !== PRESET_IDENTITIES.length)');
}
if (staticCatalog) {
  const refreshPair = /refreshChannelRouter\(\),\s+refreshPresetCatalog\(\)/;
  assert.ok(refreshPair.test(uiSource), 'static-catalog RED replay requires catalog refresh');
  uiSource = uiSource.replace(refreshPair, 'refreshChannelRouter()');
}
const identities = [
  ['clean', '纯净'], ['bathroom', '浴室'], ['hall', '大厅'], ['surround-3d', '3D环绕'],
  ['cinema', '影院'], ['vocal-clear', '人声清晰'], ['bass-boost', '低频增强'], ['night', '夜间'],
  ['wide-chorus', '宽阔合唱'], ['classic-flanger', '经典镶边'], ['flowing-phaser', '流动移相'],
  ['ping-pong-delay', '乒乓回声'], ['nearfield-studio', '近场工作室'], ['immersive-live', '沉浸现场']
];
function parameters() {
  return {
    enabled: true, inputGainDb: 0, outputGainDb: 0, balance: 0, eqDb: Array(10).fill(0),
    stereoWidth: 1, centerGain: 1, surroundGain: 1, lfeGain: 1,
    compressorEnabled: false, compressorThresholdDb: -18, compressorRatio: 2, compressorAttackMs: 10,
    compressorReleaseMs: 150, compressorKneeDb: 6, compressorMakeupDb: 0,
    limiterEnabled: true, limiterCeilingDb: -0.3, limiterReleaseMs: 100,
    reverbEnabled: false, reverbRoomSize: 0.35, reverbDecayMs: 800, reverbDamping: 0.5,
    reverbPreDelayMs: 12, reverbWet: 0, reverbDry: 1,
    upmixEnabled: false, upmixAlgorithm: 'matrix-decode', upmixOutputLayout: '5.1', upmixCenterWidthHz: 300,
    upmixLfeCrossoverHz: 120, upmixCenterGain: 0.707, upmixSurroundGain: 0.5, upmixLfeGain: 0.707, upmixDecorrelation: 0.7,
    obrEnabled: false, obrFilterProfile: 'direct', obrWet: 1, obrDry: 0, obrOutputGainDb: 0, obrSpatialWidth: 1,
    chorusEnabled: false, chorusRateHz: 0.3, chorusDepth: 0.35, chorusCenterDelayMs: 18, chorusFeedback: 0, chorusMix: 0,
    flangerEnabled: false, flangerRateHz: 0.18, flangerDepth: 0.5, flangerCenterDelayMs: 1.5, flangerFeedback: 0.35, flangerMix: 0,
    phaserEnabled: false, phaserRateHz: 0.2, phaserDepth: 0.5, phaserCenterFrequencyHz: 900, phaserFeedback: 0.2, phaserMix: 0,
    delayEnabled: false, delayMs: 320, delayFeedback: 0.3, delayPingPong: 0.75, delayDampingHz: 8000, delayMix: 0,
    earlyReflectionsEnabled: false, earlyReflectionsRoomSize: 0.35, earlyReflectionsDiffusion: 0.55,
    earlyReflectionsDamping: 0.45, earlyReflectionsMix: 0
  };
}
function fixture(current = false) {
  return {
    snapshot: {
      ok: true, version: 1, presetVersion: 1, revision: 12, selectedPreset: 'clean', configState: 'ready',
      parameters: parameters(), nativeBackendAvailable: true, nativeChainActive: false,
      mixerAvailable: true, mixerActive: false, bypassReason: 'pipeline-inactive', playbackState: 'browser-compatible'
    },
    catalog: { ok: true, presetVersion: 1, presets: [
      ...identities.map(([id, label]) => ({ id, label, parameters: { ...parameters(), ...(id === 'hall' ? { reverbEnabled: true, reverbWet: 0.36 } : {}) } })),
      ...(current ? [{ id: 'clear-spatial', label: '清晰空间', parameters: { ...parameters(), stereoWidth: 1.12 } }] : [])
    ] },
    channels: {
      revision: 7, layout: '5.1', algorithm: 'matrix-decode', channelOrder: ['FL', 'FR', 'FC', 'LFE', 'SL', 'SR'],
      channelGainDb: Array(8).fill(0), channelDelayMs: Array(8).fill(0), channelAzimuthDeg: Array(8).fill(0),
      customMatrix: Array(16).fill(0), lfeCrossoverHz: 120, controlAvailable: true,
      configState: 'ready', nativeBackendAvailable: true, nativeChainActive: false
    }
  };
}
const liveReads = [];
const liveIndex = process.argv.indexOf('--live-readonly-url');
let liveFixture;
if (liveIndex >= 0) {
  const live = new URL(process.argv[liveIndex + 1]);
  assert.equal(live.protocol, 'http:');
  assert.equal(live.hostname, '127.0.0.1', 'only an explicitly supplied loopback backend is allowed');
  assert.ok(!live.username && !live.password && live.pathname === '/' && !live.search && !live.hash);
  const read = async endpoint => {
    const response = await fetch(new URL(endpoint, live.origin), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Origin: live.origin, 'Sec-Fetch-Site': 'same-origin' }
    });
    assert.equal(response.status, 200, endpoint);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; assert.ok(bytes <= 512 * 1024, 'live fixture exceeds 512 KiB'); chunks.push(chunk);
    }
    liveReads.push({ method: 'GET', endpoint, status: response.status, bytes });
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  };
  const [snapshot, catalog, channels] = await Promise.all([
    read('/api/audio/mixer'), read('/api/audio/mixer/presets'), read('/api/audio/mixer/channels')
  ]);
  liveFixture = { snapshot, catalog, channels };
}
const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="icon" href="data:,"><link rel="stylesheet" href="/styles.css"><style>
body{display:block!important;margin:0!important;min-height:100vh;height:auto!important;overflow:auto!important;background:#0b101c!important;color:#dce5f5;font-family:system-ui}
main{width:min(960px,calc(100% - 32px));margin:24px auto}h1{font-size:20px}.fixture-note{font-size:12px;color:#9aa9c1}
</style><main><h1>调音台 · 预设兼容回归</h1><p class="fixture-note">独立测试夹具，不连接真实播放或用户账户。</p><button id="refresh-fixture">夹具：刷新接口状态</button><div id="mixer"></div></main>
<script src="/audio-mixer-ui.js"></script><script>
window.fixtureMixer=FeAudioMixerUi.mount(document.querySelector('#mixer'),{familyLayoutStorage:{getItem:()=>null,setItem:()=>{}}});
window.refreshCompletion=0;document.querySelector('#refresh-fixture').onclick=async()=>{await fixtureMixer.refresh();await fixtureMixer.settled();refreshCompletion++;};
</script></html>`;
let current;
let requests = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const send = (type, value, status = 200) => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(value); };
  const json = value => send('application/json; charset=utf-8', JSON.stringify(value));
  if (url.pathname === '/') return send('text/html; charset=utf-8', html);
  if (url.pathname === '/audio-mixer-ui.js') return send('text/javascript; charset=utf-8', uiSource);
  if (url.pathname === '/styles.css') return send('text/css; charset=utf-8', readFileSync(path.join(webRoot, 'styles.css')));
  let bytes = 0; const chunks = [];
  for await (const part of req) { bytes += part.length; if (bytes > 65536) return send('text/plain', 'oversize', 413); chunks.push(part); }
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null;
  requests.push({ method: req.method, path: url.pathname, body });
  if (req.method === 'GET' && url.pathname === '/api/audio/mixer') return json(current.snapshot);
  if (req.method === 'GET' && url.pathname === '/api/audio/mixer/presets') return json(current.catalog);
  if (req.method === 'GET' && url.pathname === '/api/audio/mixer/channels') return json(current.channels);
  const match = /^\/api\/audio\/mixer\/presets\/([a-z0-9-]+)\/apply$/.exec(url.pathname);
  if ((req.method === 'POST' && match) || (req.method === 'PATCH' && url.pathname === '/api/audio/mixer')) {
    assert.equal(body.expectedRevision, current.snapshot.revision, 'mutation must use the latest fixture revision');
    const preset = match && current.catalog.presets.find(entry => entry.id === match[1]);
    if (match) assert.ok(preset, 'unadvertised presets must never be applied');
    current.snapshot = { ...current.snapshot, revision: current.snapshot.revision + 1,
      selectedPreset: preset ? preset.id : 'custom',
      parameters: preset ? structuredClone(preset.parameters) : { ...current.snapshot.parameters, ...body.parameters }
    };
    return json(current.snapshot);
  }
  send('text/plain', 'Not found', 404);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const require = createRequire(import.meta.url);
let chromium;
for (const name of ['playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
  try { ({ chromium } = require(name)); break; } catch {}
}
assert.ok(chromium, 'bundled Playwright runtime is required');
const results = [];
let browser;
async function check(name, data, expected = 'ready', { readonly = false, refreshCatalog = false } = {}) {
  current = structuredClone(data); requests = [];
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } });
  const consoleErrors = [], warnings = [], externalRequests = [];
  page.setDefaultTimeout(7000);
  page.on('pageerror', error => consoleErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); if (message.type() === 'warning') warnings.push(message.text()); });
  await page.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    externalRequests.push(route.request().url()); return route.abort();
  });
  const result = { name, expected, consoleErrors, warnings, externalRequests };
  results.push(result);
  try {
    await page.goto(origin);
    await page.waitForFunction(() => window.fixtureMixer?.snapshot().ready !== 'loading');
    result.initial = await page.evaluate(() => fixtureMixer.snapshot());
    result.disabledPresets = await page.locator('[data-mixer-preset-id]:disabled').evaluateAll(nodes => nodes.map(node => node.dataset.mixerPresetId));
    result.disabledParameters = await page.locator('[data-mixer-param]:disabled').count();
    result.screenshot = path.join(output, `${name}.png`);
    await page.screenshot({ path: result.screenshot, fullPage: true });
    assert.equal(result.initial.ready, expected, `${name}: mixer readiness`);
    if (expected === 'error') {
      assert.equal(result.disabledPresets.length, 15);
      assert.equal(result.disabledParameters, await page.locator('[data-mixer-param]').count());
      assert.ok(result.initial.status.includes('读取调音台失败'));
    } else {
      assert.deepEqual(result.disabledPresets, data.catalog.presets.some(preset => preset.id === 'clear-spatial') ? [] : ['clear-spatial']);
      assert.equal(result.disabledParameters, 0, 'all mixer parameter controls remain available');
      if (!readonly && !refreshCatalog) {
        for (const presetId of ['hall', ...(data.catalog.presets.some(preset => preset.id === 'clear-spatial') ? ['clear-spatial'] : [])]) {
          await page.click(`[data-mixer-preset-id="${presetId}"]`);
          await page.waitForFunction(id => fixtureMixer.snapshot().selectedPreset === id && !fixtureMixer.snapshot().busy, presetId);
          assert.equal(current.snapshot.selectedPreset, presetId);
        }
        await page.click('[data-mixer-view-button="professional"]');
        const parameter = page.locator('input[data-mixer-param="inputGainDb"]');
        await parameter.focus(); await parameter.press('ArrowRight');
        await page.waitForFunction(() => fixtureMixer.snapshot().selectedPreset === 'custom' && !fixtureMixer.snapshot().busy && fixtureMixer.snapshot().pendingKeys.length === 0);
        assert.equal(current.snapshot.parameters.inputGainDb, 0.1);
        assert.equal(requests.filter(request => request.method === 'PATCH').length, 1);
        result.parameterValue = current.snapshot.parameters.inputGainDb;
        // The redesigned daily/spatial/professional tabs are part of the real UI.
        for (const view of ['daily', 'spatial', 'professional']) {
          await page.click(`[data-mixer-view-button="${view}"]`);
          assert.equal(await page.locator('[data-mixer-view]').getAttribute('data-mixer-view'), view);
        }
      }
      if (refreshCatalog) {
        const invalid = fixture().catalog; invalid.presets[0].parameters.eqDb = [0];
        const steps = [
          { name: 'upgrade-15', catalog: fixture(true).catalog, disabled: [] },
          { name: 'downgrade-14', catalog: fixture().catalog, disabled: ['clear-spatial'] },
          { name: 'invalid-after-ready', catalog: invalid, disabled: 15 },
          { name: 'recover-15', catalog: fixture(true).catalog, disabled: [] }
        ];
        result.refreshes = [];
        for (const [index, step] of steps.entries()) {
          current.catalog = structuredClone(step.catalog);
          await page.click('#refresh-fixture');
          await page.waitForFunction(count => refreshCompletion === count, index + 1);
          const disabled = await page.locator('[data-mixer-preset-id]:disabled').evaluateAll(nodes => nodes.map(node => node.dataset.mixerPresetId));
          assert.equal(await page.evaluate(() => fixtureMixer.snapshot().ready), 'ready');
          assert.equal(await page.locator('[data-mixer-param]:disabled').count(), 0, `${step.name}: parameters stay available`);
          if (Array.isArray(step.disabled)) assert.deepEqual(disabled, step.disabled, step.name);
          else assert.equal(disabled.length, step.disabled, step.name);
          const observation = { name: step.name, disabledPresets: disabled, status: await page.evaluate(() => fixtureMixer.snapshot().status) };
          result.refreshes.push(observation);
          if (step.name === 'invalid-after-ready') {
            assert.ok(observation.status.includes('调音参数仍可使用'));
            observation.screenshot = path.join(output, 'invalid-after-ready-parameters-usable.png');
            await page.screenshot({ path: observation.screenshot, fullPage: true });
            await page.click('[data-mixer-view-button="professional"]');
            const input = page.locator('input[data-mixer-param="inputGainDb"]');
            await input.focus(); await input.press('ArrowRight');
            await page.waitForFunction(() => fixtureMixer.snapshot().selectedPreset === 'custom' && !fixtureMixer.snapshot().busy && fixtureMixer.snapshot().pendingKeys.length === 0);
            assert.equal(current.snapshot.parameters.inputGainDb, 0.1, 'invalid refreshed catalog does not disable parameter PATCH');
            assert.equal(requests.filter(request => request.method === 'POST').length, 0, 'invalid refreshed catalog cannot post presets');
            await page.click('[data-mixer-view-button="daily"]');
          }
        }
        await page.click('[data-mixer-preset-id="clear-spatial"]');
        await page.waitForFunction(() => fixtureMixer.snapshot().selectedPreset === 'clear-spatial' && !fixtureMixer.snapshot().busy);
        assert.equal(current.snapshot.selectedPreset, 'clear-spatial', 'recovered catalog can apply restored preset');
      }
    }
    if (expected === 'error' || readonly) assert.ok(requests.every(request => request.method === 'GET'), 'read-only/error UI must not mutate');
    assert.deepEqual(consoleErrors, []); assert.deepEqual(warnings, []); assert.deepEqual(externalRequests, []);
    result.requests = structuredClone(requests); result.pass = true;
  } catch (error) { result.error = error.message; result.pass = false; throw error; }
  finally { await page.close(); }
}
try {
  const executablePath = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(!existsSync(chromium.executablePath()) ? { executablePath } : {}) });
  if (staticCatalog) await check('red-static-catalog', fixture(), 'ready', { refreshCatalog: true });
  else await check(legacyLogic ? 'red-old-exact-count-14' : 'legacy-14-ready', fixture());
  if (!legacyLogic && !staticCatalog) {
    await check('current-15-ready', fixture(true));
    await check('catalog-refresh-roundtrip', fixture(), 'ready', { refreshCatalog: true });
    const invalidSnapshot = fixture(); delete invalidSnapshot.snapshot.parameters.outputGainDb;
    await check('invalid-snapshot-parameter', invalidSnapshot, 'error');
    const invalidPreset = fixture(); invalidPreset.catalog.presets[0].parameters.eqDb = [0];
    await check('invalid-preset-parameter', invalidPreset, 'error');
    const invalidVersion = fixture(); invalidVersion.catalog.presetVersion = 2;
    await check('invalid-catalog-version', invalidVersion, 'error');
    const empty = fixture(); empty.catalog.presets = [];
    await check('empty-catalog', empty, 'error');
    if (liveFixture) await check('live-readonly-replay', liveFixture, 'ready', { readonly: true });
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  const report = { legacyLogic, staticCatalog, liveReads, results, pass: results.length > 0 && results.every(result => result.pass) };
  const reportPath = path.join(output, legacyLogic ? 'red-report.json' : staticCatalog ? 'red-refresh-report.json' : 'report.json');
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ legacyLogic, staticCatalog, liveReads, results: results.map(result => ({
    name: result.name, ready: result.initial?.ready, disabledPresets: result.disabledPresets,
    disabledParameters: result.disabledParameters, consoleErrors: result.consoleErrors, warnings: result.warnings,
    refreshes: result.refreshes, screenshot: result.screenshot, error: result.error, pass: result.pass
  })), pass: report.pass, reportPath }, null, 2));
}
