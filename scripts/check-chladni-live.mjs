import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const width = Math.max(960, Number.parseInt(process.argv[2] || '1440', 10) || 1440);
const height = Math.max(540, Number.parseInt(process.argv[3] || '900', 10) || 900);
const debugPort = 17000 + (process.pid % 10000);
const profile = path.resolve(tmpdir(), `fe-monster-chladni-${process.pid}`);
const artifactDir = path.resolve(root, 'artifacts');
const screenshotPath = path.join(artifactDir, `chladni-${width}x${height}.png`);
const planeScreenshotPath = path.join(artifactDir, `chladni-plane-${width}x${height}.png`);
const loginStatusStartedAt = new Map();
mkdirSync(artifactDir, { recursive: true });

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'], ['.woff2', 'font/woff2']
]);

function apiFixture(requestUrl) {
  const pathname = requestUrl.pathname;
  const provider = requestUrl.searchParams.get('provider')
    || pathname.match(/^\/api\/([^/]+)\/login\/status$/)?.[1]
    || 'netease';
  if (pathname === '/api/player/state') return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (pathname === '/api/visual-bridge/state') return { audio: {} };
  if (pathname === '/api/audio/sample') return {};
  if (pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (pathname === '/api/community/listen/state') return { ok: false };
  if (pathname === '/api/community/listening') return { ok: false };
  if (pathname === '/api/sandbox/presets') return { presets: [] };
  if (pathname === '/api/sandbox/components') return { components: [] };
  if (pathname === '/api/app/runtime') return {};
  if (pathname.endsWith('/login/status')) {
    const startedAt = loginStatusStartedAt.get(provider) || Date.now();
    loginStatusStartedAt.set(provider, startedAt);
    if (Date.now() - startedAt < 900) return {
      provider,
      loggedIn: false,
      retryable: true,
      error: 'QA login service is still starting'
    };
    return {
      provider,
      loggedIn: true,
      account: { id: `${provider}-startup-qa`, nickname: `QA Startup ${provider}`, vipType: 110 }
    };
  }
  if (pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
  return { ok: false };
}

function safeFilePath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const mapping = decoded.startsWith('/components/')
    ? { base: path.join(root, 'components'), relative: decoded.slice('/components/'.length) }
    : decoded.startsWith('/node_modules/')
      ? { base: path.join(root, 'node_modules'), relative: decoded.slice('/node_modules/'.length) }
      : { base: webRoot, relative: decoded === '/' ? 'index.html' : decoded.slice(1) };
  const base = path.resolve(mapping.base);
  const candidate = path.resolve(base, mapping.relative);
  return candidate === base || candidate.startsWith(`${base}${path.sep}`) ? candidate : '';
}

const server = createServer((request, response) => {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  if (url.pathname.startsWith('/api/')) {
    const body = Buffer.from(JSON.stringify(apiFixture(url)));
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': body.length, 'Cache-Control': 'no-store' });
    response.end(body);
    return;
  }
  const filePath = safeFilePath(url.pathname);
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404);
    response.end();
    return;
  }
  const body = readFileSync(filePath);
  response.writeHead(200, {
    'Content-Type': contentTypes.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'no-store'
  });
  response.end(body);
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const baseUrl = `http://127.0.0.1:${server.address().port}`;

const browser = spawn(edge, [
  '--headless=new', '--enable-webgl', '--ignore-gpu-blocklist',
  '--force-prefers-reduced-motion=no-preference', `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`, 'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();
const browserErrors = [];
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryJson(url) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await delay(100);
  }
  throw new Error('Edge debugging endpoint did not start');
}

function command(method, params = {}) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'Evaluation failed');
  }
  return result.result?.value;
}

