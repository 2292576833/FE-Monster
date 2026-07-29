import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const debugPort = 18000 + (process.pid % 10000);
const profile = path.join(tmpdir(), `fe-monster-scene-lyric-rotation-${process.pid}`);
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.svg', 'image/svg+xml'],
  ['.woff2', 'font/woff2']
]);

function apiFixture(url) {
  if (url.pathname === '/api/player/state') return { queue: [], queueIndex: -1, volume: 0.8, playing: false };
  if (url.pathname === '/api/visual-bridge/state') return { audio: {} };
  if (url.pathname === '/api/audio/sample') return {};
  if (url.pathname === '/api/community/state') return { ok: false, serverOnline: false, loggedIn: false, friends: [] };
  if (url.pathname === '/api/community/listen/state') return { ok: false };
  if (url.pathname === '/api/community/listening') return { ok: false };
  if (url.pathname === '/api/sandbox/presets') return { presets: [] };
  if (url.pathname === '/api/sandbox/components') return { components: [] };
  if (url.pathname === '/api/app/runtime') return {};
  if (url.pathname.endsWith('/login/status')) return { loggedIn: false };
  if (url.pathname.includes('/user/playlists')) return { loggedIn: false, playlists: [] };
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
    response.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': body.length,
      'Cache-Control': 'no-store'
    });
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
  '--headless=new',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--force-prefers-reduced-motion=no-preference',
  `--remote-debugging-port=${debugPort}`,
  `--user-data-dir=${profile}`,
  'about:blank'
], { stdio: 'ignore', windowsHide: true });

let socket;
let nextId = 1;
const pending = new Map();

