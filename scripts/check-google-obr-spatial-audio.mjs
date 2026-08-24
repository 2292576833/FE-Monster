import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const profile = path.resolve('artifacts', `.tmp-google-obr-spatial-${process.pid}`);
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
  const requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const componentAsset = requestPath.startsWith('/components/');
  const root = componentAsset ? componentsRoot : webRoot;
  const relative = componentAsset ? requestPath.slice('/components/'.length) : requestPath.slice(1);
  const file = path.resolve(root, decodeURIComponent(relative));
  if (!file.startsWith(`${root}${path.sep}`) || !existsSync(file)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'cache-control': 'no-store',
    'content-type': mimeTypes.get(path.extname(file).toLowerCase()) || 'application/octet-stream'
  });
  response.end(readFileSync(file));
});

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('Test server did not bind');
const baseUrl = `http://127.0.0.1:${address.port}`;

const browser = spawn(edge, [
  '--headless=new',
  '--disable-gpu',
  '--autoplay-policy=no-user-gesture-required',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let browserError = '';
browser.stderr?.on('data', (chunk) => {
  browserError += String(chunk);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const pending = new Map();
let nextId = 1;
let socket;

async function activeDebugPort() {
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (existsSync(portFile)) {
      const port = Number.parseInt(readFileSync(portFile, 'utf8').split(/\r?\n/, 1)[0], 10);
      if (Number.isInteger(port) && port > 0) return port;
    }
    if (browser.exitCode !== null) break;
    await delay(100);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
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

async function waitFor(expression, timeout = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression, true)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

try {
  const port = await activeDebugPort();
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
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
  await command('Page.navigate', { url: `${baseUrl}/?google-obr-qa=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'
    && typeof setGoogleObrSpatialAudioEnabled === 'function'
    && typeof setGoogleObrChannelLayout === 'function'
    && document.getElementById('qishuiPlaybackObrToggle')`);

  const result = await evaluate(`(async () => {
    const button = document.getElementById('qishuiPlaybackObrToggle');
    const layoutButton = document.getElementById('qishuiPlaybackObrLayoutToggle');
    const controls = document.querySelector('.qishui-playback-view-controls');
    const card = document.getElementById('qishuiPlaybackCard');
    const audio = document.getElementById('audio');
    const errors = [];
    const check = (condition, message) => {
      if (!condition) errors.push(message);
    };
    const wait = async (predicate, timeout = 20000) => {
      const startedAt = performance.now();
      while (performance.now() - startedAt < timeout) {
        if (predicate()) return true;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      return false;
    };
    const createStereoTone = () => {
      const sampleRate = 48000;
      const frames = sampleRate * 10;
      const buffer = new ArrayBuffer(44 + frames * 4);
      const view = new DataView(buffer);
      const text = (offset, value) => {
        for (let index = 0; index < value.length; index += 1) {
          view.setUint8(offset + index, value.charCodeAt(index));
        }
      };
      text(0, 'RIFF');
      view.setUint32(4, 36 + frames * 4, true);
      text(8, 'WAVE');
      text(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 2, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * 4, true);
      view.setUint16(32, 4, true);
      view.setUint16(34, 16, true);
      text(36, 'data');
      view.setUint32(40, frames * 4, true);
      for (let frame = 0; frame < frames; frame += 1) {
        const left = Math.sin((2 * Math.PI * 220 * frame) / sampleRate) * 0.22;
        const right = Math.sin((2 * Math.PI * 330 * frame) / sampleRate) * 0.16;
        view.setInt16(44 + frame * 4, Math.round(left * 32767), true);
        view.setInt16(46 + frame * 4, Math.round(right * 32767), true);
      }
      return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    };

    check(button?.parentElement === controls, 'OBR toggle is not inside the playback top controls.');
    check(layoutButton?.parentElement === controls, 'OBR channel layout switch is missing from the playback top controls.');
    check(button?.getAttribute('aria-pressed') === 'false', 'OBR toggle must start unpressed.');
    check(state.obrSpatialAudio.requested === false, 'Official OBR must default off until the user enables it.');
    check(state.obrSpatialAudio.channelLayout === 'stereo', 'OBR must default to the stereo input layout.');
    check(
      browserAudioUrl('https://music.example/song.mp3').startsWith('/api/audio/stream?url='),
      'Remote audio is not routed through the same-origin stream proxy.'
    );
    check(browserAudioUrl('/audio/local.mp3') === '/audio/local.mp3', 'Same-origin audio was unnecessarily proxied.');

    const sourceUrl = createStereoTone();
    const previousSpatialBackend = state.clientRuntime.audioSpatialBackend;
    state.currentSong = {
      id: 'google-obr-runtime-probe',
      title: 'Google OBR runtime probe',
      artist: 'FE Monster QA',
      provider: 'local',
      source: 'local',
      localUrl: sourceUrl,
      duration: 3
    };
    audio.src = sourceUrl;
    audio.volume = 0.01;
    await audio.play();
    const enabled = await setGoogleObrSpatialAudioEnabled(true, { announce: false });
    const processed = await wait(
      () => state.obrSpatialAudio.graph?.processedBlocks > 1
        && state.obrSpatialAudio.processedBlocks > 1
        && state.obrSpatialAudio.outputRms > 0,
      20000
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    check(enabled === true, 'Official OBR toggle did not report enabled.');
    check(processed, 'Official OBR did not report non-zero processed PCM.');
    check(state.audioAnalysis.sourceMode === 'media', 'Audio did not use a single MediaElementSource path.');
    check(state.obrSpatialAudio.backend === 'google-obr-official', 'Backend is not official Google OBR.');
    check(
      state.obrSpatialAudio.revision === '478dc7c752d5eccae534635139ff0253eee3a14a',
      'Official OBR revision mismatch.'
    );
    check(button.getAttribute('aria-pressed') === 'true', 'aria-pressed changed before/after the wrong state.');
    check(
      state.clientRuntime.audioSpatialBackend === 'google-obr-official'
        && document.documentElement.dataset.audioSpatialBackend === 'google-obr-official',
      'Runtime diagnostics did not switch to the verified Google OBR backend.'
    );
    check(Number(state.obrSpatialAudio.graph?.dryGain?.gain?.value) < 0.05, 'Dry path remained audible after OBR activation.');
    check(Number(state.obrSpatialAudio.graph?.wetGain?.gain?.value) > 0.95, 'Official OBR wet path was not audible.');

    const fiveOneEnabled = await setGoogleObrChannelLayout('5.1', { announce: false });
    const fiveOneProcessed = await wait(
      () => state.obrSpatialAudio.enabled
        && state.obrSpatialAudio.graph?.channelLayout === '5.1'
        && state.obrSpatialAudio.graph?.inputChannelCount === 6
        && state.obrSpatialAudio.outputRms > 0,
      20000
    );
    check(fiveOneEnabled && fiveOneProcessed, 'Google OBR 5.1 virtual input layout did not become active.');
    check(layoutButton?.textContent.trim() === '5.1', 'OBR layout switch did not display 5.1.');

    const sevenOneEnabled = await setGoogleObrChannelLayout('7.1', { announce: false });
    const sevenOneProcessed = await wait(
      () => state.obrSpatialAudio.enabled
        && state.obrSpatialAudio.graph?.channelLayout === '7.1'
        && state.obrSpatialAudio.graph?.inputChannelCount === 8
        && state.obrSpatialAudio.outputRms > 0,
      20000
    );
    check(sevenOneEnabled && sevenOneProcessed, 'Google OBR 7.1 virtual input layout did not become active.');
    check(layoutButton?.textContent.trim() === '7.1', 'OBR layout switch did not display 7.1.');
    const storedPreference = JSON.parse(localStorage.getItem(GOOGLE_OBR_PREFS_KEY) || '{}');
    check(storedPreference.channelLayout === '7.1', 'OBR channel layout preference was not persisted.');

    const failureRecoveryCycles = [];
    for (let cycle = 0; cycle < 4; cycle += 1) {
      const failedGraph = state.obrSpatialAudio.graph;
      failedGraph.node.onprocessorerror?.();
      const immediateDry = Number(failedGraph.dryGain.gain.value);
      const immediateWet = Number(failedGraph.wetGain.gain.value);
      check(
        immediateDry > 0.99 && immediateWet < 0.01,
        'OBR failure cycle ' + (cycle + 1) + ' did not restore dry audio in the same quantum.'
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
      check(
        Number(failedGraph.dryGain.gain.value) > 0.95,
        'OBR failure cycle ' + (cycle + 1) + ' muted the dry path before recovery could reconnect.'
      );
      const recovered = await wait(
        () => state.obrSpatialAudio.enabled
          && state.obrSpatialAudio.graph
          && state.obrSpatialAudio.graph !== failedGraph
          && state.obrSpatialAudio.graph.channelLayout === '7.1'
          && state.obrSpatialAudio.graph.processedBlocks > 0,
        20000
      );
      check(recovered, 'Google OBR did not rebuild after failure cycle ' + (cycle + 1) + '.');
      failureRecoveryCycles.push({ cycle: cycle + 1, immediateDry, immediateWet, recovered });
    }

    await setGoogleObrSpatialAudioEnabled(false, { announce: false });
    await new Promise((resolve) => setTimeout(resolve, 150));
    const processedAfterDisable = state.obrSpatialAudio.processedBlocks;
    await ensureAudioAnalysis();
    await new Promise((resolve) => setTimeout(resolve, 750));
    check(button.getAttribute('aria-pressed') === 'false', 'OBR toggle did not clear aria-pressed.');
    check(state.obrSpatialAudio.requested === false, 'OBR remained requested after the user disabled it.');
    check(state.obrSpatialAudio.enabled === false, 'OBR reactivated while its switch was off.');
    check(!state.obrSpatialAudio.recoveryTimer, 'OBR recovery remained scheduled after the switch was turned off.');
    check(
      state.obrSpatialAudio.processedBlocks === processedAfterDisable,
      'OBR continued processing PCM after its switch was off.'
    );
    check(
      state.clientRuntime.audioSpatialBackend === previousSpatialBackend
        && document.documentElement.dataset.audioSpatialBackend === previousSpatialBackend,
      'Runtime diagnostics did not restore the previous spatial backend.'
    );
    check(Number(state.obrSpatialAudio.graph?.dryGain?.gain?.value) > 0.95, 'Dry path did not recover after disabling OBR.');
    check(Number(state.obrSpatialAudio.graph?.wetGain?.gain?.value) < 0.05, 'OBR wet path remained audible after disabling.');
    const disabledGraph = state.obrSpatialAudio.graph;
    disabledGraph.node.onprocessorerror?.();
    await new Promise((resolve) => setTimeout(resolve, 400));
    check(state.obrSpatialAudio.requested === false && state.obrSpatialAudio.enabled === false,
      'A late AudioWorklet failure re-enabled OBR after the user switched it off.');
    check(!state.obrSpatialAudio.recoveryTimer, 'A late AudioWorklet failure scheduled recovery while OBR was off.');

    check(
      typeof refreshNativeGoogleObrHealth === 'function',
      'Native OBR does not expose a continuous underrun health poll.'
    );
    let underrunFailures = [];
    let nativeLyricLatency = 0;
    if (typeof refreshNativeGoogleObrHealth === 'function') {
      const originalApiJson = apiJson;
      const originalFailGoogleObr = failGoogleObr;
      const previousGraph = state.obrSpatialAudio.graph;
      const previousEnabled = state.obrSpatialAudio.enabled;
      const previousRequested = state.obrSpatialAudio.requested;
      const fakeNativeGraph = {
        nativeStream: true,
        disposed: false,
        session: 77,
        generation: 9,
        context: state.audioAnalysis.context,
        nativeQueueUnderruns: 0,
        nativeOutputLatencySeconds: 0.1875,
        nativeClockOriginMediaTime: Number(audio.currentTime) || 0,
        nativeClockOriginConsumedFrames: 0,
        nativeLastMediaTime: Number(audio.currentTime) || 0
      };
      state.obrSpatialAudio.graph = fakeNativeGraph;
      state.obrSpatialAudio.enabled = true;
      state.obrSpatialAudio.requested = true;
      apiJson = async (url) => String(url) === '/api/audio/spatial/status'
        ? {
            active: true,
            session: 77,
            generation: 9,
            running: true,
            sampleRate: 48000,
            buffersQueued: 20,
            buffersConsumed: 1,
            droppedBuffers: 0,
            bufferPoolExhaustions: 0,
            lastResult: 0,
            queueUnderruns: 1,
            prerollTargetBuffers: 24
          }
        : {};
      failGoogleObr = (error, options = {}) => {
        underrunFailures.push({
          message: String(error?.message || error),
          sameGraph: options.graph === fakeNativeGraph
        });
        return false;
      };
      nativeLyricLatency = lyricAudioOutputLatencySeconds();
      await refreshNativeGoogleObrHealth();
      apiJson = originalApiJson;
      failGoogleObr = originalFailGoogleObr;
      state.obrSpatialAudio.graph = previousGraph;
      state.obrSpatialAudio.enabled = previousEnabled;
      state.obrSpatialAudio.requested = previousRequested;
    }
    check(
      underrunFailures.length === 1
        && underrunFailures[0].sameGraph
        && /underrun/i.test(underrunFailures[0].message),
      'A native XAudio2 queue underrun did not trigger controlled OBR fallback.'
    );
    check(
      Math.abs(nativeLyricLatency - 0.1875) < 0.0001,
      'Native OBR lyrics did not use the measured native output latency.'
    );

    card.classList.add('is-user-hidden');
    check(getComputedStyle(button).display === 'none', 'Collapsed playback card still exposes the OBR toggle.');
    card.classList.remove('is-user-hidden');
    audio.pause();
    URL.revokeObjectURL(sourceUrl);

    return {
      errors,
      backend: state.obrSpatialAudio.backend,
      revision: state.obrSpatialAudio.revision,
      processedBlocks: state.obrSpatialAudio.processedBlocks,
      inputRms: state.obrSpatialAudio.inputRms,
      outputRms: state.obrSpatialAudio.outputRms,
      failureRecoveryCycles,
      underrunFailures,
      nativeLyricLatency
    };
  })()`, true);

  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.equal(result.backend, 'google-obr-official');
  assert.ok(result.processedBlocks > 0);
  assert.ok(result.inputRms > 0);
  assert.ok(result.outputRms > 0);
  console.log(`Google OBR spatial audio PASS ${JSON.stringify(result)}`);
} finally {
  try {
    if (socket?.readyState === 1) {
      await Promise.race([
        command('Browser.close').catch(() => {}),
        delay(1000)
      ]);
    }
  } catch {
  }
  try {
    socket?.close();
  } catch {
  }
  if (browser.exitCode === null) {
    browser.kill();
    await Promise.race([
      new Promise((resolve) => browser.once('exit', resolve)),
      delay(5000)
    ]);
  }
  await new Promise((resolve) => server.close(resolve));
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
