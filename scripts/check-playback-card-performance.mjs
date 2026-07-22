import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const debugPort = 0;
const profile = path.resolve('artifacts', `.tmp-playback-performance-${process.pid}`);
const mimeTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webp', 'image/webp']
]);

if (!existsSync(edge)) throw new Error(`Microsoft Edge was not found: ${edge}`);

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end('{}');
    return;
  }

  const requestedPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const isComponentAsset = requestedPath.startsWith('/components/');
  const staticRoot = isComponentAsset ? componentsRoot : webRoot;
  const relativePath = isComponentAsset
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
    'content-type': mimeTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(filePath));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});

const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind to a TCP port');
const baseUrl = `http://127.0.0.1:${address.port}`;
const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserStderr = '';
browser.stderr?.on('data', (chunk) => {
  browserStderr += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

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
  throw new Error(
    `Edge debugging endpoint did not start (exit ${browser.exitCode ?? 'running'}): ${browserStderr.trim()}`
  );
}

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(
    `Edge debugging endpoint did not start (exit ${browser.exitCode ?? 'running'}): ${browserStderr.trim()}`
  );
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
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
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
  const liveDebugPort = await activeDebugPort();
  const targets = await retryJson(`http://127.0.0.1:${liveDebugPort}/json`);
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
    url: `${baseUrl}/?playback-performance-qa=${Date.now()}`
  });
  await waitFor(`document.readyState === 'complete'
    && typeof renderCurrent === 'function'
    && typeof renderManualProgress === 'function'
    && document.getElementById('qishuiPlaybackLyricPage')`);

  const result = await evaluate(`(async () => {
    const thresholds = {
      maxGlyphDomCount: 500,
      maxAverageMs: 4,
      maxP95Ms: 8,
      maxP99Ms: 16,
      maxFrameMs: 48,
      maxOver8MsFrames: 12
    };
    const lyricCount = 80;
    const sampleCount = 240;
    const lines = Array.from({ length: lyricCount }, (_, index) => ({
      time: index * 0.24,
      text: 'Performance lyric ' + String(index + 1).padStart(2, '0')
        + ' keeps every word clear while the playback card scrolls smoothly'
    }));
    const duration = lines[lines.length - 1].time + 0.24;
    const song = {
      id: 'qa-playback-card-performance',
      title: 'Playback card performance',
      artist: 'FE Monster QA',
      provider: 'local',
      source: 'local',
      localUrl: 'blob:qa-playback-card-performance',
      duration,
      position: 0,
      playing: true
    };

    const boot = document.getElementById('bootScreen');
    if (boot) boot.hidden = true;
    refreshPlayerState = async () => {};
    state.activeProvider = 'local';
    state.currentSong = song;
    state.queue = [song];
    state.queueIndex = 0;
    state.localQueueActive = true;
    state.playbackPage = true;
    state.diyPreset = 'wallpaper';
    state.textPreset = 'none';
    state.playerClock = {
      position: 0,
      duration,
      updatedAt: performance.now(),
      playing: false
    };
    updatePlaybackPageClass();
    renderCurrent(song);
    state.lyricSignature = lyricSignatureForSong(song);
    state.lyricLines = lines;
    state.lyricIndex = 0;
    updateQishuiPlaybackLyrics(lines[0].text, lines[1].text, 0);

    const card = document.getElementById('qishuiPlaybackCard');
    const page = document.getElementById('qishuiPlaybackLyricPage');
    if (!card || !page || card.hidden) throw new Error('Playback card did not become visible');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

    const glyphSelector = [
      '.book-lyric-glyph',
      '.book-lyric-base-glyph'
    ].join(',');
    const glyphDomCount = page.querySelectorAll(glyphSelector).length;
    const lyricLineDomCount = page.querySelectorAll('.qishui-playback-lyric-line').length;
    const durations = [];

    for (let frame = 0; frame < sampleCount; frame += 1) {
      await new Promise((resolve, reject) => {
        const timeout = window.setTimeout(
          () => reject(new Error('requestAnimationFrame stalled at sample ' + frame)),
          2000
        );
        requestAnimationFrame(() => {
          window.clearTimeout(timeout);
          const position = frame / Math.max(1, sampleCount - 1) * (duration - 0.001);
          state.playerClock.position = position;
          state.playerClock.duration = duration;
          state.playerClock.updatedAt = performance.now();
          state.playerClock.playing = true;
          const startedAt = performance.now();
          renderManualProgress(position, duration);
          card.getBoundingClientRect();
          page.getBoundingClientRect();
          durations.push(performance.now() - startedAt);
          resolve();
        });
      });
    }
    state.playerClock.playing = false;

    const sorted = [...durations].sort((left, right) => left - right);
    const percentile = (ratio) => sorted[
      Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))
    ] || 0;
    const average = durations.reduce((sum, value) => sum + value, 0)
      / Math.max(1, durations.length);
    const stats = {
      samples: durations.length,
      average: Number(average.toFixed(3)),
      p95: Number(percentile(0.95).toFixed(3)),
      p99: Number(percentile(0.99).toFixed(3)),
      max: Number((sorted[sorted.length - 1] || 0).toFixed(3)),
      over8ms: durations.filter((value) => value > 8).length
    };
    const checks = {
      renderedAllLyrics: lyricLineDomCount === lyricCount,
      glyphDomBounded: glyphDomCount <= thresholds.maxGlyphDomCount,
      averageWithinBudget: stats.average <= thresholds.maxAverageMs,
      p95WithinBudget: stats.p95 <= thresholds.maxP95Ms,
      p99WithinBudget: stats.p99 <= thresholds.maxP99Ms,
      maxWithinBudget: stats.max <= thresholds.maxFrameMs,
      over8msFramesWithinBudget: stats.over8ms <= thresholds.maxOver8MsFrames
    };
    return {
      pass: Object.values(checks).every(Boolean),
      lyricCount,
      lyricLineDomCount,
      glyphDomCount,
      frameUpdateMs: stats,
      thresholds,
      checks
    };
  })()`, true);

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.pass ? 0 : 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true
  });
  server.close();
  await delay(250);
  const artifactRoot = `${path.resolve('artifacts')}${path.sep}`;
  if (profile.startsWith(artifactRoot) && existsSync(profile)) {
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch {
      // Edge may keep transient profile locks for a moment after taskkill on Windows.
    }
  }
}