async function retryJson(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
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
  const result = await command('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  });
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
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  await command('Page.enable');
  await command('Runtime.enable');
  await command('Page.navigate', { url: baseUrl });
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const ready = await evaluate(`typeof enterPresetPlaybackPage === 'function'
      && typeof updateSonicTopographyMotion === 'function'
      && typeof initSandboxRenderer === 'function'`);
    if (ready) break;
    if (attempt === 119) throw new Error('FE Monster client did not finish booting');
    await delay(100);
  }

  const results = await evaluate(`(async () => {
    const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const near = (left, right, tolerance = 0.025) => Math.abs(left - right) <= tolerance;
    const angleDelta = (after, before) => {
      let value = after - before;
      while (value > Math.PI) value -= Math.PI * 2;
      while (value < -Math.PI) value += Math.PI * 2;
      return value;
    };
    const cameraYaw = (camera) => Math.atan2(camera.position.x, camera.position.z);
    const cameraElevation = (camera) => {
      const radius = Math.hypot(camera.position.x, camera.position.y, camera.position.z) || 1;
      return Math.asin(camera.position.y / radius);
    };
    const dispatchDrag = ({ dx = 20, dy = -10, pointerId = 701, keepPressed = false } = {}) => {
      const rect = els.stage.getBoundingClientRect();
      const startX = rect.left + 54;
      const startY = rect.top + 142;
      els.stage.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'mouse',
        button: 0,
        buttons: 1,
        clientX: startX,
        clientY: startY
      }));
      els.stage.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'mouse',
        buttons: 1,
        clientX: startX + dx,
        clientY: startY + dy
      }));
      const finish = () => els.stage.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: 'mouse',
        button: 0,
        buttons: 0,
        clientX: startX + dx,
        clientY: startY + dy
      }));
      if (!keepPressed) finish();
      return finish;
    };

    document.querySelector('#bootScreen')?.setAttribute('hidden', '');
    await wait(700);
    state.currentSong = { id: 'scene-lyric-rotation-qa', title: 'Scene Lyric Rotation QA', artist: 'FE Monster' };
    setPlaybackLyricLine('Scene Lyric Rotation QA', '场景歌词同步', 0.42);
    state.playbackPage = true;
    updatePlaybackPageClass();
    setTextPreset('depth');

    setDiyPreset('cube');
    resetPlaybackView();
    await wait(80);
    const cubeBefore = {
      yaw: state.playbackVisual.yaw,
      pitch: state.playbackVisual.pitch,
      lyricTransform: getComputedStyle(els.playbackLyricRig).transform
    };
    dispatchDrag({ pointerId: 711 });
    await wait(40);
    updateDynamicCubeMotion();
    const cubeAfter = {
      yaw: state.playbackVisual.yaw,
      pitch: state.playbackVisual.pitch,
      sceneYaw: state.dynamicCube.group?.rotation?.y,
      scenePitch: state.dynamicCube.group?.rotation?.x,
      lyricYaw: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y')),
      lyricPitch: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-x')),
      lyricTransform: getComputedStyle(els.playbackLyricRig).transform
    };
    const cube = {
      pass: cubeAfter.lyricTransform !== cubeBefore.lyricTransform
        && near(cubeAfter.sceneYaw, cubeAfter.yaw)
        && near(cubeAfter.scenePitch, cubeAfter.pitch)
        && near(cubeAfter.lyricYaw, cubeAfter.yaw)
        && near(cubeAfter.lyricPitch, cubeAfter.pitch),
      before: cubeBefore,
      after: cubeAfter
    };

    setMultiRowLyricsEnabled(true);
    resetPlaybackView();
    await wait(30);
    const multiRowBefore = getComputedStyle(els.multiRowLyricStage).transform;
    dispatchDrag({ pointerId: 715 });
    await wait(30);
    const multiRowAfter = getComputedStyle(els.multiRowLyricStage).transform;
    const multiRow = {
      pass: multiRowAfter !== multiRowBefore
        && near(
          Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y')),
          state.playbackVisual.yaw
        )
        && near(
          Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-x')),
          state.playbackVisual.pitch
        ),
      before: multiRowBefore,
      after: multiRowAfter
    };

    state.textPresetTransforms[state.textPreset] = normalizeTextPresetTransform();
    updateTextPresetTransform();
    renderMultiRowLyrics(true);
    await wait(40);
    const multiRowGestureTarget = els.multiRowLyricList;
    const gesturePoint = (target, fraction = 0.5) => {
      const rect = target.getBoundingClientRect();
      const scale = Math.max(0.1, Number(textPresetTransform().scale) || 1);
      const stableWidth = Math.max(1, Math.min(rect.width, target.offsetWidth * scale || rect.width));
      const left = rect.left + (rect.width - stableWidth) / 2;
      return {
        x: left + stableWidth * fraction,
        y: rect.top + rect.height / 2,
        rect: { width: rect.width, height: rect.height }
      };
    };
    const textGestureEvent = (target, pointerId, point, overrides = {}) => ({
      target,
      pointerId,
      pointerType: 'mouse',
      button: 0,
      buttons: 1,
      clientX: point.x,
      clientY: point.y,
      shiftKey: false,
      ...overrides
    });

    const transformBeforeMove = { ...textPresetTransform() };
    const middlePoint = gesturePoint(multiRowGestureTarget, 0.5);
    const middleStarted = beginTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 716, middlePoint)
    );
    await wait(390);
    const middleMovePoint = { x: middlePoint.x + 42, y: middlePoint.y + 26 };
    const middleMoved = moveTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 716, middleMovePoint)
    );
    const middleEnded = endTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 716, middleMovePoint, { buttons: 0 })
    );
    const transformAfterMove = { ...textPresetTransform() };

    const tailPoint = gesturePoint(multiRowGestureTarget, 0.84);
    const transformBeforeRotate = { ...textPresetTransform() };
    const tailStarted = beginTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 717, tailPoint)
    );
    const tailMovePoint = { x: tailPoint.x + 38, y: tailPoint.y - 28 };
    const tailMoved = moveTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 717, tailMovePoint)
    );
    const tailEnded = endTextPresetGesture(
      textGestureEvent(multiRowGestureTarget, 717, tailMovePoint, { buttons: 0 })
    );
    const transformAfterRotate = { ...textPresetTransform() };

    const wheelPoint = gesturePoint(multiRowGestureTarget, 0.5);
    const transformBeforeScale = { ...textPresetTransform() };
    const wheelScaled = scaleTextPresetFromWheel({
      target: multiRowGestureTarget,
      clientX: wheelPoint.x,
      clientY: wheelPoint.y,
      deltaY: -160
    });
    const transformAfterScale = { ...textPresetTransform() };
    const multiRowTextGesture = {
      pass: middlePoint.rect.width > 0
        && middlePoint.rect.height > 0
        && middleStarted
        && middleMoved
        && middleEnded
        && Math.abs(transformAfterMove.x - transformBeforeMove.x) > 20
        && Math.abs(transformAfterMove.y - transformBeforeMove.y) > 12
        && tailStarted
        && tailMoved
        && tailEnded
        && Math.abs(transformAfterRotate.rotateX - transformBeforeRotate.rotateX) > 8
        && Math.abs(transformAfterRotate.rotateY - transformBeforeRotate.rotateY) > 8
        && wheelScaled
        && transformAfterScale.scale > transformBeforeScale.scale,
      middleStarted,
      middleMoved,
      middleEnded,
      tailStarted,
      tailMoved,
      tailEnded,
      wheelScaled,
      beforeMove: transformBeforeMove,
      afterMove: transformAfterMove,
      beforeRotate: transformBeforeRotate,
      afterRotate: transformAfterRotate,
      beforeScale: transformBeforeScale,
      afterScale: transformAfterScale,
      targetRect: middlePoint.rect
    };
    setMultiRowLyricsEnabled(false);

    setDiyPreset('book');
    resetPlaybackView();
    await wait(40);
    const bookBefore = {
      yaw: state.playbackVisual.yaw,
      pitch: state.playbackVisual.pitch,
      transform: getComputedStyle(els.bookLyricStage).transform
    };
    dispatchDrag({ pointerId: 712 });
    await wait(40);
    const bookAfter = {
      yaw: state.playbackVisual.yaw,
      pitch: state.playbackVisual.pitch,
      transform: getComputedStyle(els.bookLyricStage).transform
    };
    const book = {
      pass: near(bookAfter.yaw, bookBefore.yaw, 0.0001)
        && near(bookAfter.pitch, bookBefore.pitch, 0.0001)
        && bookAfter.transform === bookBefore.transform,
      before: bookBefore,
      after: bookAfter
    };

    setDiyPreset('topography');
    setTextPreset('depth');
    resetPlaybackView();
    await wait(220);
    state.sonicTopography.autoYaw = 0;
    const finishSonicDrag = dispatchDrag({ pointerId: 713, keepPressed: true });
    state.playbackVisual.yaw -= 20 * 0.0095;
    state.playbackVisual.pitch -= 10 * 0.0095;
    state.playbackVisual.lastX -= 20;
    state.playbackVisual.lastY += 10;
    updatePlaybackSceneTransform();
    updateSonicTopographyMotion();
    const sonicBefore = {
      sceneYaw: cameraYaw(state.sonicTopography.camera),
      scenePitch: cameraElevation(state.sonicTopography.camera),
      lyricYaw: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y')),
      lyricPitch: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-x'))
    };
    els.stage.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      pointerId: 713,
      pointerType: 'mouse',
      buttons: 1,
      clientX: state.playbackVisual.lastX + 20,
      clientY: state.playbackVisual.lastY - 10
    }));
    updateSonicTopographyMotion();
    const sonicAfter = {
      sceneYaw: cameraYaw(state.sonicTopography.camera),
      scenePitch: cameraElevation(state.sonicTopography.camera),
      lyricYaw: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y')),
      lyricPitch: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-x'))
    };
    finishSonicDrag();
    const sonicDeltas = {
      sceneYaw: angleDelta(sonicAfter.sceneYaw, sonicBefore.sceneYaw),
      scenePitch: sonicAfter.scenePitch - sonicBefore.scenePitch,
      lyricYaw: sonicAfter.lyricYaw - sonicBefore.lyricYaw,
      lyricPitch: sonicAfter.lyricPitch - sonicBefore.lyricPitch
    };
    const sonic = {
      pass: Math.abs(sonicDeltas.lyricYaw) > 0.05
        && Math.abs(sonicDeltas.lyricPitch) > 0.03
        && near(sonicDeltas.sceneYaw, sonicDeltas.lyricYaw)
        && near(sonicDeltas.scenePitch, sonicDeltas.lyricPitch),
      deltas: sonicDeltas
    };

    initSandboxRenderer();
    state.sandbox.open = false;
    state.sandbox.playbackPresetId = 'scene-lyric-rotation-qa';
    state.sandbox.playbackPreviewUrl = '';
    state.sandbox.playbackKeepBackground = false;
    state.sandbox.sceneItems = [{
      component: {
        asset: {
          playbackView: {
            cameraX: 0,
            cameraY: 30,
            cameraZ: 64,
            targetX: 0,
            targetY: 3.6,
            targetZ: 0,
            fov: 42
          }
        }
      }
    }];
    state.sandbox.yaw = 0.68;
    state.sandbox.pitch = 0.72;
    state.sandbox.distance = 10.5;
    setDiyPreset('sandbox-scene');
    setTextPreset('depth');
    resetPlaybackView();
    updateSandboxCamera();
    await wait(50);
    const sandboxBefore = {
      sceneYaw: cameraYaw(state.sandbox.camera),
      lyricYaw: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y'))
    };
    dispatchDrag({ pointerId: 714 });
    await wait(40);
    const sandboxAfter = {
      sceneYaw: cameraYaw(state.sandbox.camera),
      lyricYaw: Number.parseFloat(els.playbackLyricScene.style.getPropertyValue('--scene-rotate-y'))
    };
    const sandboxDeltas = {
      sceneYaw: angleDelta(sandboxAfter.sceneYaw, sandboxBefore.sceneYaw),
      lyricYaw: sandboxAfter.lyricYaw - sandboxBefore.lyricYaw
    };
    const sandbox = {
      pass: Math.abs(sandboxDeltas.lyricYaw) > 0.05
        && near(sandboxDeltas.sceneYaw, sandboxDeltas.lyricYaw),
      deltas: sandboxDeltas
    };

    return {
      pass: cube.pass
        && multiRow.pass
        && multiRowTextGesture.pass
        && book.pass
        && sonic.pass
        && sandbox.pass,
      cube,
      multiRow,
      multiRowTextGesture,
      book,
      sonic,
      sandbox
    };
  })()`);

  console.log(JSON.stringify(results, null, 2));
  if (!results?.pass) process.exitCode = 1;
} finally {
  if (socket?.readyState === WebSocket.OPEN) socket.close();
  browser.kill();
  await new Promise((resolve) => server.close(resolve));
  await delay(250);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch {}
}
