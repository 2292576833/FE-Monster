import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const resultId = 'lyric-scroll-clock-browser-result';

const probe = String.raw`
<style>
  #bootScreen { display: none !important; }
  #qishuiPlaybackCard {
    display: block !important;
    visibility: visible !important;
    position: fixed !important;
    inset: 20px 20px auto auto !important;
    width: 430px !important;
    height: 620px !important;
  }
  #qishuiPlaybackLyricPage {
    display: block !important;
    width: 390px !important;
    height: 420px !important;
    padding-block: 130px !important;
    overflow: hidden !important;
  }
</style>
<script>
(() => {
  const runtimeErrors = [];
  window.addEventListener('error', (event) => runtimeErrors.push(event.message || 'window error'));
  window.addEventListener('unhandledrejection', (event) => runtimeErrors.push(String(event.reason || 'rejection')));
  const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const report = (payload) => {
    const output = document.createElement('pre');
    output.id = '${resultId}';
    output.textContent = JSON.stringify(payload);
    document.body.appendChild(output);
  };
  // The new playback bar applies the reading axis as a transform offset
  // instead of a scroll position, so no clipping window is needed.
  const viewportOffset = list => (
    list.dataset.lyricOffset === 'transform' ? (Number(list.__lyricOffset) || 0) : list.scrollTop
  );
  const centerDelta = (list, line) => Math.abs(
    line.offsetTop - viewportOffset(list) + line.offsetHeight / 2 - list.clientHeight / 2
  );

  async function run() {
    // Let boot hydration settle before installing the local lyric fixture;
    // otherwise an in-flight library/player load can replace its DOM mid-test.
    for (let attempt = 0; attempt < 60 && !bootVisual.ready; attempt += 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    clearBackgroundPolling();
    clearRealtimePolling();
    const card = document.getElementById('qishuiPlaybackCard');
    const list = document.getElementById('qishuiPlaybackLyricPage');
    if (!card || !list || typeof updateQishuiPlaybackLyrics !== 'function') {
      report({ error: 'playback lyric runtime is unavailable' });
      return;
    }
    card.hidden = false;
    els.appShell.classList.add('has-qishui-playback-card');
    state.currentSong = {
      id: 'scroll-clock-browser-fixture',
      title: 'Scroll clock browser fixture',
      artist: 'QA',
      provider: 'local'
    };
    state.lyricLines = Array.from({ length: 12 }, (_, index) => ({
      time: index,
      endTime: index + 0.94,
      text: '第 ' + (index + 1) + ' 行媒体时钟歌词',
      translationText: 'Media clock lyric line ' + (index + 1)
    }));
    state.lyricSignature = lyricSignatureForSong(state.currentSong);
    state.qishuiPlaybackCard.lyricSignature = '';
    state.qishuiPlaybackCard.lyricBookIndex = -2;
    state.qishuiPlaybackCard.lastLyricIndex = -1;
    state.qishuiPlaybackCard.lyricBookArrivedIndex = -2;
    resetBookLyricScrollState({ store: state.qishuiPlaybackCard });

    updateQishuiPlaybackLyrics('', '', 0.99, { playbackRunning: true });
    await frame();
    const beforeScroll = viewportOffset(list);

    updateQishuiPlaybackLyrics('', '', 1.001, { playbackRunning: true });
    const active = list.querySelector('[data-book-lyric-index="1"]');
    if (!active) {
      report({ error: 'active lyric line was not rendered' });
      return;
    }
    const atTimestamp = {
      activeIndex: list.dataset.activeIndex,
      arrivedIndex: list.dataset.arrivedIndex,
      scrollTop: viewportOffset(list),
      centerDelta: centerDelta(list, active),
      className: active.className
    };
    const transition = state.qishuiPlaybackCard.lyricTransition;
    const keyframes = transition?.animations?.flatMap(({ animation }) => (
      animation.effect?.getKeyframes?.() || []
    )) || [];
    const positionTweenCount = keyframes.filter((keyframe) => (
      keyframe.translate != null || keyframe.scale != null || keyframe.transform != null
    )).length;

    await frame();
    updateQishuiPlaybackLyrics('', '', 1.017, { playbackRunning: true });
    const nextFrame = {
      scrollTop: viewportOffset(list),
      centerDelta: centerDelta(list, active)
    };
    // Resizing while paused must recenter the same lyric without waiting for
    // another timestamp or briefly dropping its current-line highlight.
    list.style.setProperty('height', '260px', 'important');
    const originalClock = currentPlaybackLyricTime;
    currentPlaybackLyricTime = () => 1.017;
    scheduleQishuiPlaybackLyricLayout();
    await frame();
    currentPlaybackLyricTime = originalClock;
    updateQishuiPlaybackLyrics('', '', 1.017, { playbackRunning: false });
    const pausedResize = {
      centerDelta: centerDelta(list, active),
      arrivedIndex: list.dataset.arrivedIndex,
      highlighted: active.classList.contains('is-current')
    };
    report({
      beforeScroll,
      atTimestamp,
      nextFrame,
      pausedResize,
      positionTweenCount,
      runtimeErrors
    });
  }

  setTimeout(() => run().catch((error) => report({ error: error.stack || error.message })), 80);
})();
</script>`;

