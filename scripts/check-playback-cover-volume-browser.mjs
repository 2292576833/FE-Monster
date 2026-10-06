import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

// Exercise the real app in an isolated browser against a local player fixture.
const root = path.resolve(import.meta.dirname, '..');
const output = path.join(root, 'output/playwright/playback-cover-volume');
mkdirSync(output, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
const song = { id: 'volume-fixture', title: '山间来信', artist: '音量交互测试', provider: 'netease', cover: 'fixture-cover', duration: 180 };
let backendVolume = .8;
let stateDelay = 0;
let commitDelay = 0;
let activeCommits = 0;
let maxConcurrentCommits = 0;
const commits = [];
const preferenceCommits = [];
let bootstrapPreferences = null;
const fixtures = {
  '/api/music-apis': { ok: true, providers: [] },
  '/api/user-cursors': { ok: true, cursors: [] },
  '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
  '/api/visual-bridge/state': { ok: true, audio: {} },
  '/api/sandbox/presets': { ok: true, presets: [] },
  '/api/sandbox/components': { ok: true, components: [] },
  '/api/community/status': { ok: true, authenticated: false },
  '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
};
// A real, deterministic PCM track drives the existing Web Audio analyser.
// No microphone, remote song, or second audio context is needed by this fixture.
const toneRate = 22050;
const toneSamples = toneRate * 8;
const toneWave = Buffer.alloc(44 + toneSamples * 2);
toneWave.write('RIFF', 0); toneWave.writeUInt32LE(toneWave.length - 8, 4);
toneWave.write('WAVEfmt ', 8); toneWave.writeUInt32LE(16, 16);
toneWave.writeUInt16LE(1, 20); toneWave.writeUInt16LE(1, 22);
toneWave.writeUInt32LE(toneRate, 24); toneWave.writeUInt32LE(toneRate * 2, 28);
toneWave.writeUInt16LE(2, 32); toneWave.writeUInt16LE(16, 34);
toneWave.write('data', 36); toneWave.writeUInt32LE(toneSamples * 2, 40);
for (let index = 0; index < toneSamples; index++) {
  const seconds = index / toneRate;
  const envelope = .05 + .72 * Math.pow(.5 + .5 * Math.sin(seconds * Math.PI * 2), 2);
  const wave = .58 * Math.sin(seconds * Math.PI * 2 * 82)
    + .25 * Math.sin(seconds * Math.PI * 2 * 920)
    + .17 * Math.sin(seconds * Math.PI * 2 * 4100);
  toneWave.writeInt16LE(Math.round(wave * envelope * 32767), 44 + index * 2);
}
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const pathname = decodeURIComponent(url.pathname);
  const json = data => { response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(data)); };
  if (pathname === '/fixture-tone.wav') {
    response.setHeader('Content-Type', 'audio/wav');
    response.setHeader('Content-Length', toneWave.length);
    response.end(toneWave);
    return;
  }
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.setHeader('Content-Type', 'application/javascript');
    response.end(bootstrapPreferences ? `for (const [key, value] of Object.entries(${JSON.stringify(bootstrapPreferences.values)})) localStorage.setItem(key, value);` : '');
    return;
  }
  if (pathname === '/api/app/preferences' && request.method === 'POST') {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => { preferenceCommits.push(JSON.parse(body)); json({ ok: true }); });
    return;
  }
  if (pathname === '/api/player/state') {
    const data = { ok: true, song, volume: backendVolume, playing: false, paused: true, position: 0, duration: 180, queue: [song], queueLength: 1, queueRevision: 1, queueIndex: 0 };
    if (stateDelay) setTimeout(() => json(data), stateDelay); else json(data);
    return;
  }
  if (pathname === '/api/player/volume') {
    const volume = Number(url.searchParams.get('value'));
    maxConcurrentCommits = Math.max(maxConcurrentCommits, ++activeCommits);
    setTimeout(() => { backendVolume = volume; commits.push(volume); activeCommits--; json({ ok: true }); }, commitDelay);
    return;
  }
  if (pathname === '/data/android-bundled-library.json') { json({ playlists: [], songs: [] }); return; }
  if (pathname === '/api/cover') {
    response.setHeader('Content-Type', 'image/svg+xml');
    response.end('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><defs><linearGradient id="sky" x2=".6" y2="1"><stop stop-color="#192f35"/><stop offset="1" stop-color="#dab58b"/></linearGradient></defs><rect width="400" height="400" fill="url(#sky)"/><circle cx="285" cy="110" r="54" fill="#f2d6b0"/><path d="M0 370 80 150 190 310 265 220 400 370V400H0" fill="#203f3c"/><path d="M40 400 211 229 310 400" fill="#6d8376"/></svg>'); return;
  }
  if (pathname.startsWith('/api/')) { json(fixtures[pathname] || { ok: true }); return; }
  const file = path.resolve(pathname.startsWith('/components/') ? root : path.join(root, 'web'), pathname === '/' ? 'index.html' : pathname.slice(1));
  if (!file.startsWith(root + path.sep) || !existsSync(file)) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); response.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const errors = [];
