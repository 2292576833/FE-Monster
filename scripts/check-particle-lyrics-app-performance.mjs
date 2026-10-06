import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const web = path.join(root, 'web');
const out = path.join(root, 'output/performance-audit');
mkdirSync(out, { recursive: true });
const require = createRequire(import.meta.url);
let chromium;
for (const location of [process.env.PLAYWRIGHT_MODULE_PATH, 'playwright', path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
  try { ({ chromium } = require(location)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');
// Snapshot both sources once. The baseline replaces only the four app functions;
// runtime changes in another task cannot become an accidental A/B difference.
const appSource = readFileSync(path.join(web, 'app.js'), 'utf8');
const runtimeSource = readFileSync(path.join(web, 'particle-lyrics-runtime.js'), 'utf8');
const baselinePath = path.resolve(process.env.PARTICLE_LYRICS_APP_BASELINE || path.join(root, 'output/performance-20260918/app-before.js'));
const names = ['updateParticleLyricsMotion', 'setPlaybackLyricLine', 'updatePlaybackSceneMotion', 'updateGlitchBeatMotion'];
function functionsFrom(source) {
  return Object.fromEntries(names.map(name => {
    const start = source.indexOf(`\nfunction ${name}(`);
    assert.ok(start >= 0, `missing ${name}`);
    const next = source.indexOf('\nfunction ', start + 1);
    const code = source.slice(start + 1, next < 0 ? source.length : next).trim();
    // Parsing the expression also catches any accidentally included declarations.
    new Function(`return (${code});`);
    return [name, code];
  }));
}
const variants = { candidate: functionsFrom(appSource) };
if (existsSync(baselinePath)) variants.baseline = functionsFrom(readFileSync(baselinePath, 'utf8'));
else console.log('Local app baseline absent; running portable candidate correctness and count checks.');
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
  if (pathname === '/api/app/preferences/bootstrap.js') { response.setHeader('Content-Type', 'application/javascript'); response.end(''); return; }
  if (pathname.startsWith('/api/')) {
    const fixtures = {
      '/api/app/runtime': { ok: true, clientMode: 'browser', renderBackend: 'webgl', settings: { gpuAcceleration: true } },
      '/api/player/state': { ok: true, playing: false, paused: true, volume: .8, position: 0, duration: 0, queue: [], queueLength: 0, queueRevision: 0, queueIndex: -1 },
      '/api/music-apis': { ok: true, providers: [] }, '/api/user-cursors': { ok: true, cursors: [] },
      '/api/visual-bridge/state': { ok: true, audio: {} }, '/api/sandbox/presets': { ok: true, presets: [] },
      '/api/sandbox/components': { ok: true, components: [] }, '/api/community/status': { ok: true, authenticated: false },
      '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] }
    };
    response.setHeader('Content-Type', 'application/json'); response.end(JSON.stringify(fixtures[pathname] || { ok: true })); return;
  }
  const file = path.resolve(pathname.startsWith('/components/') ? root : web, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!file.startsWith(root + path.sep) || !existsSync(file) || !statSync(file).isFile()) { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
  response.end(pathname === '/app.js' ? appSource : pathname === '/particle-lyrics-runtime.js' ? runtimeSource : readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
  browser = await chromium.launch({ headless: true, ...(existsSync(chromium.executablePath()) ? {} : { executablePath: edge }), args: ['--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(() => typeof setTextPreset === 'function' && document.getElementById('bootScreen')?.hidden);
  await page.evaluate(() => { enterPresetPlaybackPage('lyric'); setDiyOpen(true); setDiyPage('text'); setDiyCardOpen(true); });
  await page.locator('#diyParticleLyricsPreset').click();
  await page.waitForFunction(() => particleLyricsRuntimeSnapshot().active);
  await page.evaluate(() => {
    clearBackgroundPolling(); setDiyOpen(false); setQishuiPlaybackHidden(true);
    cancelAnimationFrame(state.orb.animationFrame); state.orb.animationFrame = 0; requestOrbFrame = () => {};
    state.currentSong = { id: 'app-performance-fixture', provider: 'fixture', title: '星光', artist: 'Fixture', duration: 40, position: 30 };
    const audio = new Audio();
    window.__testMediaTime = .2;
    window.__testMediaPaused = false;
    Object.defineProperties(audio, {
      src: { get: () => 'performance-fixture.wav' }, currentSrc: { get: () => 'performance-fixture.wav' },
      currentTime: { get: () => window.__testMediaTime }, duration: { configurable: true, get: () => 40 },
      paused: { get: () => window.__testMediaPaused }, ended: { get: () => false }, readyState: { get: () => 4 }
    });
    els.audio = audio;
    state.playerClock = { position: 30, duration: 40, playing: true, updatedAt: performance.now() };
    state.qishuiPlaybackCard.progressDragging = false;
    state.qishuiPlaybackCard.pendingSeekTarget = null;
    state.qishuiPlaybackCard.seekHandoffTarget = null;
    state.multiRowLyricsEnabled = false;
    state.textComposerSettings.highlightParticlesEnabled = false;
    setParticleLyricsEffect('presentation', 'sung');
    window.__glyphOriginal = glyphTimingsFromWordTimings;
    window.__glyphCalls = 0;
    glyphTimingsFromWordTimings = (...args) => { window.__glyphCalls += 1; return window.__glyphOriginal(...args); };
    window.__desktopOriginal = scheduleDesktopSceneSnapshot;
    window.__desktopCalls = 0;
    scheduleDesktopSceneSnapshot = (...args) => { window.__desktopCalls += 1; return window.__desktopOriginal(...args); };
    window.__multiRowOriginal = renderMultiRowLyrics;
    window.__multiRowCalls = 0;
    renderMultiRowLyrics = (...args) => { window.__multiRowCalls += 1; return window.__multiRowOriginal(...args); };
  });
  const results = {};
  for (let round = 0; round < 3; round += 1) {
    const order = Object.keys(variants); if (round % 2) order.reverse();
    for (const name of order) {
      const result = await page.evaluate(({ functions, round }) => {
        for (const [name, code] of Object.entries(functions)) window[name] = (0, eval)(`(${code})`);
        state.lyricLines = [
          { time: 0, text: '听见星光', translationText: 'Hear the starlight', wordTimings: Array.from('听见星光', (char, i) => ({ char, startTime: i, duration: 1 })) },
          { time: 6, text: '微尘成歌', translationText: 'Dust becomes song', wordTimings: Array.from('微尘成歌', (char, i) => ({ char, startTime: 6 + i, duration: 1 })) }
        ];
        state.lyricSignature = `performance-${round}`;
        // Warm both variants with the same real runtime before the counted sample.
        for (let frame = 0; frame < 30; frame += 1) { __testMediaTime = .15; updatePlaybackSceneMotion(); }
        state.lyricIndex = 1; state.lyricDisplayText = 'stale'; state.lyricSubtitleText = 'stale'; state.lyricProgressPercent = -1;
        els.playbackLyricText.textContent = 'stale'; els.playbackLyricSubtitle.textContent = 'stale';
        delete state.particleLyrics.runtime.lyricTimingCache;
        resetLyricFrameSync();
        const observer = new MutationObserver(() => {});
        observer.observe(els.playbackLyricScene, { subtree: true, attributes: true, childList: true, characterData: true });
        __glyphCalls = 0; __desktopCalls = 0;
        const started = performance.now();
        for (let frame = 0; frame < 180; frame += 1) {
          __testMediaTime = .2 + frame / 60;
          updatePlaybackSceneMotion();
        }
        const cpuMs = performance.now() - started;
        const hiddenMutations = observer.takeRecords().length;
        observer.disconnect();
        const scene = desktopSceneSnapshot().lyricPlayback;
        const result = { frames: 180, cpuMs, perFrameMs: cpuMs / 180, glyphConversions: __glyphCalls, hiddenMutations,
          desktopCalls: __desktopCalls, displayText: state.lyricDisplayText, subtitle: state.lyricSubtitleText,
          lyricIndex: state.lyricIndex, progress: state.lyricProgressPercent,
          runtime: { glyph: state.particleLyrics.runtime.activeGlyph, time: state.particleLyrics.runtime.audioTime, text: state.particleLyrics.frame.text },
          desktop: { text: scene.displayText, subtitle: scene.subtitleText, progress: scene.progressPercent, time: scene.position, effectiveTime: scene.effectiveLyricTime } };
        state.multiRowLyricsEnabled = true;
        observer.observe(els.playbackLyricScene, { subtree: true, attributes: true, childList: true, characterData: true });
        __multiRowCalls = 0;
        for (let frame = 0; frame < 30; frame += 1) { __testMediaTime = 3.2 + frame / 60; updatePlaybackSceneMotion(); }
        result.multiRow = { calls: __multiRowCalls, hiddenMutations: observer.takeRecords().length, desktopText: desktopSceneSnapshot().lyricPlayback.displayText };
        observer.disconnect(); state.multiRowLyricsEnabled = false;
        return result;
      }, { functions: variants[name], round });
      (results[name] ||= []).push(result);
    }
  }
  const correctness = await page.evaluate(functions => {
    for (const [name, code] of Object.entries(functions)) window[name] = (0, eval)(`(${code})`);
    const check = (label, time) => {
      __testMediaTime = time; resetLyricFrameSync(); updatePlaybackSceneMotion();
      return { label, conversions: __glyphCalls, glyph: state.particleLyrics.runtime.activeGlyph,
        time: state.particleLyrics.runtime.audioTime, text: state.particleLyrics.frame.text,
        display: state.lyricDisplayText, desktop: desktopSceneSnapshot().lyricPlayback.displayText,
        glyphs: state.particleLyrics.frame.glyphTimings.map(item => ({ char: item.char, start: item.start, end: item.end })) };
    };
    __glyphCalls = 0; delete state.particleLyrics.runtime.lyricTimingCache;
    const checks = [check('first-line', .3), check('same-line-forward', 2.3), check('same-line-rewind', .3), check('next-line', 6.3)];
    const line = state.lyricLines[1];
    line.wordTimings = line.wordTimings.map(item => ({ ...item, startTime: item.startTime + .5 }));
    checks.push(check('replaced-word-array', 6.8));
    state.lyricLines[1] = scaleLyricLineTiming(line, 6, 2);
    checks.push(check('calibrated-line', 7.2));
    const offsetKey = lyricClockOffsetSongKey(state.currentSong);
    state.lyricClockOffsetsByTrack = { ...state.lyricClockOffsetsByTrack, [offsetKey]: .5 };
    checks.push(check('media-offset', 7.2));
    state.lyricClockOffsetsByTrack[offsetKey] = 0;
    state.lyricLines[1].wordTimings = [{ char: '微', startTime: 6 }];
    checks.push(check('fallback-end', 7));
    state.currentSong.duration = 45;
    Object.defineProperty(els.audio, 'duration', { get: () => 45 });
    checks.push(check('duration-invalidates-end', 7));
    state.lyricLines[1].wordTimings.push({ char: '尘', startTime: 7.5, duration: .5 });
    checks.push(check('word-array-growth', 7.6));
    state.lyricLines[1].glyphTimings = [{ char: '微', start: 6, end: 8 }];
    checks.push(check('direct-glyph-timeline', 7));
    const expectedText = state.lyricDisplayText, expectedSubtitle = state.lyricSubtitleText;
    __testMediaPaused = true;
    setTextPreset('depth', { persist: false });
    updatePlaybackSceneMotion();
    const restored = { expectedText, expectedSubtitle, text: els.playbackLyricText.textContent, subtitle: els.playbackLyricSubtitle.textContent, hidden: els.playbackLyricScene.hidden };
    __testMediaPaused = false;
    updatePlaybackSceneMotion();
    const observer = new MutationObserver(() => {});
    observer.observe(els.playbackLyricScene, { subtree: true, childList: true, characterData: true });
    for (let frame = 0; frame < 30; frame += 1) { __testMediaTime = 7 + frame / 60; updatePlaybackSceneMotion(); }
    const visibleTextMutations = observer.takeRecords().length;
    observer.disconnect();
    return { checks, restored, visibleTextMutations, domPending: state.playbackVisual.lyricDomPending };
  }, variants.candidate);
  const report = { browser: await browser.version(), runtimeSha256: createHash('sha256').update(runtimeSource).digest('hex'), changedFunctions: names,
    rounds: 3, results, correctness, errors, notes: 'Controlled 180-frame CPU submission samples; only the four app functions differ. Existing app-browser test covers decoded media seeks and 2× playback.' };
  writeFileSync(path.join(out, 'app-performance-comparison.json'), JSON.stringify(report, null, 2));
  const summary = Object.fromEntries(Object.entries(results).map(([name, runs]) => {
    const times = runs.map(run => run.perFrameMs).sort((a, b) => a - b);
    return [name, { cpuPerFrameMs: { median: times[1], min: times[0], max: times[2] },
      glyphConversions: runs.map(run => run.glyphConversions), hiddenMutations: runs.map(run => run.hiddenMutations),
      desktopCalls: runs.map(run => run.desktopCalls), multiRowCalls: runs.map(run => run.multiRow.calls) }];
  }));
  console.log(JSON.stringify({ summary, restored: correctness.restored, visibleTextMutations: correctness.visibleTextMutations,
    runtimeSha256: report.runtimeSha256, errors, reportPath: path.join(out, 'app-performance-comparison.json') }, null, 2));
  assert.deepEqual(errors, []);
  for (const run of results.candidate) {
    assert.equal(run.glyphConversions, 1, 'one unchanged word-timing line converts once');
    assert.equal(run.hiddenMutations, 0, 'particle frames do not mutate hidden standard lyrics');
    assert.equal(run.desktopCalls, 180, 'desktop publishing is still scheduled on lyric frames');
    assert.equal(run.displayText, '听见星光'); assert.equal(run.lyricIndex, 0); assert.equal(run.runtime.glyph, 3);
    assert.equal(run.desktop.text, run.displayText); assert.equal(run.desktop.subtitle, run.subtitle);
    assert.equal(run.desktop.progress, run.progress); assert.equal(run.desktop.time, run.runtime.time);
    assert.equal(run.multiRow.calls, 0, 'hidden multi-row lyrics are not rendered in particle mode');
    assert.equal(run.multiRow.hiddenMutations, 0); assert.equal(run.multiRow.desktopText, run.displayText);
  }
  if (results.baseline) {
    for (let i = 0; i < 3; i += 1) {
      const before = results.baseline[i], after = results.candidate[i];
      assert.equal(before.glyphConversions, 180);
      assert.ok(before.hiddenMutations > 180);
      assert.ok(before.multiRow.calls > 0);
      for (const key of ['displayText', 'subtitle', 'lyricIndex', 'progress', 'runtime', 'desktop']) assert.deepEqual(after[key], before[key], `A/B ${key} must remain accurate`);
    }
  }
  const byLabel = Object.fromEntries(correctness.checks.map(item => [item.label, item]));
  assert.equal(byLabel['same-line-forward'].conversions, 1); assert.equal(byLabel['same-line-rewind'].conversions, 1);
  assert.equal(byLabel['next-line'].conversions, 2); assert.equal(byLabel['next-line'].desktop, '微尘成歌');
  assert.equal(byLabel['replaced-word-array'].conversions, 3); assert.equal(byLabel['replaced-word-array'].glyphs[0].start, 6.5);
  assert.equal(byLabel['calibrated-line'].conversions, 4); assert.equal(byLabel['calibrated-line'].glyphs[0].start, 7);
  assert.equal(byLabel['media-offset'].conversions, 4); assert.equal(byLabel['media-offset'].time, 7.7);
  assert.equal(byLabel['duration-invalidates-end'].conversions, byLabel['fallback-end'].conversions + 1);
  assert.equal(byLabel['word-array-growth'].conversions, byLabel['duration-invalidates-end'].conversions + 1);
  assert.equal(byLabel['direct-glyph-timeline'].conversions, byLabel['word-array-growth'].conversions);
  assert.equal(correctness.restored.hidden, false); assert.equal(correctness.restored.text, correctness.restored.expectedText);
  assert.equal(correctness.restored.subtitle, correctness.restored.expectedSubtitle, 'switching back must restore the latest subtitle');
  assert.equal(correctness.visibleTextMutations, 0, 'unchanged visible lyrics do not repeatedly rebuild their text');
  assert.notEqual(correctness.domPending, true, 'visible synchronization clears the pending DOM flag');
  console.log('Particle lyric app performance, hidden DOM, timing cache invalidation and desktop-state checks passed.');
} finally { await browser?.close(); server.close(); }
