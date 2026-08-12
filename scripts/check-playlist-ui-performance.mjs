import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  readFileSync,
  rmSync
} from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const profile = path.resolve('artifacts', `.tmp-playlist-ui-performance-${process.pid}`);
const songCount = 300;
const focusSwitchCount = 120;
const wheelSwitchCount = 120;
const thresholds = Object.freeze({
  maxInitialSynchronousMs: 160,
  maxInitialSettledMs: 240,
  maxFocusAverageMs: 4,
  maxFocusP95Ms: 8,
  maxFocusSingleMs: 32,
  maxCreatedButtonsDuringFocus: 0,
  maxVisibleSongButtons: 15,
  maxSongButtonDomCount: 15,
  maxSongStackDescendants: 15 * 10 + 8,
  maxImageDomCount: 15,
  maxInitialUniqueCoverRequests: 20
});
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp'],
  ['.woff2', 'font/woff2']
]);
const transparentPixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF'
    + 'gAI/1yP+WQAAAABJRU5ErkJggg==',
  'base64'
);
const requestedFixtureCovers = new Set();
let fixtureCoverRequestCount = 0;

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname === '/api/cover') {
    const source = url.searchParams.get('url') || '';
    if (source.includes('qa-song-cover-')) {
      fixtureCoverRequestCount += 1;
      requestedFixtureCovers.add(source);
    }
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'image/png',
      'content-length': String(transparentPixel.length)
    });
    response.end(transparentPixel);
    return;
  }
  if (url.pathname === '/__qa/cover-count') {
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify({
      total: fixtureCoverRequestCount,
      unique: requestedFixtureCovers.size
    }));
    return;
  }
  if (url.pathname.startsWith('/api/')) {
    const payload = url.pathname === '/api/player/state'
      ? { queue: [], queueIndex: -1, position: 0, duration: 0, playing: false, volume: 0.8 }
      : {};
    response.writeHead(200, {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8'
    });
    response.end(JSON.stringify(payload));
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const componentAsset = requestedPath.startsWith('/components/');
  const staticRoot = componentAsset ? componentsRoot : webRoot;
  const relativePath = componentAsset
    ? requestedPath.slice('/components/'.length)
    : requestedPath.slice(1);
  const filePath = path.resolve(staticRoot, decodeURIComponent(relativePath));
  if (!filePath.startsWith(`${staticRoot}${path.sep}`) || !existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase())
      || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') {
  server.close();
  throw new Error('Playlist performance fixture server did not bind to a TCP port');
}
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], {
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true
});
let browserStderr = '';
browser.stderr?.on('data', (chunk) => {
  browserStderr += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(
        readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0],
        10
      );
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(
    `Edge debugging endpoint did not start (exit ${browser.exitCode ?? 'running'}): `
      + browserStderr.trim()
  );
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {
      // Edge is still starting.
    }
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not become reachable');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression, awaitPromise = false) {
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(
      result.exceptionDetails.exception?.description
        || result.exceptionDetails.text
        || 'Browser evaluation failed'
    );
  }
  return result.result?.value;
}