try {
  const targets = await retryJson(`http://127.0.0.1:${debugPort}/json`);
  const target = targets.find((item) => item.type === 'page');
  if (!target?.webSocketDebuggerUrl) throw new Error('No Edge page target was found');
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Runtime.exceptionThrown') {
      browserErrors.push(message.params?.exceptionDetails?.exception?.description || message.params?.exceptionDetails?.text || 'runtime exception');
    }
    if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
      browserErrors.push((message.params.args || []).map((item) => item.value || item.description || '').join(' '));
    }
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await command('Page.navigate', { url: `${baseUrl}/?qa=chladni` });
  await delay(1800);

  const startupAccount = await evaluate(`(() => {
    const provider = state.activeProvider || 'netease';
    const payload = state.loginStatusByProvider?.[provider] || null;
    return {
      provider,
      loggedIn: state.loginLoggedIn === true || payload?.loggedIn === true,
      stateName: payload?.account?.nickname || payload?.nickname || '',
      cardName: document.querySelector('#qishuiPlaybackAccountName')?.textContent?.trim() || '',
      loginLabel: document.querySelector('#loginStatusLabel')?.textContent?.trim() || ''
    };
  })()`);

  const scene = await evaluate(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const poll = async (read, timeout = 12000) => {
      const started = performance.now();
      while (performance.now() - started < timeout) {
        const value = read();
        if (value) return value;
        await wait(100);
      }
      return null;
    };
    const boot = document.querySelector('#bootScreen');
    if (boot) boot.hidden = true;
    state.currentSong = { id: 'qa-chladni', title: '声场刻痕', artist: 'FE Monster' };
    setPlaybackLyricLine('让声音留下可以看见的形状', 'FE Monster', 0.42);
    enterPresetPlaybackPage('chladni');
    requestOrbFrame();
    const active = await poll(() => {
      const value = window.FeSandboxDiagnostics?.chladni?.();
      return value?.active && value.canvasCount === 1 && value.frameCount > 4 ? value : null;
    });
    if (!active) throw new Error('克拉尼运行时没有启动：' + JSON.stringify(window.FeSandboxDiagnostics?.chladni?.()));
    const first = window.FeSandboxDiagnostics.chladni();
    const textDragResults = {};
    const sceneZoomBeforeTextTransforms = state.playbackVisual.zoom;
    const textPresets = ['depth', 'flow', 'book-effect', 'focus-echo', 'book'];
    for (let index = 0; index < textPresets.length; index += 1) {
      const preset = textPresets[index];
      const text = 'QA drag ' + preset;
      Object.assign(state.chladniTextTransform, {
        x: 0,
        y: 0,
        rotate: 0,
        rotateX: 0,
        rotateY: 0,
        scale: 1
      });
      updateChladniTextTransform();
      setTextPreset(preset);
      setPlaybackLyricLine(text, 'FE Monster', 0.52);
      await wait(80);
      const lyricRoot = document.querySelector('#playbackLyricScene');
      const candidates = Array.from(lyricRoot?.querySelectorAll('*') || [])
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return element.textContent?.includes(text)
            && rect.width > 1
            && rect.height > 1
            && style.display !== 'none'
            && style.visibility !== 'hidden';
        })
        .sort((left, right) => {
          const a = left.getBoundingClientRect();
          const b = right.getBoundingClientRect();
          return a.width * a.height - b.width * b.height;
        });
      const target = preset === 'book'
        ? document.querySelector('#bookLyricStage')
        : candidates[0] || lyricRoot;
      const before = target?.getBoundingClientRect();
      if (target && before) {
        const pointerId = 70 + index;
        const startX = before.left + before.width / 2;
        const startY = before.top + before.height / 2;
        target.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 1,
          clientX: startX, clientY: startY
        }));
        els.stage.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: startX + 56, clientY: startY + 34
        }));
        els.stage.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 0,
          clientX: startX + 56, clientY: startY + 34
        }));
        await wait(50);
      }
      const after = target?.getBoundingClientRect();
      const rotateBefore = Number(state.chladniTextTransform?.rotate) || 0;
      const shiftMoveBefore = Number(state.chladniTextTransform?.x) || 0;
      if (target && after) {
        const pointerId = 90 + index;
        const startX = after.left + after.width / 2;
        const startY = after.top + after.height / 2;
        target.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 1,
          clientX: startX, clientY: startY, shiftKey: true
        }));
        els.stage.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: startX + 42, clientY: startY, shiftKey: true
        }));
        els.stage.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 0,
          clientX: startX + 42, clientY: startY, shiftKey: true
        }));
      }
      const rotateAfter = Number(state.chladniTextTransform?.rotate) || 0;
      const shiftMoveAfter = Number(state.chladniTextTransform?.x) || 0;
      const rotateXBefore = Number(state.chladniTextTransform?.rotateX) || 0;
      const rotateYBefore = Number(state.chladniTextTransform?.rotateY) || 0;
      const tiltTarget = preset === 'book'
        ? document.querySelector('#bookLyricStage')
        : document.querySelector('#playbackLyricCore');
      const tiltRect = tiltTarget?.getBoundingClientRect();
      if (tiltTarget && tiltRect) {
        const pointerId = 105 + index;
        const stableWidth = tiltTarget.offsetWidth * (Number(state.chladniTextTransform?.scale) || 1);
        const startX = tiltRect.left + tiltRect.width / 2 - stableWidth / 2 - 52;
        const startY = tiltRect.top + tiltRect.height / 2;
        els.stage.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 1,
          clientX: startX, clientY: startY
        }));
        els.stage.dispatchEvent(new PointerEvent('pointermove', {
          bubbles: true, pointerId, pointerType: 'mouse', buttons: 1,
          clientX: startX + 44, clientY: startY - 36
        }));
        els.stage.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 0,
          clientX: startX + 44, clientY: startY - 36
        }));
      }
      const rotateXAfter = Number(state.chladniTextTransform?.rotateX) || 0;
      const rotateYAfter = Number(state.chladniTextTransform?.rotateY) || 0;
      const scaleBefore = Number(state.chladniTextTransform?.scale) || 1;
      if (target) {
        const wheelRect = target.getBoundingClientRect();
        target.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, deltaY: -120,
          clientX: wheelRect.left + wheelRect.width / 2,
          clientY: wheelRect.top + wheelRect.height / 2
        }));
        await wait(20);
      }
      const scaleAfter = Number(state.chladniTextTransform?.scale) || 1;
      textDragResults[preset] = {
        selected: state.textPreset === preset,
        targetFound: Boolean(target && before && after),
        deltaX: before && after ? Math.round((after.left - before.left) * 10) / 10 : 0,
        deltaY: before && after ? Math.round((after.top - before.top) * 10) / 10 : 0,
        rotateDelta: Math.round((rotateAfter - rotateBefore) * 10) / 10,
        shiftMoveDelta: Math.round((shiftMoveAfter - shiftMoveBefore) * 10) / 10,
        rotateXDelta: Math.round((rotateXAfter - rotateXBefore) * 10) / 10,
        rotateYDelta: Math.round((rotateYAfter - rotateYBefore) * 10) / 10,
        scaleDelta: Math.round((scaleAfter - scaleBefore) * 1000) / 1000
      };
    }
    state.chladniTextTransform.rotateX = 170;
    state.chladniTextTransform.rotateY = 170;
    updateChladniTextTransform();
    const freeTiltTarget = document.querySelector('#bookLyricStage');
    const freeTiltRect = freeTiltTarget.getBoundingClientRect();
    const freeTiltStableWidth = freeTiltTarget.offsetWidth * (Number(state.chladniTextTransform?.scale) || 1);
    const freeTiltStartX = freeTiltRect.left + freeTiltRect.width / 2 - freeTiltStableWidth / 2 - 52;
    const freeTiltStartY = freeTiltRect.top + freeTiltRect.height / 2;
    els.stage.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, pointerId: 121, pointerType: 'mouse', button: 0, buttons: 1,
      clientX: freeTiltStartX,
      clientY: freeTiltStartY
    }));
    els.stage.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true, pointerId: 121, pointerType: 'mouse', buttons: 1,
      clientX: freeTiltStartX + 60,
      clientY: freeTiltStartY - 60
    }));
    els.stage.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, pointerId: 121, pointerType: 'mouse', button: 0, buttons: 0,
      clientX: freeTiltStartX + 60,
      clientY: freeTiltStartY - 60
    }));
    const freeTiltXAngle = state.chladniTextTransform.rotateX;
    const freeTiltYAngle = state.chladniTextTransform.rotateY;
    const sceneZoomAfterTextTransforms = state.playbackVisual.zoom;
    const textScaleBeforeOutsideWheel = state.chladniTextTransform.scale;
    els.stage.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true, cancelable: true, deltaY: -120, clientX: 8, clientY: 8
    }));
    const textScaleAfterOutsideWheel = state.chladniTextTransform.scale;
    const sceneZoomAfterOutsideWheel = state.playbackVisual.zoom;
    document.querySelector('#chladniPlaneButton')?.click();
    await wait(80);
    const plane = window.FeSandboxDiagnostics.chladni();
    const planeButtonPressed = document.querySelector('#chladniPlaneButton')?.getAttribute('aria-pressed');
    document.querySelector('#chladniCubeButton')?.click();
    await wait(80);
    const cube = window.FeSandboxDiagnostics.chladni();
    const cubeButtonPressed = document.querySelector('#chladniCubeButton')?.getAttribute('aria-pressed');
    await wait(720);
    const rotated = window.FeSandboxDiagnostics.chladni();
    const runtime = state.chladni.runtime;
    runtime.lastModeChangeAt = performance.now() - 2400;
    runtime.lastBeat = 0;
    const start = performance.now();
    for (let index = 0; index < 52; index += 1) {
      window.FeChladniRuntime.update(runtime, {
        now: start + index * 28,
        playing: true,
        bass: 0.94,
        energy: 0.78,
        mid: 0.56,
        treble: 0.82,
        beat: index < 3 ? 1 : 0.38,
        yaw: 0.16,
        pitch: -0.1,
        zoom: 1.04,
        reducedMotion: false,
        pixelRatio: 1
      });
    }
    const driven = window.FeSandboxDiagnostics.chladni();
    return {
      first,
      textDragResults,
      sceneZoomBeforeTextTransforms,
      sceneZoomAfterTextTransforms,
      sceneZoomAfterOutsideWheel,
      textScaleBeforeOutsideWheel,
      textScaleAfterOutsideWheel,
      freeTiltXAngle,
      freeTiltYAngle,
      plane,
      cube,
      planeButtonPressed,
      cubeButtonPressed,
      rotated,
      driven,
      cardLabel: document.querySelector('#diyChladniPreset strong')?.textContent.trim() || '',
      cardInSceneList: Boolean(document.querySelector('#diyScenePresetList #diyChladniPreset')),
      sceneVisible: document.querySelector('#chladniScene')?.hidden === false,
      appClass: document.querySelector('.app-shell')?.classList.contains('has-chladni') === true,
      lyricVisible: document.querySelector('#playbackLyricScene')?.hidden === false
    };
  })()`);

  await evaluate(`(async () => {
    setTextPreset('none');
    setChladniMode('plane');
    await new Promise((resolve) => setTimeout(resolve, 320));
  })()`);
  const planeScreenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(planeScreenshotPath, Buffer.from(planeScreenshot.data, 'base64'));
  await evaluate(`(async () => {
    setChladniMode('cube');
    await new Promise((resolve) => setTimeout(resolve, 120));
  })()`);
  await delay(120);
  const screenshot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(screenshotPath, Buffer.from(screenshot.data, 'base64'));
  const cleanup = await evaluate(`(async () => {
    setDiyPreset('lyric');
    await new Promise((resolve) => setTimeout(resolve, 220));
    return window.FeSandboxDiagnostics.chladni();
  })()`);

  const shaderErrors = browserErrors.filter((message) => /shader|webgl|gl_invalid|program/i.test(message));
  const checks = {
    startupAccountRestored: startupAccount.loggedIn
      && (startupAccount.stateName.includes('QA Startup') || startupAccount.cardName.includes('QA Startup')),
    presetCard: scene.cardInSceneList && scene.cardLabel === '克拉尼',
    visible: scene.sceneVisible && scene.appClass && scene.first.canvasCount === 1,
    particleField: scene.first.pointCloud === true && scene.first.particleCount >= 498000,
    physicalModel: scene.first.plateShape === 'six-face-particle-cube-no-support'
      && scene.first.physicsModel === 'square-plate-nodal-line-approximation'
      && scene.first.nodeAccumulation === 'particle-opacity-peaks-at-zero-displacement'
      && scene.first.transparentPlate === false
      && scene.first.centerSphere === false,
    threeDimensional: scene.first.threeDimensional === true && scene.first.displacementAxis === 'y',
    crispParticles: scene.first.particleProfile === 'crisp-antialiased-disc'
      && scene.first.maxPointSize === 2.6
      && scene.first.toneMappingExposure === 1.04
      && scene.first.particleSharpness === 0.42,
    autoRotation: scene.first.autoRotation === true
      && scene.first.mouseOrbitEnabled === false
      && scene.rotated.rotation.y > scene.first.rotation.y
      && scene.driven.rotation.y > scene.rotated.rotation.y,
    audioResponse: scene.driven.audio.bass > 0.45 && scene.driven.audio.energy > 0.35 && scene.driven.audio.treble > 0.35,
    modeMorph: scene.driven.modeFrom.join(',') !== scene.first.modeFrom.join(',') || scene.driven.modeBlend > 0,
    restrainedMotion: scene.driven.bassDisplacementGain === 1.35 && scene.driven.rotationSpeed <= 0.05,
    sixFaceCube: scene.first.faceCount === 6
      && scene.first.faceNames.length === 6
      && scene.first.particlesPerFace >= 83000
      && scene.first.faceModePairs.length === 6,
    roundedCornerView: scene.first.cubeCornerFacingViewer === true
      && scene.first.roundedCornerCount === 8
      && scene.first.roundedCornerRadius > 0
      && scene.first.rotation.y > 0.72
      && scene.first.rotation.y < 1.05,
    directModeSwitch: scene.plane.displayMode === 'plane'
      && scene.plane.visibleFaceCount === 1
      && scene.plane.particleCount >= 598000
      && scene.plane.particleCount === scene.plane.planeParticleCount
      && scene.plane.canvasCount === 1
      && scene.planeButtonPressed === 'true'
      && scene.cube.displayMode === 'cube'
      && scene.cube.visibleFaceCount === 6
      && scene.cube.particleCount >= 498000
      && scene.cube.particleCount === scene.cube.cubeParticleCount
      && scene.cube.canvasCount === 1
      && scene.cubeButtonPressed === 'true',
    planeView45Degrees: scene.plane.planeViewAzimuthDegrees === 45
      && scene.plane.planeViewElevationDegrees === 45
      && Math.abs(Math.atan2(
        scene.plane.cameraPosition.y,
        Math.hypot(scene.plane.cameraPosition.x, scene.plane.cameraPosition.z)
      ) * 180 / Math.PI - 45) < 0.5
      && Math.abs(Math.atan2(
        scene.plane.cameraPosition.x,
        scene.plane.cameraPosition.z
      ) * 180 / Math.PI - 45) < 0.5,
    allTextPresetsDraggable: Object.values(scene.textDragResults).every((result) => (
      result.selected
      && result.targetFound
      && Math.abs(result.deltaX) >= 24
      && Math.abs(result.deltaY) >= 12
    )),
    shiftDragMovesWithoutRotation: Object.values(scene.textDragResults).every((result) => (
      Math.abs(result.shiftMoveDelta) >= 30
      && result.rotateDelta === 0
      && result.scaleDelta >= 0.05
    )),
    allTextPresetsThreeDimensional: Object.values(scene.textDragResults).every((result) => (
      Math.abs(result.rotateXDelta) >= 12
      && Math.abs(result.rotateYDelta) >= 12
    )),
    textTransformsLeaveSceneZoom: scene.sceneZoomAfterTextTransforms === scene.sceneZoomBeforeTextTransforms,
    textScaleRequiresHover: scene.textScaleAfterOutsideWheel === scene.textScaleBeforeOutsideWheel,
    sceneWheelScalesChladni: scene.sceneZoomAfterOutsideWheel > scene.sceneZoomAfterTextTransforms,
    freeTextThreeDimensionalRotation: scene.freeTiltXAngle > 180 && scene.freeTiltYAngle > 180,
    interactionErrors: browserErrors.length === 0,
    efficientDraw: scene.driven.drawCalls === 6 && scene.driven.averageUpdateMs < 30,
    cleanup: cleanup.active === false && cleanup.canvasCount === 0 && cleanup.disposeCount >= 1,
    shaderErrors: shaderErrors.length === 0
  };
  const result = {
    pass: Object.values(checks).every(Boolean),
    viewport: `${width}x${height}`,
    checks,
    diagnostics: scene,
    startupAccount,
    cleanup,
    browserErrors,
    screenshotPath,
    planeScreenshotPath
  };
  console.log(JSON.stringify(result, null, 2));
  if (!result.pass) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  if (browser.pid) spawnSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  await new Promise((resolve) => server.close(resolve));
  await delay(180);
  try { rmSync(profile, { recursive: true, force: true, maxRetries: 6, retryDelay: 120 }); } catch {}
}
