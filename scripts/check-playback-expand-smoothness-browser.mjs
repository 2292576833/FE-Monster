import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const componentsRoot = path.join(root, 'components');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(root, '.tmp', `playback-expand-smoothness-${process.pid}`);
const debugPort = 43000 + Math.floor(Math.random() * 1500);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const mime = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);

assert.ok(existsSync(edge), `Microsoft Edge was not found: ${edge}`);
mkdirSync(profile, { recursive: true });

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const component = requested.startsWith('/components/');
  const base = component ? componentsRoot : webRoot;
  const relative = component ? requested.slice('/components/'.length) : requested.slice(1);
  const file = path.resolve(base, decodeURIComponent(relative));
  if (!file.startsWith(`${base}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mime.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-allow-origins=*',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });

let socket;
let nextId = 1;
const pending = new Map();

async function retryJson(url, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(600) });
      if (response.ok) return response.json();
    } catch {}
    await delay(80);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

function command(method, params = {}, timeout = 20_000) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`${method} timed out`));
    }, timeout);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function runScenario({ deviceScaleFactor, reducedMotion }) {
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor,
    mobile: false,
    screenWidth: 1280,
    screenHeight: 800
  });
  await command('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }]
  });
  await command('Page.navigate', {
    url: `http://127.0.0.1:${port}/?playback-expand-smoothness=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof setQishuiPlaybackExpanded === 'function'
    && document.getElementById('qishuiPlaybackPhone')`);

  return evaluate(`(async () => {
    const shell = document.querySelector('.app-shell');
    const card = document.getElementById('qishuiPlaybackCard');
    const phone = document.getElementById('qishuiPlaybackPhone');
    const lyricPage = document.getElementById('qishuiPlaybackLyricPage');
    document.getElementById('bootScreen')?.setAttribute('hidden', '');
    shell.className = 'app-shell is-playback-page has-qishui-playback-card';
    card.hidden = false;
    state.playbackPage = true;
    state.qishuiPlaybackCard.hiddenByUser = false;
    state.qishuiPlaybackCard.expanded = false;
    syncQishuiPlaybackExpansion();
    lyricPage.innerHTML = '<button class="qishui-playback-lyric-line is-current is-scroll-arrived"><span class="book-lyric-line-text">展开前歌词</span></button>';
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    // Exclude first-use style/JIT work from the user-triggered motion sample.
    // The measured cycle below still exercises the production public toggle.
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setQishuiPlaybackExpanded(true);
      await new Promise((resolve) => setTimeout(resolve, PLAYBACK_CARD_EXPANSION_TRANSITION_MS + 40));
      setQishuiPlaybackExpanded(false);
      await new Promise((resolve) => setTimeout(resolve, PLAYBACK_CARD_EXPANSION_TRANSITION_MS + 40));
    }

    const longTasks = [];
    const shifts = [];
    const observers = [];
    if (PerformanceObserver.supportedEntryTypes.includes('longtask')) {
      const observer = new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)));
      observer.observe({ type: 'longtask' });
      observers.push(observer);
    }
    if (PerformanceObserver.supportedEntryTypes.includes('layout-shift')) {
      const observer = new PerformanceObserver((list) => shifts.push(...list.getEntries()
        .filter((entry) => !entry.hadRecentInput)
        .map((entry) => ({
          value: entry.value,
          external: entry.sources.some((source) => source.node && source.node !== card && !card.contains(source.node))
        }))));
      observer.observe({ type: 'layout-shift' });
      observers.push(observer);
    }

    const rect = () => {
      const value = phone.getBoundingClientRect();
      return { left: value.left, right: value.right, width: value.width };
    };
    const capture = async (expanded) => {
      const start = rect();
      const startedAt = performance.now();
      setQishuiPlaybackExpanded(expanded);
      const immediate = rect();
      const samples = [{ time: 0, ...immediate }];
      let lyricSwitched = false;
      while (performance.now() - startedAt < 620) {
        await new Promise(requestAnimationFrame);
        const time = performance.now() - startedAt;
        if (!lyricSwitched && time >= 120) {
          lyricPage.querySelector('.book-lyric-line-text').textContent = expanded
            ? '展开过程中切换歌词，保持清晰稳定'
            : '还原过程中切换歌词，保持清晰稳定';
          scheduleQishuiPlaybackLyricLayout();
          lyricSwitched = true;
        }
        samples.push({ time, ...rect() });
      }
      const finish = rect();
      const total = Math.abs(finish.width - start.width);
      const expectedDirection = expanded ? 1 : -1;
      const widthSteps = samples.slice(1).map((sample, index) => sample.width - samples[index].width);
      const backwardsFrames = widthSteps.filter((step) => step * expectedDirection < -0.8).length;
      const maxStep = Math.max(0, ...widthSteps.map(Math.abs));
      const distinctWidths = new Set(samples.map((sample) => Math.round(sample.width * 2) / 2)).size;
      const maxRightDrift = Math.max(...samples.map((sample) => Math.abs(sample.right - start.right)));
      const frameIntervals = samples.slice(1).map((sample, index) => sample.time - samples[index].time);
      const orderedIntervals = [...frameIntervals].sort((left, right) => left - right);
      const percentile = (ratio) => orderedIntervals[
        Math.min(orderedIntervals.length - 1, Math.max(0, Math.ceil(orderedIntervals.length * ratio) - 1))
      ] || 0;
      return {
        start,
        immediate,
        finish,
        samples: samples.length,
        distinctWidths,
        backwardsFrames,
        maxStep: Number(maxStep.toFixed(3)),
        maxNormalizedStep: Number((maxStep / Math.max(total, 1)).toFixed(3)),
        maxRightDrift: Number(maxRightDrift.toFixed(3)),
        frameTiming: {
          average: Number((frameIntervals.reduce((sum, value) => sum + value, 0) / Math.max(frameIntervals.length, 1)).toFixed(2)),
          p95: Number(percentile(0.95).toFixed(2)),
          max: Number(Math.max(0, ...frameIntervals).toFixed(2))
        },
        cardFinalTransform: getComputedStyle(card).transform,
        phoneFinalTransform: getComputedStyle(phone).transform,
        lyricText: lyricPage.textContent.trim(),
        activeAnimations: phone.getAnimations({ subtree: true })
          .filter((animation) => animation.id?.startsWith('fe-qishui-playback-expand-')).length
      };
    };

    const expand = await capture(true);
    const collapse = await capture(false);
    setQishuiPlaybackExpanded(true);
    await new Promise((resolve) => setTimeout(resolve, 140));
    const reversalBefore = rect();
    setQishuiPlaybackExpanded(false);
    const reversalImmediate = rect();
    const reversalSamples = [{ time: 0, ...reversalImmediate }];
    const reversalStartedAt = performance.now();
    while (performance.now() - reversalStartedAt < 620) {
      await new Promise(requestAnimationFrame);
      reversalSamples.push({ time: performance.now() - reversalStartedAt, ...rect() });
    }
    const reversalFinish = rect();
    const reversalSteps = reversalSamples.slice(1).map((sample, index) => sample.width - reversalSamples[index].width);
    const reversal = {
      before: reversalBefore,
      immediate: reversalImmediate,
      finish: reversalFinish,
      continuityError: Number(Math.abs(reversalImmediate.width - reversalBefore.width).toFixed(3)),
      backwardsFrames: reversalSteps.filter((step) => step > 0.8).length,
      distinctWidths: new Set(reversalSamples.map((sample) => Math.round(sample.width * 2) / 2)).size,
      maxRightDrift: Number(Math.max(...reversalSamples.map((sample) => Math.abs(sample.right - reversalBefore.right))).toFixed(3))
    };
    await new Promise((resolve) => setTimeout(resolve, 80));
    observers.forEach((observer) => observer.disconnect());
    const cls = shifts.reduce((sum, entry) => sum + entry.value, 0);
    const externalCls = shifts
      .filter((entry) => entry.external)
      .reduce((sum, entry) => sum + entry.value, 0);
    return {
      devicePixelRatio,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      expand,
      collapse,
      reversal,
      cls: Number(cls.toFixed(5)),
      externalCls: Number(externalCls.toFixed(5)),
      longTasks: longTasks.map((value) => Number(value.toFixed(2))),
      maxLongTask: Number(Math.max(0, ...longTasks).toFixed(2))
    };
  })()`);
}

function motionChecks(result) {
  return {
    expandStartsAtPreviousVisualWidth: Math.abs(result.expand.immediate.width - result.expand.start.width) <= 1.25,
    collapseStartsAtPreviousVisualWidth: Math.abs(result.collapse.immediate.width - result.collapse.start.width) <= 1.25,
    expandsAcrossFrames: result.expand.distinctWidths >= 5,
    collapsesAcrossFrames: result.collapse.distinctWidths >= 5,
    expandRightEdgeLocked: result.expand.maxRightDrift <= 1.25,
    collapseRightEdgeLocked: result.collapse.maxRightDrift <= 1.25,
    monotonic: result.expand.backwardsFrames === 0 && result.collapse.backwardsFrames === 0,
    lyricsSurviveSwitch: result.expand.lyricText.includes('展开过程中')
      && result.collapse.lyricText.includes('还原过程中'),
    nativeTextRestored: result.expand.phoneFinalTransform === 'none'
      && result.collapse.phoneFinalTransform === 'none',
    surfaceTransformRestored: [result.expand.cardFinalTransform, result.collapse.cardFinalTransform]
      .every((value) => value === 'none' || value === 'matrix(1, 0, 0, 1, 0, 0)'),
    reversalIsContinuous: result.reversal.continuityError <= 1.25,
    reversalSettlesCompact: Math.abs(result.reversal.finish.width - result.collapse.finish.width) <= 1.25,
    reversalStaysMonotonic: result.reversal.backwardsFrames === 0,
    reversalRightEdgeLocked: result.reversal.maxRightDrift <= 1.25,
    reversalRunsAcrossFrames: result.reversal.distinctWidths >= 4,
    noExternalLayoutShift: result.externalCls <= 0.001
  };
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((entry) => entry.type === 'page' && entry.url === 'about:blank')
    || targets.find((entry) => entry.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'Edge page target missing');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);

  const dpr1 = await runScenario({ deviceScaleFactor: 1, reducedMotion: false });
  const dpr2 = await runScenario({ deviceScaleFactor: 2, reducedMotion: false });
  const reduced = await runScenario({ deviceScaleFactor: 1, reducedMotion: true });
  const checks = {
    dpr1: motionChecks(dpr1),
    dpr2: motionChecks(dpr2),
    reducedMotionSettlesImmediately: reduced.expand.distinctWidths <= 2
      && reduced.collapse.distinctWidths <= 2
      && reduced.expand.activeAnimations === 0
      && reduced.collapse.activeAnimations === 0
  };
  const pass = Object.values(checks.dpr1).every(Boolean)
    && Object.values(checks.dpr2).every(Boolean)
    && checks.reducedMotionSettlesImmediately;
  console.log(JSON.stringify({ pass, checks, dpr1, dpr2, reduced }, null, 2));
  process.exitCode = pass ? 0 : 1;
} finally {
  try { socket?.close(); } catch {}
  browser.kill();
  server.close();
  await delay(180);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