async function waitFor(expression, timeout = 15000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(80);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const debugPort = await activeDebugPort();
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  if (!page?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');

  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  });
  await command('Page.navigate', {
    url: `${baseUrl}/?playlist-ui-performance=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof renderPlaylistShelf === 'function'
    && typeof setSongFocus === 'function'
    && typeof scheduleSongFocusFromWheel === 'function'
    && document.getElementById('playlistSongStack')
    && document.getElementById('playlistShelfStage')`);

  const browserResult = await evaluate(`(async () => {
    const thresholds = ${JSON.stringify(thresholds)};
    const songCount = ${songCount};
    const songs = Array.from({ length: songCount }, (_, index) => ({
      id: 'qa-song-' + index,
      title: 'Playlist performance song ' + String(index + 1).padStart(3, '0'),
      artist: 'FE Monster QA',
      album: '300 song fixture',
      provider: 'netease',
      duration: 180 + index % 120,
      cover: 'https://qa.invalid/qa-song-cover-' + index + '.png'
    }));
    const playlist = {
      id: 'qa-playlist-300',
      name: '300 song performance fixture',
      creator: 'FE Monster QA',
      provider: 'netease',
      trackCount: songCount
    };
    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    state.playbackPage = true;
    state.diyPreset = 'wallpaper';
    state.textPreset = 'none';
    state.currentSong = null;
    state.songFocusIndex = 0;

    const initialStartedAt = performance.now();
    renderPlaylistShelf(playlist, songs);
    const stack = document.getElementById('playlistSongStack');
    const stage = document.getElementById('playlistShelfStage');
    const initialSongButtons = new Set(stack.querySelectorAll('.shelf-song-button'));
    stack.getBoundingClientRect();
    const initialSynchronousMs = performance.now() - initialStartedAt;
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    stage.getBoundingClientRect();
    const initialSettledMs = performance.now() - initialStartedAt;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const initialCoverRequests = await fetch('/__qa/cover-count', {
      cache: 'no-store'
    }).then((response) => response.json());

    const originalSetSongFocus = setSongFocus;
    const originalCreateShelfSongButton = createShelfSongButton;
    const focusDurations = [];
    const directDurations = [];
    const wheelDurations = [];
    const steadyFocusDurations = [];
    const recycledWindowDurations = [];
    const accessibilityProbes = [];
    let probeMode = 'direct';
    let createdButtonsDuringFocus = 0;
    createShelfSongButton = (...args) => {
      createdButtonsDuringFocus += 1;
      return originalCreateShelfSongButton(...args);
    };
    setSongFocus = (...args) => {
      const previousFirstIndex = Number(state.songButtonCache[0]?.dataset.songIndex);
      const startedAt = performance.now();
      const value = originalSetSongFocus(...args);
      const focused = state.songButtonCache.find(
        (button) => Number(button.dataset.songIndex) === state.songFocusIndex
      );
      focused?.getBoundingClientRect();
      if (focused) getComputedStyle(focused).transform;
      const duration = performance.now() - startedAt;
      focusDurations.push(duration);
      const nextFirstIndex = Number(state.songButtonCache[0]?.dataset.songIndex);
      (nextFirstIndex === previousFirstIndex ? steadyFocusDurations : recycledWindowDurations)
        .push(duration);
      (probeMode === 'wheel' ? wheelDurations : directDurations).push(duration);
      return value;
    };

    try {
      for (let index = 0; index < ${focusSwitchCount}; index += 1) {
        probeMode = 'direct';
        setSongFocus(state.songFocusIndex + 1, { focus: false });
      }
      for (let index = 0; index < ${wheelSwitchCount}; index += 1) {
        probeMode = 'wheel';
        stage.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true,
          cancelable: true,
          deltaY: 120
        }));
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      for (const targetIndex of [${songCount - 1}, 0, ${Math.floor(songCount / 2)}, 5]) {
        originalSetSongFocus(targetIndex, { focus: false });
        const pool = Array.from(stack.querySelectorAll('.shelf-song-button'));
        const selected = pool.filter((button) => button.getAttribute('aria-selected') === 'true');
        const tabbable = pool.filter((button) => button.tabIndex === 0);
        accessibilityProbes.push({
          targetIndex,
          selected: selected.map((button) => Number(button.dataset.songIndex)),
          tabbable: tabbable.map((button) => Number(button.dataset.songIndex)),
          selectedHidden: selected.some((button) => button.classList.contains('is-song-virtual-hidden')),
          tabbableHidden: tabbable.some((button) => button.classList.contains('is-song-virtual-hidden'))
        });
      }
    } finally {
      setSongFocus = originalSetSongFocus;
      createShelfSongButton = originalCreateShelfSongButton;
    }

    const summarize = (values) => {
      const sorted = [...values].sort((left, right) => left - right);
      const percentile = (ratio) => sorted[
        Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
      ] || 0;
      const average = values.reduce((sum, value) => sum + value, 0)
        / Math.max(1, values.length);
      return {
        samples: values.length,
        average: Number(average.toFixed(3)),
        p95: Number(percentile(0.95).toFixed(3)),
        max: Number((sorted[sorted.length - 1] || 0).toFixed(3))
      };
    };

    const buttons = Array.from(stack.querySelectorAll('.shelf-song-button'));
    const visibleButtons = buttons.filter(
      (button) => !button.classList.contains('is-song-virtual-hidden')
    );
    const hiddenButtons = buttons.filter(
      (button) => button.classList.contains('is-song-virtual-hidden')
    );
    const hiddenPaintStyles = hiddenButtons.map((button) => {
      const style = getComputedStyle(button);
      return {
        contentVisibility: style.contentVisibility,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        willChange: style.willChange,
        transitionDuration: style.transitionDuration,
        transitionsDisabled: style.transitionDuration
          .split(',')
          .every((duration) => (Number.parseFloat(duration) || 0) === 0)
      };
    });
    const images = Array.from(stack.querySelectorAll('.shelf-song-cover img'));
    const activeImageSources = images.filter((image) => image.hasAttribute('src'));
    const selectedButtons = buttons.filter(
      (button) => button.getAttribute('aria-selected') === 'true'
    );
    const focusStats = summarize(focusDurations);
    const directStats = summarize(directDurations);
    const wheelStats = summarize(wheelDurations);
    const steadyFocusStats = summarize(steadyFocusDurations);
    const recycledWindowStats = summarize(recycledWindowDurations);
    const checks = {
      unmountedSongsDoNotConsumeDom: buttons.length < songCount,
      songButtonDomBounded: buttons.length <= thresholds.maxSongButtonDomCount,
      songStackDescendantsBounded:
        stack.querySelectorAll('*').length <= thresholds.maxSongStackDescendants,
      imageDomBounded: images.length <= thresholds.maxImageDomCount,
      allSongCoversLazy: images.every((image) => image.loading === 'lazy'),
      activeWindowBounded: visibleButtons.length <= thresholds.maxVisibleSongButtons,
      hiddenItemsSkipPaint: hiddenButtons.length > 0
        && hiddenPaintStyles.every((style) => (
          style.contentVisibility === 'hidden'
          && style.visibility === 'hidden'
          && style.pointerEvents === 'none'
          && style.willChange === 'auto'
          && style.transitionsDisabled
        )),
      hiddenCoversNotRequestedInitially:
        Number(initialCoverRequests.unique) <= thresholds.maxInitialUniqueCoverRequests,
      noCanvasOrVideoPerSong:
        stack.querySelectorAll('canvas, video, iframe').length === 0,
      oneAccessibleSelection: selectedButtons.length === 1,
      jumpAndWrapKeepOneAccessibleSelection: accessibilityProbes.every((probe) => (
        probe.selected.length === 1
        && probe.selected[0] === probe.targetIndex
        && probe.tabbable.length === 1
        && probe.tabbable[0] === probe.targetIndex
        && probe.selectedHidden === false
        && probe.tabbableHidden === false
      )),
      reusesInitialSongButtonPool: buttons.every((button) => initialSongButtons.has(button)),
      focusCreatesNoSongButtons:
        createdButtonsDuringFocus <= thresholds.maxCreatedButtonsDuringFocus,
      allButtonsNamed: buttons.every((button) => (
        button.getAttribute('aria-label')?.trim()
        && button.getAttribute('role') === 'option'
      )),
      initialSynchronousWithinBudget:
        initialSynchronousMs <= thresholds.maxInitialSynchronousMs,
      initialSettledWithinBudget:
        initialSettledMs <= thresholds.maxInitialSettledMs,
      measuredAllFocusSwitches:
        focusStats.samples === ${focusSwitchCount + wheelSwitchCount}
        && directStats.samples === ${focusSwitchCount}
        && wheelStats.samples === ${wheelSwitchCount},
      focusAverageWithinBudget:
        focusStats.average <= thresholds.maxFocusAverageMs,
      focusP95WithinBudget:
        focusStats.p95 <= thresholds.maxFocusP95Ms,
      focusSingleWithinBudget:
        focusStats.max <= thresholds.maxFocusSingleMs
    };
    return {
      pass: Object.values(checks).every(Boolean),
      songCount,
      initialRenderMs: {
        synchronous: Number(initialSynchronousMs.toFixed(3)),
        settled: Number(initialSettledMs.toFixed(3))
      },
      focusUpdateMs: focusStats,
      createdButtonsDuringFocus,
      directFocusUpdateMs: directStats,
      wheelFocusUpdateMs: wheelStats,
      steadyFocusUpdateMs: steadyFocusStats,
      recycledWindowUpdateMs: recycledWindowStats,
      dom: {
        songButtons: buttons.length,
        descendants: stack.querySelectorAll('*').length,
        visibleSongButtons: visibleButtons.length,
        hiddenSongButtons: hiddenButtons.length,
        images: images.length,
        imagesWithSource: activeImageSources.length,
        canvasVideoOrIframe: stack.querySelectorAll('canvas, video, iframe').length
      },
      initialCoverRequests,
      hiddenPaintStyleSample: hiddenPaintStyles[0] || null,
      selectedSongIndex: state.songFocusIndex,
      accessibilityProbes,
      thresholds,
      checks
    };
  })()`, true);

  // Give lazy-loading a short opportunity to reveal accidental work for hidden covers.
  await delay(500);
  browserResult.coverRequests = {
    total: fixtureCoverRequestCount,
    unique: requestedFixtureCovers.size
  };
  browserResult.pass = Object.values(browserResult.checks).every(Boolean);
  process.stdout.write(`${JSON.stringify(browserResult, null, 2)}\n`);
  process.exitCode = browserResult.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  if (browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
  }
  server.close();
  await delay(250);
  const artifactRoot = `${path.resolve('artifacts')}${path.sep}`;
  if (profile.startsWith(artifactRoot) && existsSync(profile)) {
    try {
      rmSync(profile, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 200
      });
    } catch {
      // Edge can briefly retain profile locks after its process tree exits.
    }
  }
}