const originalHtml = readFileSync(path.join(webRoot, 'index.html'), 'utf8');
const injectedHtml = originalHtml.replace('</body>', `${probe}\n</body>`);

function contentType(filePath) {
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  })[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', 'http://127.0.0.1').pathname);
  if (pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    response.end(injectedHtml);
    return;
  }
  if (pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const base = pathname.startsWith('/components/') ? root : webRoot;
  const filePath = path.resolve(base, `.${pathname}`);
  if (!filePath.startsWith(base + path.sep)) {
    response.writeHead(403);
    response.end();
    return;
  }
  try {
    const content = readFileSync(filePath);
    response.writeHead(200, { 'content-type': contentType(filePath) });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const profileDir = mkdtempSync(path.join(tmpdir(), 'fe-monster-lyric-scroll-clock-'));
let stdout = '';
try {
  const address = server.address();
  const result = await execFileAsync(edgePath, [
    '--headless=new',
    '--disable-extensions',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    '--window-size=1280,720',
    '--virtual-time-budget=5000',
    '--dump-dom',
    `http://127.0.0.1:${address.port}/?client=desktop-scene`
  ], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    timeout: 15000,
    windowsHide: true
  });
  stdout = result.stdout;
} finally {
  await new Promise((resolve) => server.close(resolve));
  assert.ok(profileDir.startsWith(path.join(tmpdir(), 'fe-monster-lyric-scroll-clock-')));
  rmSync(profileDir, { recursive: true, force: true });
}

const resultMatch = stdout.match(new RegExp(`<pre id="${resultId}">([\\s\\S]*?)<\\/pre>`));
assert.ok(resultMatch, `headless browser did not return the lyric scroll result:\n${stdout.slice(-2000)}`);
const payload = JSON.parse(resultMatch[1]
  .replaceAll('&quot;', '"')
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replaceAll('&amp;', '&'));
assert.equal(payload.error, undefined, payload.error);
assert.equal(payload.atTimestamp.activeIndex, '1', 'the provider timestamp must select the new lyric line');
assert.equal(payload.atTimestamp.arrivedIndex, '1', 'the new lyric line must arrive in its timestamp frame');
assert.ok(payload.atTimestamp.centerDelta <= 8,
  `the timestamp-frame lyric is not on the reading axis: ${payload.atTimestamp.centerDelta}px`);
assert.ok(payload.nextFrame.centerDelta <= 8,
  `the lyric drifted away from the reading axis on the next media frame: ${payload.nextFrame.centerDelta}px`);
assert.ok(payload.pausedResize.centerDelta <= 8,
  `paused resize must recenter the current lyric: ${payload.pausedResize.centerDelta}px`);
assert.equal(payload.pausedResize.arrivedIndex, '1');
assert.equal(payload.pausedResize.highlighted, true);
assert.equal(payload.positionTweenCount, 0,
  'a playback-card transition must not visually restore the old scroll position');
assert.deepEqual(payload.runtimeErrors, [], `browser runtime errors: ${payload.runtimeErrors.join('\n')}`);

console.log(JSON.stringify({ ok: true, ...payload }, null, 2));
