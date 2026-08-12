import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const rootPath = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(rootPath, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const tempRoot = path.join(rootPath, 'tmp', `pet-tour-browser-${process.pid}`);
assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(tempRoot, { recursive: true });

const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<link rel="stylesheet" href="/pet-product-tour.css">
<style>
html,body{width:100%;height:100%;margin:0;background:#171513;color:white;font-family:sans-serif}
.fixture{display:grid;grid-template-columns:repeat(4,160px);gap:18px;padding:50px}
.fixture button{height:58px;border:1px solid #655f54;border-radius:14px;background:#27231e;color:white}
#petAssistant{position:fixed;left:18px;bottom:18px;width:176px;height:218px;pointer-events:none}
#petAssistantCharacter{width:160px;pointer-events:auto}
</style></head><body>
<div class="fixture">
  <span id="petAssistant"><span class="pet-assistant__dock"><button id="petAssistantCharacter">桌宠</button></span></span>
  <button id="neteaseLoginButton">音乐账号</button>
  <button id="communityRailButton" aria-expanded="false">社区</button>
  <button id="diyButton" aria-expanded="false">DIY</button>
  <button id="diyPresetButton">场景</button>
  <button id="diyTextModeButton">歌词</button>
  <button id="diyWallpaperModeButton">壁纸</button>
  <button id="runtimeSettingsButton">设置</button>
  <button id="petProductTourReplay">重新演示</button>
</div>
<script>
window.__tourBubble = '';
window.__tourNarrationEvents = [];
window.__tourLifecycle = [];
window.addEventListener('fe-monster-pet-tour-move', (event) => {
  window.__tourLifecycle.push({ kind: 'move', ...event.detail });
});
window.addEventListener('fe-monster-pet-tour-narration', (event) => {
  window.__tourLifecycle.push({ kind: 'narration', ...event.detail });
});
window.FeMonsterPetAssistant = {
  setVisible() {}, setState() {}, clearBubble() {},
  showBubble(text) { window.__tourBubble = text; return true; },
  narrate(text, options = {}) {
    window.__tourNarrationEvents.push({ phase: 'requested', text });
    if (window.__tourNarrationMode === 'fallback') {
      const outcome = Object.freeze({ status: 'fallback', reason: 'offline', mode: 'text-fallback' });
      return {
        started: Promise.resolve(outcome),
        finished: Promise.resolve(outcome),
        cancel() { return false; }
      };
    }
    let finish;
    let settled = false;
    const started = new Promise((resolve) => setTimeout(() => {
      window.__tourNarrationEvents.push({ phase: 'playing', text });
      resolve(true);
    }, 20));
    const finished = new Promise((resolve) => { finish = resolve; });
    const complete = () => {
      if (settled) return;
      settled = true;
      window.__tourNarrationEvents.push({ phase: 'ended', text });
      finish(true);
    };
    const cancel = () => {
      if (settled) return;
      settled = true;
      window.__tourNarrationEvents.push({ phase: 'cancelled', text });
      finish(false);
    };
    window.__finishTourNarration = complete;
    options.signal?.addEventListener?.('abort', cancel, { once: true });
    return { started, finished, cancel };
  }
};
for (const id of ['communityRailButton','diyButton','diyPresetButton','diyTextModeButton','diyWallpaperModeButton','runtimeSettingsButton']) {
  document.getElementById(id).addEventListener('click', (event) => {
    event.currentTarget.dataset.clicks = String(Number(event.currentTarget.dataset.clicks || 0) + 1);
    if (id === 'communityRailButton' || id === 'diyButton') {
      event.currentTarget.setAttribute('aria-expanded', event.currentTarget.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
    }
  });
}
</script>
<script src="/pet-product-tour.js"></script>
<script>
(async () => {
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const api = window.FeMonsterProductTour;
  const started = api.start({ auto: false, feId: 'browser-fe' });
  await wait(60);
  const firstTarget = document.getElementById('petAssistantCharacter').classList.contains('is-pet-tour-target');
  const ringVisible = !document.querySelector('.pet-product-tour__target-ring').hidden;
  const originRect = document.getElementById('petAssistant').getBoundingClientRect();
  api.next();
  await wait(60);
  api.next();
  await wait(340);
  const community = document.getElementById('communityRailButton');
  const clicked = community.dataset.clicks === '1';
  const highlighted = community.classList.contains('is-pet-tour-target');
  const spoke = /社区/.test(window.__tourBubble);
  const movedRect = document.getElementById('petAssistant').getBoundingClientRect();
  const movedBesideTarget = Math.hypot(movedRect.left - originRect.left, movedRect.top - originRect.top) > 24;
  const narrationRequested = window.__tourNarrationEvents.some((event) => event.phase === 'requested' && /社区/.test(event.text));
  const narrationPlaying = window.__tourNarrationEvents.some((event) => event.phase === 'playing' && /社区/.test(event.text));
  const lifecycle = window.__tourLifecycle;
  const moveIndex = lifecycle.findIndex((event) => event.kind === 'move' && event.phase === 'moving' && event.step === 'community');
  const requestedIndex = lifecycle.findIndex((event) => event.kind === 'narration' && event.phase === 'requested' && event.step === 'community');
  const playingIndex = lifecycle.findIndex((event) => event.kind === 'narration' && event.phase === 'playing' && event.step === 'community');
  const replacementCancellationKeptStep = lifecycle.some((event) => event.kind === 'narration'
    && event.phase === 'cancelled' && event.step === 'meet-pet');
  const concurrentMovementAndSpeech = moveIndex >= 0 && requestedIndex > moveIndex && playingIndex > requestedIndex
    && api.snapshot().pet.phase === 'moving';
  const guideDoesNotInterceptClicks = getComputedStyle(document.getElementById('petAssistantCharacter')).pointerEvents === 'none';
  await wait(360);
  const arrivedRect = document.getElementById('petAssistant').getBoundingClientRect();
  const communityRect = community.getBoundingClientRect();
  const viewportSafe = arrivedRect.left >= 10 && arrivedRect.top >= 10
    && arrivedRect.right <= innerWidth - 10 && arrivedRect.bottom <= innerHeight - 10;
  const separatedFromTarget = Math.min(arrivedRect.right, communityRect.right) <= Math.max(arrivedRect.left, communityRect.left)
    || Math.min(arrivedRect.bottom, communityRect.bottom) <= Math.max(arrivedRect.top, communityRect.top);
  const arrivedBesideTarget = api.snapshot().pet.phase === 'arrived' && viewportSafe && separatedFromTarget;
  api.skip();
  await wait(20);
  const narrationCancelled = window.__tourNarrationEvents.some((event) => event.phase === 'cancelled' && /社区/.test(event.text));
  const marker = JSON.parse(localStorage.getItem(api.storageKey('browser-fe')) || 'null');
  await wait(540);
  const returnedRect = document.getElementById('petAssistant').getBoundingClientRect();
  const returnedToOrigin = Math.hypot(returnedRect.left - originRect.left, returnedRect.top - originRect.top) < 2
    && !document.getElementById('petAssistant').classList.contains('is-pet-tour-guide');
  window.dispatchEvent(new CustomEvent('fe-monster-community-profile', { detail: {
    loggedIn: true,
    hasCommunityIdentity: true,
    isNewRegistration: true,
    profile: { feId: 'browser-fe', registeredAt: new Date().toISOString() }
  }}));
  await wait(1800);
  const stayedComplete = !api.active;
  window.matchMedia = () => ({ matches: true });
  const replayed = api.replay();
  await wait(60);
  const replayActive = api.active;
  api.next();
  await wait(20);
  const reducedMotionSettledImmediately = api.snapshot().reducedMotion === true
    && api.snapshot().pet.phase === 'arrived';
  api.stop('skipped');
  await wait(20);
  window.matchMedia = () => ({ matches: false });
  const narrationPacedStart = api.start({ auto: true, resume: false, feId: 'narration-paced-fe' });
  await wait(7000);
  const autoHeldForNarration = api.snapshot().step === 0;
  window.__finishTourNarration?.();
  await wait(60);
  const autoAdvancedAfterNarration = api.snapshot().step === 1;
  api.stop('skipped');
  await wait(20);
  window.__tourNarrationMode = 'fallback';
  const fallbackLifecycleStart = window.__tourLifecycle.length;
  const fallbackStart = api.start({ auto: false, resume: false, feId: 'fallback-fe' });
  await wait(30);
  const fallbackLifecycle = window.__tourLifecycle.slice(fallbackLifecycleStart)
    .filter((event) => event.kind === 'narration' && event.step === 'meet-pet');
  const fallbackReported = fallbackLifecycle.some((event) => event.phase === 'fallback');
  const fallbackNeverReportedPlaying = !fallbackLifecycle.some((event) => event.phase === 'playing' || event.phase === 'ended');
  api.stop('skipped');
  const result = {
    started, firstTarget, ringVisible, clicked, highlighted, spoke, movedBesideTarget,
    narrationRequested, narrationPlaying, narrationCancelled, concurrentMovementAndSpeech,
    replacementCancellationKeptStep,
    guideDoesNotInterceptClicks, returnedToOrigin, reducedMotionSettledImmediately,
    arrivedBesideTarget,
    narrationPacedStart, autoHeldForNarration, autoAdvancedAfterNarration,
    fallbackStart, fallbackReported, fallbackNeverReportedPlaying,
    marker, stayedComplete, replayed, replayActive
  };
  document.body.dataset.tourResult = encodeURIComponent(JSON.stringify(result));
})();
</script></body></html>`;

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    response.end(fixture);
    return;
  }
  const file = path.resolve(webRoot, decodeURIComponent(url.pathname.slice(1)));
  if (!file.startsWith(`${webRoot}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': file.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8',
    'cache-control': 'no-store'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;
try {
  const run = await new Promise((resolve, reject) => {
    const child = spawn(edge, [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-background-networking',
    `--user-data-dir=${tempRoot}`,
    '--dump-dom',
    '--virtual-time-budget=12000',
    `http://127.0.0.1:${port}/`
    ], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`Edge product-tour fixture timed out:\n${stderr.slice(-1200)}`));
    }, 20_000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('close', (status) => {
      clearTimeout(timeout);
      resolve({ status, stdout, stderr });
    });
  });
  assert.equal(run.status, 0, run.stderr || 'Edge product-tour fixture failed');
  const encoded = run.stdout.match(/data-tour-result="([^"]+)"/)?.[1];
  assert.ok(encoded, `browser fixture did not return tour metrics:\n${run.stdout.slice(-1200)}`);
  const result = JSON.parse(decodeURIComponent(encoded.replaceAll('&amp;', '&')));
  assert.equal(result.started, true);
  assert.equal(result.firstTarget, true);
  assert.equal(result.ringVisible, true);
  assert.equal(result.clicked, true, 'the pet must activate the safe community navigation button');
  assert.equal(result.highlighted, true, 'the clicked button must remain visibly highlighted for its step');
  assert.equal(result.spoke, true, 'the real pet bubble seam must receive the Chinese explanation');
  assert.equal(result.movedBesideTarget, true, 'the pet must visibly leave its origin and move beside the highlighted target');
  assert.equal(result.narrationRequested, true, 'each step must enter the pet narration/TTS path with matching copy');
  assert.equal(result.narrationPlaying, true, 'movement must overlap an observable narration playback lifecycle');
  assert.equal(result.narrationCancelled, true, 'skip must cancel in-flight narration instead of allowing overlapping audio');
  assert.equal(result.concurrentMovementAndSpeech, true,
    'the ordered lifecycle must highlight, start moving, request narration and play it before arrival');
  assert.equal(result.replacementCancellationKeptStep, true,
    'replacing narration must report cancellation against the narration being replaced');
  assert.equal(result.guideDoesNotInterceptClicks, true,
    'the travelling pet must stay click-through while its safe scripted click still works');
  assert.equal(result.arrivedBesideTarget, true,
    'the pet must finish inside the viewport beside, rather than over, the highlighted control');
  assert.equal(result.returnedToOrigin, true, 'skip must smoothly return the pet to its exact origin and clean guide styles');
  assert.equal(result.reducedMotionSettledImmediately, true,
    'replay must honor reduced motion and settle movement without a long transition');
  assert.equal(result.narrationPacedStart, true);
  assert.equal(result.autoHeldForNarration, true,
    'automatic steps must not cut off narration on the old fixed display timer');
  assert.equal(result.autoAdvancedAfterNarration, true,
    'automatic steps must advance promptly after the active narration finishes');
  assert.equal(result.fallbackStart, true);
  assert.equal(result.fallbackReported, true,
    'a text-only narrate outcome must report fallback to the tour lifecycle');
  assert.equal(result.fallbackNeverReportedPlaying, true,
    'fallback must never masquerade as audible playing or completed speech');
  assert.equal(result.marker.status, 'completed', 'skip must prevent another automatic run for the same FE ID');
  assert.equal(result.stayedComplete, true, 'repeated new-registration signals must honor the local completion marker');
  assert.equal(result.replayed, true, 'the user must always be able to replay from settings');
  assert.equal(result.replayActive, true);
  console.log('Pet product tour browser checks passed');
} finally {
  server.close();
  rmSync(tempRoot, { recursive: true, force: true });
}
