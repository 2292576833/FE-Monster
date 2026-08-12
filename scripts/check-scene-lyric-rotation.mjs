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
const rotationIsolationOnly = process.argv.includes('--rotation-isolation-only');
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
  ...(rotationIsolationOnly ? ['--window-size=1600,900'] : []),
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

  let results;
  if (rotationIsolationOnly) {
    const before = await evaluate(`(async () => {
      const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
      document.querySelector('#bootScreen')?.setAttribute('hidden', '');
      await wait(700);
      state.currentSong = { id: 'scene-lyric-rotation-qa', title: 'Scene Lyric Rotation QA', artist: 'FE Monster' };
      setPlaybackLyricLine('Scene Lyric Rotation QA', '场景歌词同步', 0.42);
      state.playbackPage = true;
      updatePlaybackPageClass();
      setTextPreset('depth');
      setDiyPreset('cube');
      state.textPresetTransforms[state.textPreset] = normalizeTextPresetTransform();
      updateTextPresetTransform();
      resetPlaybackView();
      updateDynamicCubeMotion();
      await wait(40);
      const target = els.playbackLyricText;
      const rect = target.getBoundingClientRect();
      const stageRect = els.stage.getBoundingClientRect();
      const scale = Math.max(0.1, Number(textPresetTransform().scale) || 1);
      const stableWidth = Math.max(1, Math.min(rect.width, target.offsetWidth * scale || rect.width));
      const stableHeight = Math.max(1, Math.min(rect.height, target.offsetHeight * scale || rect.height));
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const stableRect = {
        left: centerX - stableWidth / 2,
        right: centerX + stableWidth / 2,
        top: centerY - stableHeight / 2,
        bottom: centerY + stableHeight / 2
      };
      const blockedSelector = [
        '#qishuiPlaybackCard',
        '#playbackLyricScene',
        '#bookLyricPage',
        '#multiRowLyricStage',
        '#communityCard',
        '[id^="community"]',
        'button',
        'input',
        'select',
        'textarea',
        'a',
        '[role="button"]',
        '[role="slider"]'
      ].join(', ');
      const describe = (element) => element ? {
        tag: element.tagName,
        id: element.id || '',
        className: typeof element.className === 'string' ? element.className : '',
        pointerEvents: getComputedStyle(element).pointerEvents
      } : null;
      const candidates = [];
      for (const side of ['left', 'right']) {
        for (const inset of [8, 12, 18]) {
          for (const yRatio of [0.5, 0.25, 0.75]) {
            const point = {
              x: side === 'left' ? rect.left + inset : rect.right - inset,
              y: rect.top + rect.height * yRatio
            };
            const insideTransformed = point.x >= rect.left
              && point.x <= rect.right
              && point.y >= rect.top
              && point.y <= rect.bottom;
            const insideStable = point.x >= stableRect.left
              && point.x <= stableRect.right
              && point.y >= stableRect.top
              && point.y <= stableRect.bottom;
            const insideStage = point.x >= stageRect.left + 24
              && point.x <= stageRect.right - 24
              && point.y >= stageRect.top + 24
              && point.y <= stageRect.bottom - 24;
            const hit = document.elementFromPoint(point.x, point.y);
            const backgroundHit = !!hit
              && (hit === els.stage || els.stage.contains(hit))
              && !hit.closest(blockedSelector);
            candidates.push({ point, hit: describe(hit), eligible: insideTransformed && !insideStable && insideStage && backgroundHit });
          }
        }
      }
      const selected = candidates.find((candidate) => candidate.eligible) || null;
      const start = selected?.point || null;
      return {
        start,
        stablePointInside: start ? textPresetPointInside({
          target: els.stage,
          clientX: start.x,
          clientY: start.y
        }) : null,
        boxQuadsType: typeof target.getBoxQuads,
        elementFromPoint: selected?.hit || null,
        transformedRect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
        stableRect,
        candidates,
        scene: {
          yaw: state.playbackVisual.yaw,
          pitch: state.playbackVisual.pitch,
          presetYaw: state.dynamicCube.group?.rotation?.y,
          presetPitch: state.dynamicCube.group?.rotation?.x
        },
        text: {
          transform: getComputedStyle(els.playbackLyricRig).transform,
          rotateX: textPresetTransform().rotateX,
          rotateY: textPresetTransform().rotateY
        }
      };
    })()`);
    if (!before.start) {
      results = {
        pass: false,
        reason: 'No eligible transformed-edge background point was found',
        transformedRect: before.transformedRect,
        stableRect: before.stableRect,
        candidates: before.candidates
      };
    } else {
      const direction = before.start.x < (before.transformedRect.left + before.transformedRect.right) / 2 ? 1 : -1;
      const end = {
        x: before.start.x + direction * 120,
        y: before.start.y - 70
      };
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: before.start.x,
      y: before.start.y,
      button: 'none',
      buttons: 0
    });
    await command('Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: before.start.x,
      y: before.start.y,
      button: 'left',
      buttons: 1,
      clickCount: 1
    });
    await command('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: end.x,
      y: end.y,
      button: 'none',
      buttons: 1
    });
    await command('Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: end.x,
      y: end.y,
      button: 'left',
      buttons: 0,
      clickCount: 1
    });
    await delay(30);
    const after = await evaluate(`(() => {
      updateDynamicCubeMotion();
      return {
        scene: {
          yaw: state.playbackVisual.yaw,
          pitch: state.playbackVisual.pitch,
          presetYaw: state.dynamicCube.group?.rotation?.y,
          presetPitch: state.dynamicCube.group?.rotation?.x
        },
        text: {
          transform: getComputedStyle(els.playbackLyricRig).transform,
          rotateX: textPresetTransform().rotateX,
          rotateY: textPresetTransform().rotateY
        }
      };
    })()`);
      const near = (left, right, tolerance = 0.000001) => Math.abs(left - right) <= tolerance;
      results = {
        pass: after.text.transform !== before.text.transform
          && Math.abs(after.text.rotateX - before.text.rotateX) > 8
          && Math.abs(after.text.rotateY - before.text.rotateY) > 8
          && before.stablePointInside === false
          && near(after.scene.yaw, before.scene.yaw)
          && near(after.scene.pitch, before.scene.pitch)
          && near(after.scene.presetYaw, before.scene.presetYaw)
          && near(after.scene.presetPitch, before.scene.presetPitch),
        elementFromPoint: before.elementFromPoint,
        boxQuadsType: before.boxQuadsType,
        stablePointInside: before.stablePointInside,
        start: before.start,
        transformedRect: before.transformedRect,
        stableRect: before.stableRect,
        sceneBefore: before.scene,
        sceneAfter: after.scene,
        textBefore: before.text,
        textAfter: after.text
      };
      const blankBefore = await evaluate(`(() => {
        const stageRect = els.stage.getBoundingClientRect();
        const lyricRects = textPresetTargets().map((target) => {
          const rect = target.getBoundingClientRect();
          return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
        });
        const blockedSelector = [
          '#qishuiPlaybackCard',
          '#playbackLyricScene',
          '#bookLyricPage',
          '#multiRowLyricStage',
          '#communityCard',
          '[id^="community"]',
          'button',
          'input',
          'select',
          'textarea',
          'a',
          '[role="button"]',
          '[role="slider"]'
        ].join(', ');
        const describe = (element) => element ? {
          tag: element.tagName,
          id: element.id || '',
          className: typeof element.className === 'string' ? element.className : '',
          pointerEvents: getComputedStyle(element).pointerEvents
        } : null;
        let selected = null;
        for (const yRatio of [0.86, 0.12, 0.68, 0.5, 0.32]) {
          for (const xRatio of [0.08, 0.3, 0.5, 0.7, 0.92]) {
            const point = {
              x: stageRect.left + stageRect.width * xRatio,
              y: stageRect.top + stageRect.height * yRatio
            };
            const hit = document.elementFromPoint(point.x, point.y);
            const outsideLyrics = lyricRects.every((rect) => point.x < rect.left - 30
              || point.x > rect.right + 30
              || point.y < rect.top - 30
              || point.y > rect.bottom + 30);
            const backgroundHit = !!hit
              && (hit === els.stage || els.stage.contains(hit))
              && !hit.closest(blockedSelector);
            if (outsideLyrics && backgroundHit) {
              selected = { point, hit: describe(hit) };
              break;
            }
          }
          if (selected) break;
        }
        return {
          start: selected?.point || null,
          elementFromPoint: selected?.hit || null,
          stageRect: {
            left: stageRect.left,
            right: stageRect.right,
            top: stageRect.top,
            bottom: stageRect.bottom
          },
          lyricRects,
          scene: {
            yaw: state.playbackVisual.yaw,
            pitch: state.playbackVisual.pitch,
            presetYaw: state.dynamicCube.group?.rotation?.y,
            presetPitch: state.dynamicCube.group?.rotation?.x
          },
          text: {
            transform: getComputedStyle(els.playbackLyricRig).transform,
            rotateX: textPresetTransform().rotateX,
            rotateY: textPresetTransform().rotateY
          }
        };
      })()`);
      if (!blankBefore.start) {
        results.pass = false;
        results.blankStage = {
          pass: false,
          reason: 'No eligible blank stage point was found',
          lyricRects: blankBefore.lyricRects
        };
      } else {
        const blankDirection = blankBefore.start.x < (blankBefore.stageRect.left + blankBefore.stageRect.right) / 2 ? 1 : -1;
        const blankEnd = {
          x: blankBefore.start.x + blankDirection * 90,
          y: blankBefore.start.y - 54
        };
        await command('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: blankBefore.start.x,
          y: blankBefore.start.y,
          button: 'none',
          buttons: 0
        });
        await command('Input.dispatchMouseEvent', {
          type: 'mousePressed',
          x: blankBefore.start.x,
          y: blankBefore.start.y,
          button: 'left',
          buttons: 1,
          clickCount: 1
        });
        await command('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: blankEnd.x,
          y: blankEnd.y,
          button: 'none',
          buttons: 1
        });
        await command('Input.dispatchMouseEvent', {
          type: 'mouseReleased',
          x: blankEnd.x,
          y: blankEnd.y,
          button: 'left',
          buttons: 0,
          clickCount: 1
        });
        await delay(30);
        const blankAfter = await evaluate(`(() => {
          updateDynamicCubeMotion();
          return {
            scene: {
              yaw: state.playbackVisual.yaw,
              pitch: state.playbackVisual.pitch,
              presetYaw: state.dynamicCube.group?.rotation?.y,
              presetPitch: state.dynamicCube.group?.rotation?.x
            },
            text: {
              transform: getComputedStyle(els.playbackLyricRig).transform,
              rotateX: textPresetTransform().rotateX,
              rotateY: textPresetTransform().rotateY
            }
          };
        })()`);
        const blankPass = Math.abs(blankAfter.scene.yaw - blankBefore.scene.yaw) > 0.05
          && Math.abs(blankAfter.scene.pitch - blankBefore.scene.pitch) > 0.03
          && near(blankAfter.scene.presetYaw, blankAfter.scene.yaw)
          && near(blankAfter.scene.presetPitch, blankAfter.scene.pitch)
          && near(blankAfter.text.rotateX, blankBefore.text.rotateX)
          && near(blankAfter.text.rotateY, blankBefore.text.rotateY);
        results.pass = results.pass && blankPass;
        results.blankStage = {
          pass: blankPass,
          elementFromPoint: blankBefore.elementFromPoint,
          start: blankBefore.start,
          sceneBefore: blankBefore.scene,
          sceneAfter: blankAfter.scene,
          textBefore: blankBefore.text,
          textAfter: blankAfter.text
        };
      }
    }
  } else {
    results = await evaluate(`(async () => {
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
    const dispatchDrag = ({
      dx = 20,
      dy = -10,
      pointerId = 701,
      keepPressed = false,
      startX: requestedStartX,
      startY: requestedStartY
    } = {}) => {
      const rect = els.stage.getBoundingClientRect();
      const startX = Number.isFinite(requestedStartX) ? requestedStartX : rect.left + 54;
      const startY = Number.isFinite(requestedStartY) ? requestedStartY : rect.top + 142;
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
    state.textPresetTransforms[state.textPreset] = normalizeTextPresetTransform();
    updateTextPresetTransform();
    resetPlaybackView();
    await wait(220);
    state.sonicTopography.autoYaw = 0;
    const sonicStageRect = els.stage.getBoundingClientRect();
    const finishSonicDrag = dispatchDrag({
      pointerId: 713,
      keepPressed: true,
      startX: sonicStageRect.left + 54,
      startY: sonicStageRect.bottom - 54
    });
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
  }

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