const networkErrors = [];
const layouts = [];
const appearanceChecks = {};
try {
  const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
  const executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH || (!existsSync(chromium.executablePath()) && existsSync(edge) ? edge : undefined);
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--mute-audio', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) networkErrors.push(`${response.status()} ${response.url()}`); });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden && typeof petAssistantSetVolume === 'function');
  await page.evaluate(() => { clearBackgroundPolling(); clearRealtimePolling(); enterPresetPlaybackPage('lyric'); });
  await page.waitForTimeout(250);
  if (process.argv.includes('--baseline')) await page.screenshot({ path: path.join(output, 'before-desktop.png') });

  // Regression: backend zero used to be replaced by the 80% fallback.
  backendVolume = 0;
  await page.evaluate(() => refreshPlayerState());
  assert.equal(await page.locator('#volumeRange').inputValue(), '0', 'restoring 0% must retain silence');
  const range = page.locator('#qishuiPlaybackVolumeRange');
  await range.waitFor({ state: 'visible' });
  const snapshot = () => page.evaluate(() => ({ audio: els.audio.volume, old: els.volumeRange.value, cover: els.qishuiPlaybackVolumeRange.value, oldLabel: els.volumeLabel.textContent, accessibleValue: els.qishuiPlaybackVolumeRange.getAttribute('aria-valuetext') }));
  const assertVolume = async (value, reason) => {
    await page.waitForFunction(value => document.getElementById('qishuiPlaybackVolumeRange').value === String(value), value);
    assert.deepEqual(await snapshot(), { audio: value / 100, old: String(value), cover: String(value), oldLabel: `${value}%`, accessibleValue: `${value}%` }, reason);
  };
  await assertVolume(0, 'backend restoration synchronizes both controls and audio');
  assert.equal(await range.getAttribute('aria-orientation'), 'vertical');
  assert.equal(await page.locator('#qishuiPlaybackVolume svg, #qishuiPlaybackVolume img').count(), 0, 'volume control has no icons');
  assert.equal((await page.locator('#qishuiPlaybackVolume').textContent()).trim(), '', 'edge slider has no visible percentage');
  assert.match(await range.ariaSnapshot(), /slider "音量"/);

  await range.focus();
  await page.keyboard.press('ArrowUp');
  await assertVolume(1, 'native Up key raises volume');
  await page.keyboard.press('End');
  await assertVolume(100, 'native End reaches 100%');
  await page.keyboard.press('ArrowDown');
  await assertVolume(99, 'native Down key lowers volume');
  assert.equal(await range.evaluate(input => getComputedStyle(input).outlineStyle), 'solid', 'keyboard focus remains visible');
  await page.keyboard.press('Home');
  await assertVolume(0, 'native Home reaches silence');
  await page.evaluate(() => petAssistantSetVolume({ volume: 37 }));
  await assertVolume(37, 'pet command synchronizes both controls');
  await page.waitForFunction(() => !playerVolumeCommitInFlight && pendingPlayerVolume == null);
  const countBeforeMediaChange = commits.length;
  await page.evaluate(() => { els.audio.volume = .62; });
  await assertVolume(62, 'media volumechange updates both controls');
  await page.waitForTimeout(220);
  assert.equal(commits.length, countBeforeMediaChange, 'media synchronization must not echo backend writes');
  await page.locator('#volumeRange').evaluate(input => { input.value = '23'; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
  await assertVolume(23, 'legacy control synchronizes the cover slider');

  // Real pointer drag updates immediately and coalesces backend persistence.
  const rect = await range.boundingBox();
  const beforeDrag = commits.length;
  await page.mouse.move(rect.x + rect.width - 5, rect.y + rect.height * .75);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width - 5, rect.y + rect.height * .2, { steps: 10 });
  const dragging = await snapshot();
  assert.ok(dragging.audio >= .7 && dragging.audio <= .9, `drag did not update audio: ${JSON.stringify(dragging)}`);
  assert.equal(dragging.old, dragging.cover);
  await page.mouse.up();
  await page.waitForTimeout(240);
  assert.equal(commits.at(-1), dragging.audio, 'release immediately persists final value');
  assert.ok(commits.length - beforeDrag <= 2, 'drag writes are coalesced');

  // A response requested before a newer local edit must not rewind that edit.
  backendVolume = .1; stateDelay = 250;
  await page.evaluate(() => { window.__volumePendingPoll = refreshPlayerState(); });
  await page.waitForTimeout(40);
  await page.evaluate(() => petAssistantSetVolume({ volume: 44 }));
  await page.evaluate(() => window.__volumePendingPoll);
  stateDelay = 0;
  await assertVolume(44, 'stale player-state response must not overwrite a newer edit');

  // A poll started during a pending write is stale even if that write finishes first.
  backendVolume = .1; commitDelay = 70; stateDelay = 220;
  await page.evaluate(() => petAssistantSetVolume({ volume: 67 }));
  await page.evaluate(() => refreshPlayerState());
  await assertVolume(67, 'poll started during a write cannot rewind the committed value');
  stateDelay = 0;

  // A slow earlier write cannot arrive after the latest write and persist old volume.
  commitDelay = 180;
  await page.evaluate(() => petAssistantSetVolume({ volume: 20 }));
  await page.waitForTimeout(30);
  commitDelay = 5;
  await page.evaluate(() => { petAssistantSetVolume({ volume: 40 }); petAssistantSetVolume({ volume: 81 }); });
  await page.waitForFunction(() => !playerVolumeCommitInFlight && pendingPlayerVolume == null);
  assert.equal(backendVolume, .81, 'latest volume wins on the backend after delayed requests');
  assert.equal(maxConcurrentCommits, 1, 'volume writes are serialized');
  assert.deepEqual(commits.slice(-2), [.2, .81], 'intermediate queued writes coalesce');
  commitDelay = 0;

  const beforeLocalVolume = commits.length;
  await page.evaluate(() => { state.localQueueActive = true; petAssistantSetVolume({ volume: 55 }); });
  await assertVolume(55, 'local playback still synchronizes both controls');
  await page.waitForTimeout(200);
  assert.equal(commits.length, beforeLocalVolume, 'local playback does not write remote player volume');
  await page.evaluate(() => { state.localQueueActive = false; petAssistantSetVolume({ volume: 81 }); });

  const wheelBefore = await page.evaluate(() => ({ index: state.queueIndex, delta: state.qishuiPlaybackCard.wheelDelta, zoom: state.playbackVisual.zoom }));
  await page.locator('#qishuiPlaybackVolume').hover();
  await page.mouse.wheel(0, 140);
  await page.waitForTimeout(80);
  assert.equal((await snapshot()).audio, .79, 'wheel down over the volume area lowers actual audio by the default 2% step');
  await assertVolume(79, 'wheel down synchronizes both volume controls and audio');
  const wheelAfter = await page.evaluate(() => ({ index: state.queueIndex, delta: state.qishuiPlaybackCard.wheelDelta, zoom: state.playbackVisual.zoom }));
  assert.deepEqual(wheelAfter, wheelBefore, 'wheel anywhere in the volume area must not change tracks or zoom');

  await page.mouse.wheel(0, -120);
  await assertVolume(81, 'one legacy wheel event raises volume by one configured step');
  const dispatchWheel = (options) => range.evaluate((input, options) => {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...options });
    input.dispatchEvent(event);
    return event.defaultPrevented;
  }, options);
  assert.equal(await dispatchWheel({ deltaY: 3, deltaMode: 1 }), true, 'vertical line-mode wheel is consumed inside the volume control');
  await assertVolume(79, 'one line-mode wheel event applies one step');
  await dispatchWheel({ deltaY: -1, deltaMode: 2 });
  await assertVolume(81, 'one page-mode wheel event applies one step');
  for (let i = 0; i < 3; i++) await dispatchWheel({ deltaY: 10 });
  assert.equal((await snapshot()).audio, .81, 'tiny trackpad deltas accumulate below the threshold');
  await dispatchWheel({ deltaY: 10 });
  await assertVolume(79, 'four tiny pixel deltas crossing 40 pixels apply one step');
  await dispatchWheel({ deltaY: 30 });
  await dispatchWheel({ deltaY: -10 });
  await dispatchWheel({ deltaY: -30 });
  await assertVolume(81, 'reversing trackpad direction starts a fresh accumulation');
  await dispatchWheel({ deltaY: 30 });
  await page.mouse.move(0, 0);
  await page.locator('#qishuiPlaybackVolume').hover();
  await dispatchWheel({ deltaY: 10 });
  assert.equal((await snapshot()).audio, .81, 'leaving the slider clears partial wheel accumulation');
  await page.waitForTimeout(280);
  await dispatchWheel({ deltaY: 30 });
  assert.equal((await snapshot()).audio, .81, 'a gap between wheel gestures clears partial accumulation');
  await page.mouse.move(0, 0);
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(80);
  assert.equal((await snapshot()).audio, .81, 'wheel outside the slider leaves volume unchanged');
  await page.locator('#qishuiPlaybackVolume').hover();
  for (const event of [{ deltaY: 120, ctrlKey: true }, { deltaY: 120, metaKey: true }, { deltaY: 5, deltaX: 120 }]) {
    assert.equal(await dispatchWheel(event), false, 'zoom modifiers and horizontal gestures retain their default behavior');
    assert.equal((await snapshot()).audio, .81, 'zoom modifiers and horizontal gestures cannot adjust volume');
  }
  await page.evaluate(() => petAssistantSetVolume({ volume: 99 }));
  await page.mouse.wheel(0, -120);
  await assertVolume(100, 'wheel clamps at the maximum volume');
  await page.waitForFunction(() => !playerVolumeCommitInFlight && pendingPlayerVolume == null);
  const upperBoundCommits = commits.length;
  await page.mouse.wheel(0, -120);
  await page.waitForTimeout(220);
  assert.equal(commits.length, upperBoundCommits, 'wheel at the maximum does not persist redundant volume');
  await page.evaluate(() => petAssistantSetVolume({ volume: 1 }));
  await page.mouse.wheel(0, 120);
  await assertVolume(0, 'wheel clamps at silence');
  await page.waitForFunction(() => !playerVolumeCommitInFlight && pendingPlayerVolume == null);
  const lowerBoundCommits = commits.length;
  await page.mouse.wheel(0, 120);
  await page.waitForTimeout(220);
  assert.equal(commits.length, lowerBoundCommits, 'wheel at silence does not persist redundant volume');

  // Settings live in the existing visual page and update only the slider appearance.
  const defaults = { gradient: true, colorStart: '#72e6ff', colorEnd: '#b69cff', duration: 6, hoverStrength: 70, wheelStep: 2, musicReactive: true, musicStrength: 65 };
  assert.deepEqual(await page.evaluate(() => state.volumeSliderPreferences), defaults, 'first run uses the approved volume slider defaults');
  const normalized = await page.evaluate(() => ({
    nullValue: normalizeVolumeSliderPreferences(null),
    arrayValue: normalizeVolumeSliderPreferences([]),
    invalid: normalizeVolumeSliderPreferences({ gradient: 'false', colorStart: 'url(https://example.invalid/)', colorEnd: 'red', duration: 'invalid', hoverStrength: NaN, wheelStep: Infinity, musicReactive: 'false', musicStrength: 'invalid' }),
    low: normalizeVolumeSliderPreferences({ gradient: false, colorStart: '#112233', colorEnd: '#aabbcc', duration: -1, hoverStrength: -1, wheelStep: -1, musicReactive: false, musicStrength: -1 }),
    high: normalizeVolumeSliderPreferences({ duration: 999, hoverStrength: 999, wheelStep: 999, musicStrength: 999 })
  }));
  assert.deepEqual(normalized.nullValue, defaults, 'null stored preferences fall back to defaults');
  assert.deepEqual(normalized.arrayValue, defaults, 'array stored preferences fall back to defaults');
  assert.deepEqual(normalized.invalid, defaults, 'invalid colors and values fall back to defaults');
  assert.deepEqual(normalized.low, { gradient: false, colorStart: '#112233', colorEnd: '#aabbcc', duration: 2, hoverStrength: 0, wheelStep: 1, musicReactive: false, musicStrength: 0 }, 'valid values survive and numeric settings clamp at their lower bounds');
  assert.equal(normalized.high.duration, 20);
  assert.equal(normalized.high.hoverStrength, 100);
  assert.equal(normalized.high.wheelStep, 10);
  assert.equal(normalized.high.musicStrength, 100);
  await page.locator('#runtimeSettingsButton').click();
  await page.locator('[data-settings-page-id="visual"]').click();
  const settings = page.locator('#runtimeVolumeSliderSettingsGroup');
  await settings.waitFor({ state: 'visible' });
  assert.equal(await settings.evaluate(node => node.closest('[data-settings-page]')?.dataset.settingsPage), 'visual', 'volume slider settings belong to 画面与场景');
  if (!await settings.evaluate(node => node.open)) await settings.locator('summary').click();
  const updateSetting = (id, value) => page.locator(`#${id}`).evaluate((input, value) => {
    input.value = String(value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  const customized = { gradient: true, colorStart: '#ff8855', colorEnd: '#55ccaa', duration: 2, hoverStrength: 85, wheelStep: 5, musicReactive: false, musicStrength: 83 };
  const preferenceKey = 'fe-monster-volume-slider-preferences-v1';
  const journalWrite = page.waitForResponse(response => new URL(response.url()).pathname === '/api/app/preferences'
    && response.request().method() === 'POST'
    && response.request().postDataJSON()?.values?.[preferenceKey] === JSON.stringify(customized));
  await updateSetting('volumeSliderColorStart', '#ff8855');
  await updateSetting('volumeSliderColorEnd', '#55ccaa');
  await updateSetting('volumeSliderGradientDuration', 2);
  await updateSetting('volumeSliderHoverStrength', 85);
  await updateSetting('volumeSliderWheelStep', 5);
  await updateSetting('volumeSliderMusicStrength', 83);
  await page.locator('#volumeSliderMusicReactiveToggle').uncheck();
  assert.deepEqual(await page.evaluate(() => state.volumeSliderPreferences), customized, 'settings controls apply all appearance and wheel preferences immediately');
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey), customized, 'settings persist to the isolated fixture localStorage');
  assert.deepEqual(await page.evaluate(key => JSON.parse(collectClientPreferences()[key] || 'null'), preferenceKey), customized, 'volume slider preferences join the existing durable client preference journal');
  assert.equal((await journalWrite).ok(), true, 'settings changes schedule a successful durable journal write');
  const savedJournal = preferenceCommits.findLast(payload => payload.values?.[preferenceKey] === JSON.stringify(customized));
  assert.ok(savedJournal, 'the local fixture backend receives the customized volume preferences');
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'volume-settings-desktop.png') });
  await page.setViewportSize({ width: 320, height: 700 });
  await settings.scrollIntoViewIfNeeded();
  const settingsLayout = await settings.evaluate(group => {
    const panel = document.getElementById('runtimeSettingsPanel');
    const content = panel.querySelector('.settings-center-content');
    const rect = group.getBoundingClientRect();
    return { left: rect.left, right: rect.right, width: rect.width, overflow: group.scrollWidth - group.clientWidth, panelOverflow: panel.scrollWidth - panel.clientWidth, contentOverflow: content.scrollWidth - content.clientWidth };
  });
  assert.ok(settingsLayout.left >= 0 && settingsLayout.right <= 320, 'volume settings stay inside a 320px viewport');
  assert.ok(settingsLayout.overflow <= 1 && settingsLayout.panelOverflow <= 1 && settingsLayout.contentOverflow <= 1, 'volume settings create no horizontal overflow at 320px');
  assert.equal(await settings.evaluate(group => {
    const labels = group.querySelectorAll('.volume-slider-colors > label');
    return labels[0].getBoundingClientRect().bottom <= labels[1].getBoundingClientRect().top;
  }), true, 'color controls stack at 320px so their labels do not wrap one character per line');
  for (const id of ['volumeSliderGradientToggle', 'volumeSliderColorStart', 'volumeSliderColorEnd', 'volumeSliderGradientDuration', 'volumeSliderHoverStrength', 'volumeSliderWheelStep', 'volumeSliderMusicReactiveToggle', 'volumeSliderMusicStrength', 'volumeSliderAppearanceReset']) {
    const control = page.locator(`#${id}`);
    await control.scrollIntoViewIfNeeded();
    await control.focus();
    assert.equal(await control.evaluate(node => node === document.activeElement), true, `${id} remains keyboard reachable at 320px`);
    const rect = await control.boundingBox();
    assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 320 && rect.y >= 0 && rect.y + rect.height <= 700, `${id} can be scrolled into the 320px viewport`);
  }
  await settings.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, 'volume-settings-mobile-320.png') });
  appearanceChecks.mobileSettings = settingsLayout;
  await page.setViewportSize({ width: 1440, height: 900 });

  // A fresh browser profile restores the saved journal through the existing bootstrap channel.
  bootstrapPreferences = savedJournal;
  const restoredPage = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  restoredPage.on('pageerror', error => errors.push(error.message));
  await restoredPage.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  try {
    await restoredPage.goto(`http://127.0.0.1:${server.address().port}/`);
    await restoredPage.locator('#bootLogoButton').click();
    await restoredPage.waitForFunction(() => document.getElementById('bootScreen')?.hidden && typeof initVolumeSliderPreferences === 'function');
    assert.deepEqual(await restoredPage.evaluate(() => state.volumeSliderPreferences), customized, 'a fresh profile restores volume preferences from backend bootstrap');
  } finally {
    await restoredPage.close();
    bootstrapPreferences = null;
  }
  await page.evaluate(() => window.FeSettingsCenter.close('volume-test'));
  await page.evaluate(() => petAssistantSetVolume({ volume: 55 }));
  await page.locator('#qishuiPlaybackVolume').hover();
  await page.mouse.wheel(0, 120);
  await assertVolume(50, 'custom wheel step applies through the real wheel interaction');
  const appearanceSnapshot = () => page.locator('#qishuiPlaybackVolume').evaluate(node => {
    const css = getComputedStyle(node);
    const fill = getComputedStyle(node, '::after');
    return {
      gradient: node.dataset.gradient,
      start: css.getPropertyValue('--volume-slider-color-start').trim(),
      end: css.getPropertyValue('--volume-slider-color-end').trim(),
      duration: css.getPropertyValue('--volume-slider-duration').trim(),
      brightness: css.getPropertyValue('--volume-slider-hover-brightness').trim(),
      progress: css.getPropertyValue('--volume-slider-progress').trim(),
      background: fill.backgroundImage,
      position: fill.backgroundPosition,
      animation: fill.animationName,
      animationState: fill.animationPlayState,
      opacity: fill.opacity,
      bounds: { x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight, transform: css.transform }
    };
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(0, 0);
  await range.evaluate(input => input.blur());
  await page.waitForTimeout(200);
  const idleAppearance = await appearanceSnapshot();
  assert.equal(idleAppearance.gradient, 'true');
  assert.equal(idleAppearance.start, customized.colorStart);
  assert.equal(idleAppearance.end, customized.colorEnd);
  assert.equal(idleAppearance.duration, '2s');
  assert.equal(idleAppearance.progress, '50%');
  assert.ok(Number(idleAppearance.brightness) > 1, 'hover strength supplies a brighter hover treatment');
  assert.ok(idleAppearance.animationState === 'paused' || idleAppearance.animation === 'none', 'color movement stops when the slider is idle');
  await page.screenshot({ path: path.join(output, 'volume-idle-desktop.png') });
  await page.locator('#qishuiPlaybackVolume').hover();
  await page.waitForTimeout(220);
  const hoverAppearance = await appearanceSnapshot();
  assert.deepEqual(hoverAppearance.bounds, idleAppearance.bounds, 'hover appearance does not move or resize the volume control');
  assert.match(hoverAppearance.background, /linear-gradient/);
  assert.match(hoverAppearance.background, /255, 136, 85/);
  assert.match(hoverAppearance.background, /85, 204, 170/);
  assert.equal(hoverAppearance.animation, 'volumeSliderColorFlow');
  assert.equal(hoverAppearance.animationState, 'running');
  await page.waitForTimeout(160);
  assert.notEqual((await appearanceSnapshot()).position, hoverAppearance.position, 'the hovered gradient visibly advances over time');
  await page.screenshot({ path: path.join(output, 'volume-hover-desktop.png') });
  await page.mouse.move(0, 0);
  await range.focus();
  assert.equal((await appearanceSnapshot()).animationState, 'running', 'keyboard focus reveals the same gradient treatment');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal((await appearanceSnapshot()).animation, 'none', 'reduced motion disables gradient animation');
  appearanceChecks.idle = idleAppearance;
  appearanceChecks.hover = hoverAppearance;

  await page.reload();
  if (await page.locator('#bootLogoButton').isVisible()) await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => document.getElementById('bootScreen')?.hidden && typeof petAssistantSetVolume === 'function');
  await page.evaluate(() => { clearBackgroundPolling(); clearRealtimePolling(); enterPresetPlaybackPage('lyric'); });
  await range.waitFor({ state: 'visible' });
  assert.deepEqual(await page.evaluate(() => state.volumeSliderPreferences), customized, 'reloading the app restores saved slider preferences');
  await page.locator('#runtimeSettingsButton').click();
  await page.locator('[data-settings-page-id="visual"]').click();
  if (!await settings.evaluate(node => node.open)) await settings.locator('summary').click();
  assert.equal(await page.locator('#volumeSliderColorStart').inputValue(), customized.colorStart, 'restored preferences populate their settings controls');
  assert.equal(await page.locator('#volumeSliderMusicReactiveToggle').isChecked(), customized.musicReactive, 'restored music-reactivity preference populates its toggle');
  assert.equal(await page.locator('#volumeSliderMusicStrength').inputValue(), String(customized.musicStrength), 'restored music-reactivity strength populates its range');
  await page.locator('#volumeSliderGradientToggle').uncheck();
  await page.evaluate(() => window.FeSettingsCenter.close('volume-test'));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.locator('#qishuiPlaybackVolume').hover();
  const disabledAppearance = await appearanceSnapshot();
  assert.equal(disabledAppearance.gradient, 'false');
  assert.ok(disabledAppearance.animationState === 'paused' || disabledAppearance.animation === 'none', 'disabling automatic color movement stops its animation');
  await page.locator('#runtimeSettingsButton').click();
  await page.locator('[data-settings-page-id="visual"]').click();
  await page.locator('#volumeSliderAppearanceReset').click();
  assert.deepEqual(await page.evaluate(() => state.volumeSliderPreferences), defaults, 'reset restores every approved default');
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), preferenceKey), defaults, 'reset persists the restored defaults');
  await page.evaluate(() => window.FeSettingsCenter.close('volume-test'));

  // Exercise real audio samples through drawOrb, without hovering or touching volume.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.mouse.move(0, 0);
  await range.evaluate(input => input.blur());
  await page.waitForFunction(() => !playerVolumeCommitInFlight && pendingPlayerVolume == null);
  const motionVolumeBefore = await snapshot();
  const motionCommitsBefore = commits.length;
  const musicSnapshot = () => page.locator('#qishuiPlaybackVolume').evaluate(node => {
    const fill = getComputedStyle(node, '::after');
    return {
      active: node.dataset.musicActive,
      pulse: Number(node.style.getPropertyValue('--volume-slider-music-pulse')),
      position: node.style.getPropertyValue('--volume-slider-music-position'),
      paintedPosition: fill.backgroundPosition,
      filter: fill.filter, opacity: Number(fill.opacity), background: fill.backgroundImage,
      progress: getComputedStyle(node).getPropertyValue('--volume-slider-progress').trim(),
      clipPath: fill.clipPath,
      bounds: { x: node.offsetLeft, y: node.offsetTop, width: node.offsetWidth, height: node.offsetHeight },
      hovered: node.matches(':hover'), focused: node.matches(':focus-within')
    };
  });
  const musicIdle = await musicSnapshot();
  await page.evaluate(async () => {
    els.audio.src = new URL('/fixture-tone.wav', location.href).href;
    els.audio.loop = true;
    await els.audio.play();
    await ensureAudioAnalysis({ skipMixerControlRefresh: true });
    clearBackgroundPolling(); clearRealtimePolling();
    window.__volumeAudioGraph = [state.audioAnalysis.context, state.audioAnalysis.analyser, state.audioAnalysis.source];
  });
  await page.waitForFunction(() => state.audioAnalysis.live && state.visual.lowFrequencyAmplitude > .01);
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive === 'true');
  const musicFrames = [];
  for (let index = 0; index < 18; index++) {
    await page.waitForTimeout(100);
    musicFrames.push(await musicSnapshot());
  }
  assert.ok(musicFrames.every(frame => !frame.hovered && !frame.focused), 'music motion works without mouse hover or keyboard focus');
  assert.ok(Math.max(...musicFrames.map(frame => frame.pulse)) - Math.min(...musicFrames.map(frame => frame.pulse)) > .015, 'real low-frequency amplitude changes pulse strength');
  assert.ok(new Set(musicFrames.map(frame => frame.position)).size > 3, 'real mid/high-frequency samples advance the gradient');
  assert.ok(new Set(musicFrames.map(frame => frame.paintedPosition)).size > 3, 'music gradient changes reach the painted CSS background, not only a custom property');
  assert.ok(new Set(musicFrames.map(frame => frame.filter)).size > 2, 'the painted rail brightness changes with music');
  assert.ok(musicFrames.every(frame => frame.progress === musicIdle.progress && frame.clipPath === musicIdle.clipPath), 'music motion never changes the volume progress length');
  for (const frame of musicFrames) assert.deepEqual(frame.bounds, musicIdle.bounds, 'music motion cannot resize or move the hit target');
  await page.screenshot({ path: path.join(output, 'volume-music-reactive.png') });
  const wallpaperSetup = await page.evaluate(() => {
    window.__volumePriorTextPreset = state.textPreset;
    setDiyPreset('wallpaper', { persist: false });
    setTextPreset('none', { persist: false });
    state.lyricLines = [];
    requestOrbFrame();
    return { canvas: coveredPlaybackCanvasKey(), text: textLyricsEnabled(), lyrics: state.lyricLines.length };
  });
  assert.deepEqual(wallpaperSetup, { canvas: 'wallpaper', text: false, lyrics: 0 }, 'wallpaper fixture enters the formerly static covered-canvas path with no lyrics');
  const wallpaperFrames = [];
  for (let index = 0; index < 8; index++) {
    await page.waitForTimeout(100);
    wallpaperFrames.push(await musicSnapshot());
  }
  assert.ok(wallpaperFrames.every(frame => frame.active === 'true'), 'wallpaper mode retains audio-driven motion without any lyric animation');
  assert.ok(new Set(wallpaperFrames.map(frame => frame.paintedPosition)).size > 3, 'the existing drawOrb loop advances wallpaper slider motion without manual updater calls');
  await page.evaluate(() => {
    setDiyPreset('lyric', { persist: false });
    setTextPreset(window.__volumePriorTextPreset, { persist: false });
  });
  await page.evaluate(() => els.audio.pause());
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive !== 'true', null, { timeout: 3000 });
  assert.ok((await musicSnapshot()).pulse < .002, 'pausing settles music pulse to zero');
  await page.evaluate(async () => {
    await els.audio.play();
    clearBackgroundPolling(); clearRealtimePolling();
  });
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive === 'true');
  await page.evaluate(() => setVolumeSliderPreferences({ musicReactive: false }, { persist: false }));
  assert.equal((await musicSnapshot()).active, 'false', 'turning music motion off immediately clears its active styling');
  assert.equal((await musicSnapshot()).pulse, 0, 'disabled motion leaves no residual pulse');
  await page.evaluate(() => setVolumeSliderPreferences({ musicReactive: true, musicStrength: 0 }, { persist: false }));
  assert.equal((await musicSnapshot()).pulse, 0, 'zero strength is a genuine off state');
  await page.evaluate(() => setVolumeSliderPreferences({ musicStrength: 65 }, { persist: false }));
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive === 'true');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive !== 'true');
  assert.equal((await musicSnapshot()).pulse, 0, 'reduced-motion preference stops amplitude animation dynamically');
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive === 'true');
  await page.evaluate(() => setQishuiPlaybackHidden(true));
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive !== 'true');
  assert.equal((await musicSnapshot()).pulse, 0, 'a hidden playback card immediately releases its music pulse');
  await page.evaluate(() => setQishuiPlaybackHidden(false));
  await page.waitForFunction(() => document.getElementById('qishuiPlaybackVolume').dataset.musicActive === 'true');
  const hiddenMotion = await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    try {
      updateVolumeSliderMusicMotion(performance.now());
      return { pulse: Number(els.qishuiPlaybackVolume.style.getPropertyValue('--volume-slider-music-pulse')), active: els.qishuiPlaybackVolume.dataset.musicActive };
    } finally { delete document.hidden; }
  });
  assert.deepEqual(hiddenMotion, { pulse: 0, active: 'false' }, 'hidden documents stop music motion immediately');
  assert.equal(await page.evaluate(() => {
    const graph = window.__volumeAudioGraph;
    return graph[0] === state.audioAnalysis.context && graph[1] === state.audioAnalysis.analyser && graph[2] === state.audioAnalysis.source;
  }), true, 'music visual changes reuse the existing audio graph');
  await page.evaluate(() => {
    els.audio.pause(); els.audio.removeAttribute('src'); els.audio.load(); els.audio.loop = false;
    clearBackgroundPolling(); clearRealtimePolling();
  });

  // Native samples share the bridge; test freshness and fallback without native hardware.
  const nativeMotion = await page.evaluate(() => {
    state.clientRuntime.nativeAudioActive = true;
    state.clientRuntime.settings.xAudio2 = true;
    state.audioAnalysis.live = false;
    state.playerClock.playing = true;
    const sample = { energy: .65, bass: .8, lowFrequencyAmplitude: .82, mid: .42, treble: .55, beat: .75, source: 'xaudio2-native-loopback', sampleRate: 48000 };
    const read = () => ({ active: els.qishuiPlaybackVolume.dataset.musicActive, pulse: Number(els.qishuiPlaybackVolume.style.getPropertyValue('--volume-slider-music-pulse')), position: els.qishuiPlaybackVolume.style.getPropertyValue('--volume-slider-music-position') });
    const begin = performance.now();
    applyAudioBridgePayload(sample);
    for (let index = 0; index < 24; index++) updateVolumeSliderMusicMotion(begin + index * 16);
    const playing = read();
    setVolumeSliderPreferences({ gradient: false }, { persist: false });
    updateVolumeSliderMusicMotion(begin + 400);
    const singleColor = { ...read(), background: getComputedStyle(els.qishuiPlaybackVolume, '::after').backgroundImage };
    for (let index = 0; index < 180; index++) updateVolumeSliderMusicMotion(begin + 700 + index * 16);
    const stale = read();
    applyAudioBridgePayload({ energy: 0, bass: 0, lowFrequencyAmplitude: 0, mid: 0, treble: 0, beat: 0, source: 'xaudio2-native-loopback', sampleRate: 48000 });
    for (let index = 0; index < 30; index++) updateVolumeSliderMusicMotion(performance.now() + index * 16);
    const silent = read();
    // The server's java-fallback supplies synthesized sine-wave values, not samples.
    // Freshness and nonzero energy must never make those values a real music signal.
    state.clientRuntime.nativeAudioActive = false;
    const unsupportedSamples = {};
    for (const [name, source, sampleRate] of [
      ['java-fallback', 'java-fallback', 0],
      ['inactive', 'inactive', 48000],
      ['web-audio-placeholder', 'web-audio', 48000],
      ['empty-source', '', 48000],
      ['missing-rate', 'xaudio2-native-loopback', undefined],
      ['non-finite-rate', 'xaudio2-native-loopback', Infinity]
    ]) {
      const fallbackStart = performance.now();
      Object.assign(state.volumeSliderMotion, { pulse: 0, phase: 0, lastFrameAt: fallbackStart });
      applyAudioBridgePayload({ ...sample, source, sampleRate });
      for (let frame = 1; frame <= 60; frame++) {
        const time = fallbackStart + frame * 1000 / 60;
        state.visualBridge.receivedAt = time;
        updateVolumeSliderMusicMotion(time);
      }
      unsupportedSamples[name] = read();
    }
    state.clientRuntime.nativeAudioActive = true;
    const atRefreshRate = rate => {
      const start = performance.now();
      Object.assign(state.visualBridge, sample);
      Object.assign(state.volumeSliderMotion, { pulse: 0, phase: 0, lastFrameAt: start });
      for (let frame = 1; frame <= rate; frame++) {
        const time = start + frame * 1000 / rate;
        state.visualBridge.receivedAt = time;
        updateVolumeSliderMusicMotion(time);
      }
      return { pulse: state.volumeSliderMotion.pulse, phase: state.volumeSliderMotion.phase };
    };
    const refresh60 = atRefreshRate(60);
    const refresh120 = atRefreshRate(120);
    state.playerClock.playing = false;
    state.clientRuntime.nativeAudioActive = false;
    setVolumeSliderPreferences({ gradient: true }, { persist: false });
    updateVolumeSliderMusicMotion(performance.now());
    return { playing, singleColor, stale, silent, unsupportedSamples, refresh60, refresh120 };
  });
  assert.equal(nativeMotion.playing.active, 'true', 'fresh native bridge samples drive the same edge slider');
  assert.ok(nativeMotion.playing.pulse > .02, 'native low-frequency samples supply visible amplitude');
  assert.equal(nativeMotion.singleColor.background, 'none', 'disabling gradients preserves the user selected single color while pulsing');
  assert.ok(nativeMotion.singleColor.pulse > .02, 'single-color rails retain amplitude response');
  assert.equal(nativeMotion.stale.active, 'false', 'stale bridge samples cannot keep old amplitude animating');
  assert.ok(nativeMotion.stale.pulse < .002, 'lost native samples decay to rest');
  assert.equal(nativeMotion.silent.active, 'false', 'zero-signal samples cannot fabricate a beat');
  for (const [name, unsupported] of Object.entries(nativeMotion.unsupportedSamples)) {
    assert.equal(unsupported.active, 'false', `fresh nonzero ${name} values are not valid real audio samples`);
    assert.equal(unsupported.pulse, 0, `${name} bridge values cannot fabricate music-reactive volume motion`);
  }
  assert.ok(Math.abs(nativeMotion.refresh60.pulse - nativeMotion.refresh120.pulse) < .00001, '60Hz and 120Hz produce the same pulse after equal elapsed time');
  assert.ok(Math.abs(nativeMotion.refresh60.phase - nativeMotion.refresh120.phase) < .00001, '60Hz and 120Hz produce the same gradient phase after equal elapsed time');
  await page.waitForTimeout(250);
  assert.deepEqual(await snapshot(), motionVolumeBefore, 'music visuals never change either volume control or actual audio volume');
  assert.equal(commits.length, motionCommitsBefore, 'music visuals never send player volume requests');
  appearanceChecks.music = { idle: musicIdle, frames: musicFrames, wallpaperFrames, native: nativeMotion };
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => petAssistantSetVolume({ volume: 81 }));

  for (const [name, width, height, expanded, fullscreen] of [
    ['desktop', 1440, 900, false, false], ['expanded', 1440, 900, true, false],
    ['fullscreen', 1440, 900, false, true], ['desktop-small', 1024, 768, false, false],
    ['short-expanded', 1024, 640, true, false], ['tablet', 768, 1024, false, false],
    ['mobile', 390, 844, false, false], ['mobile-small', 320, 700, false, false],
    ['landscape', 844, 390, false, false]
  ]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(({ expanded, fullscreen }) => { setQishuiPlaybackExpanded(expanded); els.appShell.classList.toggle('is-window-fullscreen', fullscreen); }, { expanded, fullscreen });
    await page.mouse.move(0, 0);
    await range.evaluate(input => input.blur());
    await page.waitForTimeout(300);
    const layout = await page.evaluate(() => {
      const bounds = id => { const r = document.getElementById(id).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; };
      const input = document.getElementById('qishuiPlaybackVolumeRange');
      const volume = document.getElementById('qishuiPlaybackVolume');
      const content = volume.parentElement;
      const css = getComputedStyle(input);
      return { cover: bounds('qishuiPlaybackCoverFrame'), volume: bounds('qishuiPlaybackVolume'), lyric: bounds('qishuiPlaybackLyricPage'), phone: bounds('qishuiPlaybackPhone'), range: bounds('qishuiPlaybackVolumeRange'), railInset: (input.clientWidth - parseFloat(css.paddingLeft) + parseFloat(css.paddingRight)) / 2, edgeInset: content.clientWidth - volume.offsetLeft - volume.offsetWidth };
    });
    await page.screenshot({ path: path.join(output, `${name}.png`) });
    const railLeft = layout.volume.right - 8;
    assert.ok(railLeft >= layout.cover.right - 1, `${name}: volume overlaps cover`);
    assert.ok(layout.volume.right <= layout.phone.right + 1 && layout.volume.right <= width, `${name}: volume is clipped ${JSON.stringify(layout)}`);
    assert.ok(layout.phone.right - layout.volume.right < 10, `${name}: slider should meet the card edge`);
    assert.ok(Math.abs(layout.railInset) <= 1 && Math.abs(layout.edgeInset) <= 1, `${name}: rail center must merge with the card boundary`);
    const volumeCenter = (layout.volume.top + layout.volume.bottom) / 2;
    const coverCenter = (layout.cover.top + layout.cover.bottom) / 2;
    assert.ok(Math.abs(volumeCenter - coverCenter) < 18, `${name}: volume must align with the cover vertically ${JSON.stringify(layout)}`);
    assert.ok(layout.range.height > layout.range.width, `${name}: range must remain vertical`);
    const intersectsLyrics = railLeft < layout.lyric.right && layout.volume.right > layout.lyric.left && layout.volume.top < layout.lyric.bottom && layout.volume.bottom > layout.lyric.top;
    assert.equal(intersectsLyrics, false, `${name}: volume overlaps lyrics ${JSON.stringify(layout)}`);
    layouts.push({ name, ...layout });
  }
  await page.locator('#qishuiPlaybackVisibilityToggle').click();
  await page.waitForTimeout(300);
  assert.equal(await range.isVisible(), false, 'hiding the playback card hides the volume control');
  assert.deepEqual(errors, [], 'app should not throw browser errors');
  assert.deepEqual(networkErrors, [], 'local resources must load successfully');
  writeFileSync(path.join(output, 'report.json'), JSON.stringify({ ok: true, commits, preferenceCommits: preferenceCommits.length, layouts, appearanceChecks, errors, networkErrors }, null, 2));
  console.log(JSON.stringify({ ok: true, commits: commits.length, layouts: layouts.map(item => item.name), output }));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
