import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const webRoot = path.resolve('web');
const componentsRoot = path.resolve('components');
const profile = path.resolve('artifacts', `.tmp-community-listen-${process.pid}`);
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
    if (message.method === 'Runtime.consoleAPICalled') {
      const values = (message.params?.args || []).map((argument) => argument.value).filter((value) => value !== undefined);
      if (String(values[0] || '').startsWith('FE_COMMUNITY_QA:')) console.log(...values);
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await Promise.all([command('Page.enable'), command('Runtime.enable')]);
  await command('Page.navigate', { url: `${baseUrl}/?community-listen-qa=${Date.now()}` });
  await waitFor(`document.readyState === 'complete'
    && typeof applyCommunityListenSync === 'function'
    && typeof leaveCommunityListen === 'function'
    && typeof communityApiJson === 'function'
    && typeof checkCommunityEventHeartbeat === 'function'
    && typeof setCommunityDanmakuComposerOpen === 'function'
    && typeof sendCommunityDanmaku === 'function'
    && typeof showCommunityDanmakuBubble === 'function'
    && typeof scheduleCommunityDanmakuRepulsion === 'function'
    && typeof setListenMiniCollapsed === 'function'
    && typeof setGoogleObrSpatialAudioEnabled === 'function'`);

  const result = await evaluate(`(async () => {
    const qaStage = (stage) => console.log('FE_COMMUNITY_QA:' + stage);
    qaStage('setup');
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
      const frames = sampleRate * 4;
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
        view.setInt16(44 + frame * 4, Math.round(Math.sin(2 * Math.PI * 220 * frame / sampleRate) * 6000), true);
        view.setInt16(46 + frame * 4, Math.round(Math.sin(2 * Math.PI * 330 * frame / sampleRate) * 5000), true);
      }
      return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
    };

    clearBackgroundPolling();
    const playableUrl = createStereoTone();
    const badSong = { id: 'vip-no-source', title: 'VIP unavailable', artist: 'QA', provider: 'netease', duration: 180, position: 19, playing: true };
    const secondBadSong = { id: 'expired-source', title: 'Expired source', artist: 'QA', provider: 'netease', duration: 160 };
    const goodSong = { id: 'playable-spatial', title: 'Playable spatial', artist: 'QA', provider: 'netease', duration: 4 };
    const originalSharedScene = communitySharedSceneSnapshot();
    const originalVisualPreferences = localStorage.getItem(VISUAL_SETTINGS_PREFS_KEY);
    const originalSonicPreferences = localStorage.getItem(SONIC_SETTINGS_PREFS_KEY);
    const initialSharedScene = {
      preset: 'lyric',
      textPreset: 'depth',
      lyricBrightness: 1.31,
      lyricSpeed: 1.07,
      cubeIntensity: 1.22,
      sonic: { ...normalizeSonicSettings(state.sonicTopography.settings), fluorescence: 1.14 },
      freeCube: { mode: 'free', backgroundEnabled: true },
      chladniMode: 'cube',
      storm: { lightingMode: 'sunset', weatherMode: 'auto' },
      coverParticle: { backgroundEnabled: true, motionAmplitude: 0.8, floatSpeed: 1 }
    };
    const session = {
      id: 'listen-session-qa',
      song: badSong,
      scene: initialSharedScene,
      sceneRevision: 1,
      members: [{ feId: '10000001' }, { feId: '10000002' }]
    };
    const requests = [];
    const listeningRequestBodies = [];
    let nextAttempt = 0;
    let serverSceneRevision = 2;
    const sceneRequestBodies = [];
    let releaseFirstSceneRequest;
    const firstSceneRequestGate = new Promise((resolve) => { releaseFirstSceneRequest = resolve; });
    let resolveLeave;
    const leaveGate = new Promise((resolve) => { resolveLeave = resolve; });
    const originalApiJson = apiJson;
    apiJson = async (url, options = {}) => {
      requests.push(String(url));
      if (String(url).startsWith('/api/player/load')) return { playable: false, url: '', error: 'VIP or no source' };
      if (url === '/api/player/next') {
        nextAttempt += 1;
        if (nextAttempt === 1) return { playable: false, url: '', song: secondBadSong, error: 'expired source' };
        return { playable: true, url: playableUrl, song: goodSong, quality: 'standard' };
      }
      if (String(url).startsWith('/api/community/listen/leave')) {
        await leaveGate;
        return { ok: true, state: { sessions: [], incoming: [] } };
      }
      if (String(url).startsWith('/api/community/listen/scene')) {
        const body = JSON.parse(options.body || '{}');
        sceneRequestBodies.push(body);
        if (sceneRequestBodies.length === 1) await firstSceneRequestGate;
        serverSceneRevision += 1;
        return {
          ok: true,
          session: { ...session, scene: body.scene, sceneRevision: serverSceneRevision, sceneUpdatedBy: '10000002' }
        };
      }
      if (String(url).startsWith('/api/community/listening')) {
        listeningRequestBodies.push(JSON.parse(options.body || '{}'));
        return { ok: true, syncedSessions: [] };
      }
      return { ok: true };
    };

    state.community.profile = { feId: '10000002' };
    state.community.activeSession = session;
    state.queue = [badSong, secondBadSong, goodSong];
    state.queueIndex = 0;
    qaStage('enable-obr');
    await setGoogleObrSpatialAudioEnabled(true, { announce: false });
    qaStage('sync-unavailable');
    await applyCommunityListenSync({ session, song: badSong, sourceId: '10000001' });
    check(Math.abs(state.lyricBrightness - 1.31) < 0.001,
      'Joining together-listen did not apply the canonical shared scene.');
    check(localStorage.getItem(VISUAL_SETTINGS_PREFS_KEY) === originalVisualPreferences
      && localStorage.getItem(SONIC_SETTINGS_PREFS_KEY) === originalSonicPreferences,
      'Applying the shared scene overwrote persistent local scene preferences.');
    const sceneRequestsBeforeRemote = requests.filter((url) => url.startsWith('/api/community/listen/scene')).length;
    await applyCommunitySharedSceneSession({
      ...session,
      sceneRevision: 2,
      scene: { ...initialSharedScene, lyricBrightness: 1.63 }
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    check(Math.abs(state.lyricBrightness - 1.63) < 0.001,
      'A newer canonical shared-scene revision was not applied.');
    check(requests.filter((url) => url.startsWith('/api/community/listen/scene')).length === sceneRequestsBeforeRemote,
      'Applying a remote shared scene echoed the scene back to the server.');
    state.lyricBrightness = 1.42;
    updateLyricDiyVars();
    saveVisualSettingsPreferences();
    await wait(() => sceneRequestBodies.length === 1, 2000);
    state.lyricBrightness = 1.52;
    updateLyricDiyVars();
    saveVisualSettingsPreferences();
    releaseFirstSceneRequest();
    await wait(() => sceneRequestBodies.length === 2 && !state.community.listenSceneInFlight, 3000);
    check(requests.filter((url) => url.startsWith('/api/community/listen/scene')).length === sceneRequestsBeforeRemote + 2,
      'A local shared-scene change made during an in-flight request was lost.');
    check(Math.abs(Number(sceneRequestBodies[1]?.scene?.lyricBrightness) - 1.52) < 0.001,
      'The queued co-host scene did not preserve the newest local parameter value.');
    check(Math.abs(state.lyricBrightness - 1.52) < 0.001,
      'An older canonical response overwrote a newer dirty local scene.');
    check(localStorage.getItem(VISUAL_SETTINGS_PREFS_KEY) === originalVisualPreferences,
      'A co-host scene adjustment leaked into persistent local preferences.');
    const recovered = await wait(() => state.currentSong?.id === goodSong.id && !els.audio.paused, 20000);
    const obrProcessed = await wait(
      () => state.obrSpatialAudio.enabled && state.obrSpatialAudio.processedBlocks > 1 && state.obrSpatialAudio.outputRms > 0,
      20000
    );
    check(recovered, 'Together-listen did not skip unavailable/VIP songs and play the next source.');
    check(nextAttempt === 2, 'Together-listen did not scan the queue until a playable source was found.');
    check(obrProcessed, 'The recovered together-listen song did not pass through official Google OBR.');
    check(state.obrSpatialAudio.backend === 'google-obr-official', 'Together-listen used a non-official spatial backend.');
    const recoveredSongId = state.currentSong?.id || '';
    qaStage('sync-progress');

    await applyCommunityListenSync({
      session: { ...session, song: { ...goodSong, position: 1.6, playing: true } },
      song: { ...goodSong, position: 1.6, playing: true },
      sourceId: '10000001'
    });
    await wait(() => els.audio.currentTime > 1.3, 3000);
    check(els.audio.currentTime > 1.3 && els.audio.currentTime < 2.5, 'Together-listen did not synchronize playback progress.');
    check(!els.audio.paused, 'Together-listen synchronized the song but did not start playback.');

    qaStage('danmaku');
    renderCommunityListenState({ sessions: [session], incoming: [] });
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(nextAttempt === 2, 'A stale session retried a song that was already known to be unavailable.');
    const danmakuToggle = document.getElementById('qishuiPlaybackDanmakuToggle');
    const danmakuComposer = document.getElementById('qishuiPlaybackDanmakuComposer');
    const danmakuInput = document.getElementById('qishuiPlaybackDanmakuInput');
    const danmakuLayer = document.getElementById('communityDanmakuLayer');
    check(danmakuToggle && !danmakuToggle.hidden, 'Danmaku button is not visible during together-listen.');
    check(getComputedStyle(danmakuToggle).backgroundColor === 'rgba(0, 0, 0, 0)',
      'Danmaku button still has a colored backing panel.');
    check(danmakuComposer?.hasAttribute('data-glass-surface')
      && danmakuComposer.classList.contains('glass-surface'), 'Danmaku composer does not use GlassSurface material.');
    setCommunityDanmakuComposerOpen(true);
    check(danmakuComposer?.getAttribute('aria-hidden') === 'false', 'Danmaku GlassSurface composer did not open.');
    check(danmakuComposer?.getBoundingClientRect().left < window.innerWidth / 2,
      'Danmaku GlassSurface composer is not positioned on the left side.');
    danmakuInput.value = '一起听弹幕测试';
    await sendCommunityDanmaku({ preventDefault() {} });
    const localBubble = danmakuLayer?.querySelector('[data-community-danmaku-id]');
    check(requests.some((url) => url.startsWith('/api/community/relay')), 'Danmaku was not relayed to the together-listen peer.');
    check(localBubble?.textContent.includes('一起听弹幕测试'), 'Local danmaku bubble was not rendered.');
    check(Number.parseFloat(getComputedStyle(localBubble).borderRadius) >= 12, 'Danmaku bubble is not a rounded square.');
    check(getComputedStyle(localBubble).backgroundColor === getComputedStyle(danmakuComposer).backgroundColor,
      'Danmaku bubble and composer do not share the playback-bar GlassSurface color.');
    const localBubbleRect = localBubble.getBoundingClientRect();
    scheduleCommunityDanmakuRepulsion({
      clientX: localBubbleRect.left + localBubbleRect.width / 2,
      clientY: localBubbleRect.top + localBubbleRect.height / 2
    });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const repelX = Number.parseFloat(localBubble.style.getPropertyValue('--danmaku-repel-x')) || 0;
    const repelY = Number.parseFloat(localBubble.style.getPropertyValue('--danmaku-repel-y')) || 0;
    check(Math.hypot(repelX, repelY) > 1, 'Danmaku bubble did not repel away from the mouse.');
    handleCommunityDanmakuRelay({
      type: 'listen.danmaku',
      payload: { id: 'remote-danmaku-qa', sessionId: session.id, text: '好友弹幕', senderName: 'QA 好友' }
    });
    check(danmakuLayer?.querySelectorAll('[data-community-danmaku-id]').length >= 2,
      'Remote together-listen danmaku was not rendered.');
    const listenMini = document.getElementById('listenMini');
    const collapse = document.getElementById('listenMiniCollapse');
    collapse.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(listenMini.classList.contains('is-left-collapsed'), 'Together-listen window did not hide against the left edge.');
    check(collapse.getAttribute('aria-expanded') === 'false', 'Together-listen collapse button did not expose its collapsed state.');
    check(state.community.activeSession?.id === session.id, 'Hiding the together-listen window ended the active session.');
    collapse.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(!listenMini.classList.contains('is-left-collapsed'), 'Together-listen window could not be restored from the left edge.');
    check(collapse.getAttribute('aria-expanded') === 'true', 'Together-listen collapse button did not expose its expanded state.');
    qaStage('close-listen');
    const close = document.getElementById('listenMiniClose');
    close.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 41 }));
    check(!state.community.listenMiniDragging, 'The close button still starts window dragging.');
    close.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
    check(document.getElementById('listenMini').hidden, 'Together-listen window did not close immediately.');
    check(state.community.activeSession === null, 'Together-listen session remained locally active after closing.');
    await new Promise((resolve) => setTimeout(resolve, 80));
    check(state.diyPreset === originalSharedScene.preset
      && Math.abs(state.lyricBrightness - originalSharedScene.lyricBrightness) < 0.001,
      'Closing together-listen did not restore the pre-session local scene.');
    check(danmakuToggle?.hidden === true && danmakuComposer?.getAttribute('aria-hidden') === 'true',
      'Danmaku controls remained visible after together-listen ended.');
    qaStage('danmaku-expiry');
    els.audio.loop = true;
    state.community.activeSession = { id: 'danmaku-expiry-only', members: session.members };
    for (let index = 0; index < 18; index += 1) {
      showCommunityDanmakuBubble({
        id: 'unlimited-danmaku-' + index,
        sessionId: 'danmaku-expiry-only',
        text: '连续弹幕 ' + (index + 1),
        senderName: 'QA 好友'
      });
    }
    check(danmakuLayer?.querySelectorAll('[data-community-danmaku-id]').length === 18,
      'Together-listen danmaku still has a simultaneous bubble count limit.');
    await new Promise((resolve) => setTimeout(resolve, 3150));
    check(danmakuLayer?.querySelectorAll('[data-community-danmaku-id]').length === 0,
      'Danmaku bubbles did not disappear after three seconds.');
    els.audio.loop = false;
    state.community.activeSession = null;
    renderCommunityListenState({ sessions: [session], incoming: [] });
    check(document.getElementById('listenMini').hidden, 'A stale poll response reopened the closed together-listen window.');
    check(state.community.activeSession === null, 'A stale poll response restored the closed session.');
    resolveLeave();
    await new Promise((resolve) => setTimeout(resolve, 50));

    els.audio.pause();
    await new Promise((resolve) => setTimeout(resolve, 50));
    listeningRequestBodies.length = 0;
    state.currentSong = { ...goodSong, position: Number(els.audio.currentTime) || 0 };
    state.community.profile = { feId: '10000002' };
    state.community.lastListenReportAt = performance.now() - 1000;
    await reportCommunityListening(true);
    const pausedListeningReport = listeningRequestBodies.at(-1);
    check(pausedListeningReport?.listenMsDelta === 0,
      'A forced paused listening report did not send listenMsDelta: 0.');
    check(pausedListeningReport?.song?.playing === false,
      'A forced paused listening report did not send song.playing: false.');

    apiJson = originalApiJson;

    const originalFetch = window.fetch;
    let retryAttempts = 0;
    window.fetch = async (input, options) => {
      if (!String(input).includes('/api/community/qa-retry')) return originalFetch(input, options);
      retryAttempts += 1;
      if (retryAttempts < 3) throw new TypeError('simulated transient disconnect');
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    };
    const retryPayload = await communityApiJson('/api/community/qa-retry', {
      retryDelays: [0, 0],
      timeoutMs: 500
    }).catch(() => null);
    window.fetch = originalFetch;
    check(retryPayload?.ok === true && retryAttempts === 3, 'Community GET requests did not recover from a transient disconnect.');

    const originalShowMessageBubble = showCommunityMessageBubble;
    let duplicateDispatchCount = 0;
    showCommunityMessageBubble = () => { duplicateDispatchCount += 1; };
    const duplicateEvent = {
      data: JSON.stringify({ seq: 'qa-seq-42', type: 'message.sent', payload: { message: { from: '10000001', to: '10000002' } } }),
      lastEventId: 'qa-seq-42'
    };
    handleCommunityServerEvent(duplicateEvent);
    handleCommunityServerEvent(duplicateEvent);
    showCommunityMessageBubble = originalShowMessageBubble;
    check(duplicateDispatchCount === 1, 'A replayed community event was dispatched more than once.');

    let heartbeatClosed = false;
    const heartbeatSource = { close: () => { heartbeatClosed = true; } };
    const petStreamStates = [];
    const recordPetStreamState = (event) => petStreamStates.push(event.detail?.state || '');
    window.addEventListener('fe-monster-pet-stream-state', recordPetStreamState);
    state.community.eventSource = heartbeatSource;
    state.community.eventKey = 'qa-heartbeat';
    state.community.eventConnected = true;
    touchCommunityEventStream();
    state.community.eventLastActivityAt = performance.now() - COMMUNITY_EVENT_STALE_MS + 1;
    checkCommunityEventHeartbeat();
    check(!heartbeatClosed && state.community.eventConnected,
      'A live community event stream was closed before the heartbeat grace expired.');
    state.community.eventLastActivityAt = performance.now() - COMMUNITY_EVENT_STALE_MS - 1;
    checkCommunityEventHeartbeat();
    check(heartbeatClosed && !state.community.eventConnected && !!state.community.eventReconnectTimer,
      'A stale community event stream was not closed and scheduled for reconnect.');
    check(petStreamStates.includes('connected') && petStreamStates.includes('stale'),
      'Pet stream liveness did not receive connected and stale transitions.');
    window.removeEventListener('fe-monster-pet-stream-state', recordPetStreamState);
    stopCommunityEventStream(true);

    const disconnectRestoreScene = communitySharedSceneSnapshot();
    const disconnectSession = {
      id: 'listen-sse-disconnect-qa',
      sceneRevision: 1,
      scene: { ...disconnectRestoreScene, preset: 'lyric', lyricBrightness: 1.71 },
      members: session.members
    };
    beginCommunitySceneOverride(disconnectSession);
    state.community.activeSession = disconnectSession;
    await applyCommunitySharedSceneSession(disconnectSession);
    state.community.eventConnected = false;
    scheduleCommunitySceneDisconnectRestore(0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    check(state.community.activeSession === null
      && state.diyPreset === disconnectRestoreScene.preset
      && Math.abs(state.lyricBrightness - disconnectRestoreScene.lyricBrightness) < 0.001,
      'An unrecovered together-listen event-stream disconnect did not restore the local scene snapshot.');

    const retrySession = {
      id: 'listen-scene-retry-qa',
      sceneRevision: 1,
      scene: disconnectRestoreScene,
      members: session.members
    };
    beginCommunitySceneOverride(retrySession);
    state.community.activeSession = retrySession;
    await applyCommunitySharedSceneSession(retrySession);
    const retrySceneAttempts = [];
    const retryApiJson = apiJson;
    apiJson = async (url, options = {}) => {
      if (String(url).startsWith('/api/community/listen/scene')) {
        retrySceneAttempts.push(performance.now());
        throw new Error('simulated scene-sync outage');
      }
      return retryApiJson(url, options);
    };
    state.lyricBrightness = clamp(disconnectRestoreScene.lyricBrightness + 0.17, 0.6, 1.8);
    saveVisualSettingsPreferences();
    await new Promise((resolve) => setTimeout(resolve, 920));
    check(retrySceneAttempts.length >= 2 && retrySceneAttempts.length <= 3,
      'Failed scene sync retried in an unbounded zero-delay loop.');
    check(retrySceneAttempts.slice(1).every((time, index) => time - retrySceneAttempts[index] >= 200),
      'Failed scene sync did not use bounded exponential retry delays.');
    resetCommunityListenState({ sessionId: retrySession.id });
    const attemptsAtReset = retrySceneAttempts.length;
    await new Promise((resolve) => setTimeout(resolve, 620));
    check(retrySceneAttempts.length === attemptsAtReset,
      'Leaving together-listen did not cancel a queued scene-sync retry.');
    apiJson = retryApiJson;

    els.audio.pause();
    URL.revokeObjectURL(playableUrl);
    qaStage('complete');
    return {
      errors,
      nextAttempt,
      recoveredSongId,
      obrBackend: state.obrSpatialAudio.backend,
      obrProcessedBlocks: state.obrSpatialAudio.processedBlocks,
      obrOutputRms: state.obrSpatialAudio.outputRms,
      leaveRequested: requests.some((url) => url.startsWith('/api/community/listen/leave')),
      listenMiniHidden: document.getElementById('listenMini').hidden,
      activeSession: state.community.activeSession
      ,retryAttempts
      ,duplicateDispatchCount
      ,heartbeatClosed
    };
  })()`, true);

  assert.deepEqual(result.errors, [], result.errors.join('\n'));
  assert.equal(result.nextAttempt, 2);
  assert.equal(result.recoveredSongId, 'playable-spatial');
  assert.equal(result.obrBackend, 'google-obr-official');
  assert.ok(result.obrProcessedBlocks > 1);
  assert.ok(result.obrOutputRms > 0);
  assert.equal(result.leaveRequested, true);
  assert.equal(result.listenMiniHidden, true);
  assert.equal(result.activeSession, null);
  console.log(`Community together-listen playback PASS ${JSON.stringify(result)}`);
} finally {
  try {
    if (socket?.readyState === 1) {
      await Promise.race([
        command('Browser.close').catch(() => {}),
        delay(1500)
      ]);
    }
  } catch {
  }
  try {
    socket?.close();
  } catch {
  }
  if (browser.exitCode === null) browser.kill();
  await Promise.race([
    new Promise((resolve) => server.close(resolve)),
    delay(1500)
  ]);
  await delay(200);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
  } catch {
    // Edge may release its final cache handles just after the test exits.
  }
}
