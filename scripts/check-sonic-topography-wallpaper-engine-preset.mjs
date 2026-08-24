import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const webRoot = path.join(root, 'web');
const tempRoot = path.join(root, 'tmp', 'sonic-topography-preset-tests');
const profile = path.join(tempRoot, `edge-profile-${process.pid}`);
const edge = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

assert.ok(existsSync(edge), `Microsoft Edge was not found at ${edge}`);
mkdirSync(profile, { recursive: true });

function sendJson(response, payload, status = 200) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

function fixtureApi(pathname, response) {
  if (pathname === '/api/app/preferences/bootstrap.js') {
    response.writeHead(200, {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(`window.__feSonicPresetFixturePreferencesLoaded = true;
      Object.entries(${JSON.stringify(preferenceJournal.values)}).forEach(function(entry) {
        localStorage.setItem(entry[0], entry[1]);
      });`);
    return true;
  }
  if (!pathname.startsWith('/api/')) return false;

  const payloads = {
    '/api/music-apis': { ok: true, providers: [] },
    '/api/user-cursors': { ok: true, cursors: [] },
    '/api/app/runtime': {
      ok: true,
      clientMode: 'embedded',
      renderPreset: 'directx11',
      renderBackend: 'directx11',
      audioBackend: 'xaudio2',
      nativeAudio: { active: false },
      settings: { gpuAcceleration: true, directX11: true, xAudio2: true, x3DAudio: true },
    },
    '/api/player/state': {
      ok: true,
      playing: false,
      paused: true,
      volume: 0.8,
      position: 40,
      duration: 240,
      song: {
        id: 'soundscape-fixture-track',
        title: 'Sandbox Bridge Track',
        artist: 'FE Monster QA',
        provider: 'qishui',
        position: 40,
        duration: 240,
      },
      queue: [],
      queueLength: 0,
      queueRevision: 0,
      queueIndex: -1,
    },
    '/api/visual-bridge/state': { ok: true, audio: {} },
    '/api/sandbox/presets': { ok: true, presets: [], folder: 'browser-fixture' },
    '/api/sandbox/components': { ok: true, components: [] },
    '/api/app/interactive/activate': { ok: true },
    '/api/app/version': { ok: true, version: '2.1.1' },
    '/api/update/latest': { ok: true, available: false },
    '/api/community/status': { ok: true, authenticated: false },
    '/api/community/pet/status': { ok: true, pet: { state: 'idle', voices: [] }, sessions: [] },
  };
  sendJson(response, payloads[pathname] || { ok: true });
  return true;
}

function contentType(file) {
  switch (path.extname(file).toLowerCase()) {
    case '.html': return 'text/html; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.js':
    case '.mjs': return 'application/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.gif': return 'image/gif';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    case '.svg': return 'image/svg+xml';
    case '.woff2': return 'font/woff2';
    default: return 'application/octet-stream';
  }
}

function safeStaticPath(pathname) {
  const decoded = decodeURIComponent(pathname);
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const file = path.resolve(webRoot, relative);
  if (file !== webRoot && !file.startsWith(`${webRoot}${path.sep}`)) return '';
  return file;
}

const requests = [];
const preferenceJournal = { updatedAt: 0, values: {} };

function readJsonBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { resolve({}); }
    });
    request.on('error', () => resolve({}));
  });
}

function handleFixtureRequest(request, response) {
  const url = new URL(request.url || '/', 'http://127.0.0.1');
  requests.push(`${request.method || 'GET'} ${url.pathname}`);
  if (url.pathname === '/api/app/preferences' && request.method === 'POST') {
    void readJsonBody(request).then((payload) => {
      preferenceJournal.updatedAt = Math.max(
        preferenceJournal.updatedAt,
        Number(payload?.updatedAt) || Date.now()
      );
      preferenceJournal.values = payload?.values && typeof payload.values === 'object'
        ? { ...payload.values }
        : {};
      sendJson(response, {
        ok: true,
        version: 1,
        updatedAt: preferenceJournal.updatedAt,
        values: preferenceJournal.values,
      });
    });
    return;
  }
  if (fixtureApi(url.pathname, response)) return;
  const file = safeStaticPath(url.pathname);
  if (!file || !existsSync(file)) {
    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'content-type': contentType(file),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(readFileSync(file));
}

const server = createServer(handleFixtureRequest);
const restartServer = createServer(handleFixtureRequest);

await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const port = server.address().port;
await new Promise((resolve, reject) => {
  restartServer.once('error', reject);
  restartServer.listen(0, '127.0.0.1', resolve);
});
const restartPort = restartServer.address().port;

const browser = spawn(edge, [
  '--headless=new',
  '--no-sandbox',
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-sync',
  '--enable-webgl',
  // FE Monster's real WebView2 renderer is launched with --expose-gc. Keep
  // this browser contract aligned so the Workshop's `class gc` collision and
  // its verified bundle-source fallback are exercised in every release check.
  '--js-flags=--expose-gc',
  '--ignore-gpu-blocklist',
  '--remote-allow-origins=*',
  '--remote-debugging-port=0',
  `--user-data-dir=${profile}`,
  'about:blank',
], {
  env: { ...process.env, TEMP: tempRoot, TMP: tempRoot },
  stdio: ['ignore', 'ignore', 'pipe'],
  windowsHide: true,
});

let browserError = '';
browser.stderr?.on('data', (chunk) => { browserError += String(chunk); });
let socket;
let nextId = 1;
const pending = new Map();
const pageErrors = [];
const executionContexts = new Map();
const networkResponses = new Map();
const networkFailures = [];
const attachedTargets = new Map();
const consoleMessages = [];

async function debugPort() {
  const activePort = path.join(profile, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (existsSync(activePort)) {
      try {
        const value = Number.parseInt(readFileSync(activePort, 'utf8').split(/\r?\n/, 1)[0], 10);
        if (Number.isInteger(value) && value > 0) return value;
      } catch {}
    }
    await wait(50);
  }
  throw new Error(`Edge debugging endpoint did not start: ${browserError.trim()}`);
}

async function retryJson(url) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await wait(50);
  }
  throw new Error('Edge target list was unavailable');
}

function command(method, params = {}, sessionId = '') {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      const detail = method === 'Runtime.evaluate'
        ? ` (${String(params.expression || '').replace(/\s+/g, ' ').slice(0, 140)})`
        : '';
      reject(new Error(`DevTools command timed out: ${method}${detail}`));
    }, 15_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
}

async function evaluate(expression) {
  const result = await command('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

async function evaluateInContext(contextId, expression, sessionId = '') {
  const result = await command('Runtime.evaluate', {
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: true,
  }, sessionId);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function flattenFrames(frameTree, result = []) {
  if (!frameTree?.frame) return result;
  result.push(frameTree.frame);
  (frameTree.childFrames || []).forEach((child) => flattenFrames(child, result));
  return result;
}

async function waitFor(expression, label, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

try {
  const devtoolsPort = await debugPort();
  const targets = await retryJson(`http://127.0.0.1:${devtoolsPort}/json`);
  const page = targets.find((target) => target.type === 'page');
  assert.ok(page?.webSocketDebuggerUrl, 'No Edge page target was found');
  socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.method === 'Target.attachedToTarget') {
      const sessionId = String(message.params?.sessionId || '');
      if (sessionId) {
        attachedTargets.set(sessionId, message.params?.targetInfo || {});
        void command('Runtime.enable', {}, sessionId).catch(() => {});
        void command('Network.enable', {}, sessionId).catch(() => {});
      }
      return;
    }
    if (message.method === 'Target.detachedFromTarget') {
      attachedTargets.delete(String(message.params?.sessionId || ''));
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      const context = message.params?.context;
      if (context?.id) {
        const sessionId = String(message.sessionId || '');
        executionContexts.set(`${sessionId}:${context.id}`, { ...context, sessionId });
      }
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      executionContexts.delete(`${String(message.sessionId || '')}:${message.params?.executionContextId}`);
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') {
      const sessionId = String(message.sessionId || '');
      Array.from(executionContexts.entries()).forEach(([key, context]) => {
        if (context.sessionId === sessionId) executionContexts.delete(key);
      });
      return;
    }
    if (message.method === 'Network.responseReceived') {
      const response = message.params?.response;
      if (response?.url) networkResponses.set(response.url, Number(response.status) || 0);
      return;
    }
    if (message.method === 'Network.loadingFailed') {
      networkFailures.push({
        requestId: String(message.params?.requestId || ''),
        errorText: String(message.params?.errorText || ''),
        canceled: message.params?.canceled === true,
      });
      return;
    }
    if (message.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push({
        sessionId: String(message.sessionId || ''),
        type: String(message.params?.type || ''),
        text: (message.params?.args || []).map((argument) => (
          argument.value == null ? String(argument.description || '') : String(argument.value)
        )).join(' '),
      });
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      pageErrors.push(String(message.params?.exceptionDetails?.exception?.description
        || message.params?.exceptionDetails?.text
        || 'unknown page exception'));
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(new Error(message.error.message));
    else waiter.resolve(message.result);
  });
  await Promise.all([
    command('Page.enable'),
    command('Runtime.enable'),
    command('Network.enable'),
    command('Target.setAutoAttach', {
      autoAttach: true,
      waitForDebuggerOnStart: false,
      flatten: true,
    }),
  ]);
  await command('Page.navigate', {
    url: `http://127.0.0.1:${port}/?client=embedded&qa=sonic-topography-wallpaper-engine`,
  });
  await waitFor("document.readyState === 'complete'", 'the real app document');
  await waitFor(
    "window.FeMonsterPetActionBridge?.execute && window.FeMonsterAppCommands?.catalog?.().some((item) => item.command === 'scene.preset.catalog.query')",
    'the public scene preset command interface',
  );
  await waitFor(
    "!document.getElementById('bootLogoButton')?.disabled",
    'the boot entry control',
  );
  await evaluate("document.getElementById('bootLogoButton')?.click(); true");
  await waitFor(
    "document.getElementById('bootScreen')?.hidden === true",
    'the main UI after boot entry',
  );
  await wait(250);

  const report = await evaluate(`(async () => {
    const bridge = window.FeMonsterPetActionBridge;
    const execute = (command, args = {}, context = {}) => bridge.execute({
      name: 'control_app',
      arguments: { command, arguments: args },
    }, { source: 'preset-contract-test', ...context });
    const plainError = (error) => ({
      message: String(error?.message || error || ''),
      code: String(error?.code || ''),
    });
    const commandResult = async (command, args, context) => {
      try { return { ok: true, value: await execute(command, args, context) }; }
      catch (error) { return { ok: false, error: plainError(error) }; }
    };
    const fetchResource = async (url) => {
      if (!url) return { ok: false, status: 0, type: '', url: '' };
      try {
        const parsed = new URL(url, location.href);
        if (parsed.origin !== location.origin) {
          return { ok: false, status: 0, type: '', url: parsed.href, external: true };
        }
        const response = await fetch(parsed.href, { cache: 'no-store' });
        return {
          ok: response.ok,
          status: response.status,
          type: response.headers.get('content-type') || '',
          url: parsed.pathname,
          bytes: Number((await response.arrayBuffer()).byteLength),
        };
      } catch (error) {
        return { ok: false, status: 0, type: '', url: String(url), error: plainError(error) };
      }
    };

    const discovered = await commandResult('scene.preset.catalog.query', {
      query: '音域回响',
      limit: 20,
    });
    const presets = Array.isArray(discovered.value?.presets) ? discovered.value.presets : [];
    const preset = presets.find((item) => item?.name === '音域回响') || null;
    const resource = preset?.resource && typeof preset.resource === 'object'
      ? preset.resource
      : {};
    const [entryAsset, previewAsset] = await Promise.all([
      fetchResource(resource.entryUrl),
      fetchResource(resource.previewUrl),
    ]);

    const application = preset
      ? await commandResult('scene.preset.set', { preset: preset.id })
      : { ok: false, error: { code: 'preset_missing', message: '音域回响未注册' } };
    await new Promise((resolve) => setTimeout(resolve, 200));
    const current = await commandResult('scene.preset.current.query', {});
    const matchingFrame = resource.entryUrl
      ? Array.from(document.querySelectorAll('iframe')).find((frame) => {
          try {
            return new URL(frame.src, location.href).pathname
              === new URL(resource.entryUrl, location.href).pathname;
          } catch { return false; }
        })
      : null;
    const sandboxTokens = matchingFrame
      ? String(matchingFrame.getAttribute('sandbox') || '').split(/\\s+/).filter(Boolean)
      : [];

    const parameterCatalog = { ok: Boolean(preset), pages: [], error: null };
    const parameters = [];
    if (preset) {
      let cursor = 0;
      for (let pageIndex = 0; pageIndex < 8; pageIndex += 1) {
        const page = await commandResult('app.parameters.catalog.query', {
          preset: preset.id,
          cursor,
          limit: 20,
        });
        parameterCatalog.pages.push(page);
        if (!page.ok) {
          parameterCatalog.ok = false;
          parameterCatalog.error = page.error;
          break;
        }
        parameters.push(...(Array.isArray(page.value?.parameters) ? page.value.parameters : []));
        if (page.value?.nextCursor == null) break;
        cursor = Number(page.value.nextCursor);
        if (!Number.isFinite(cursor)) break;
      }
    } else {
      parameterCatalog.error = { code: 'preset_missing', message: '音域回响未注册' };
    }
    const expectedSourceProperties = [
      'audioIntensity',
      'autoRotateEnabled',
      'autoRotateSpeed',
      'cameraAngleX',
      'cameraAngleY',
      'cameraDistance',
      'controllerSize',
      'controllerX',
      'controllerY',
      'gridSize',
      'idleWaveDebounce',
      'idleWaveEnabled',
      'idleWaveFadeDuration',
      'meteorClickEnabled',
      'meteorCooldown',
      'meteorEnabled',
      'meteorSensitivity',
      'peakColorEnabled',
      'peakColorIntensity',
      'pulseCooldown',
      'pulseEnabled',
      'pulseSensitivity',
      'responseRange',
      'showAlbumCover',
      'showPlayerController',
      'theme',
      'themeCycleInterval',
    ];
    const sourceParameters = new Map(parameters
      .filter((item) => item?.sourceProperty)
      .map((item) => [String(item.sourceProperty), item]));
    const semanticText = (item) => [item?.key, item?.name, item?.purpose]
      .map((value) => String(value || '').toLowerCase()).join(' ');
    const audioIntensity = sourceParameters.get('audioIntensity')
      || parameters.find((item) => /音频.*强度|audio.*intensity/i.test(semanticText(item)))
      || null;
    const gridSize = sourceParameters.get('gridSize')
      || parameters.find((item) => /渲染.*精度|grid.*size/i.test(semanticText(item)))
      || null;
    const hasTheme = parameters.some((item) => /主题|theme/i.test(semanticText(item)));
    const hasCamera = parameters.some((item) => /相机|视角|camera/i.test(semanticText(item)));
    const hasRipple = parameters.some((item) => /波纹|ripple|pulse/i.test(semanticText(item)));
    const hasMeteor = parameters.some((item) => /流星|meteor/i.test(semanticText(item)));

    const validApply = audioIntensity
      ? await commandResult('app.parameters.batch.apply', {
          changes: [{ key: audioIntensity.key, value: 1.3 }],
        })
      : { ok: false, error: { code: 'parameter_missing', message: '音频强度参数未注册' } };
    const afterValid = audioIntensity
      ? await commandResult('app.parameters.current.query', { keys: [audioIntensity.key] })
      : { ok: false, error: { code: 'parameter_missing', message: '音频强度参数未注册' } };
    const valueAfterValid = afterValid.value?.parameters?.[0]?.value
      ?? afterValid.value?.parameters?.[0]?.currentValue;
    const invalidApply = audioIntensity
      ? await commandResult('app.parameters.batch.apply', {
          changes: [{ key: audioIntensity.key, value: 99 }],
        })
      : { ok: false, error: { code: 'parameter_missing', message: '音频强度参数未注册' } };
    const afterInvalid = audioIntensity
      ? await commandResult('app.parameters.current.query', { keys: [audioIntensity.key] })
      : { ok: false, error: { code: 'parameter_missing', message: '音频强度参数未注册' } };
    const valueAfterInvalid = afterInvalid.value?.parameters?.[0]?.value
      ?? afterInvalid.value?.parameters?.[0]?.currentValue;
    const gridOptions = Array.isArray(gridSize?.options)
      ? gridSize.options.map((option) => Number(option?.value)).filter(Number.isFinite)
      : [];
    const gridHighImpactValues = Array.isArray(gridSize?.highImpactValues)
      ? gridSize.highImpactValues.map(Number).filter(Number.isFinite)
      : [];
    const automaticGridApply = gridSize
      ? await commandResult('app.parameters.batch.apply', {
          changes: [{ key: gridSize.key, value: 640 }],
          explicit: false,
        }, {
          automatic: true,
          operationId: 'soundscape-grid-auto-640',
        })
      : { ok: false, error: { code: 'parameter_missing', message: '渲染精度参数未注册' } };
    const manualGridApply = gridSize
      ? await commandResult('app.parameters.batch.apply', {
          changes: [{ key: gridSize.key, value: 640 }],
          explicit: true,
        }, {
          confirmed: true,
          operationId: 'soundscape-grid-manual-640',
        })
      : { ok: false, error: { code: 'parameter_missing', message: '渲染精度参数未注册' } };
    let runtimeAfterApply = null;
    const recoveryDeadline = performance.now() + 5_000;
    do {
      runtimeAfterApply = (await commandResult('scene.preset.current.query', {})).value?.runtime || null;
      if (
        Number(runtimeAfterApply?.requestedParameters?.gridSize) === 640
        && Number(runtimeAfterApply?.effectiveParameters?.gridSize) === 640
        && runtimeAfterApply?.startupRecovery?.state === 'recovered'
      ) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } while (performance.now() < recoveryDeadline);
    const afterManualGrid = gridSize
      ? await commandResult('app.parameters.current.query', { keys: [gridSize.key] })
      : { ok: false, error: { code: 'parameter_missing', message: '渲染精度参数未注册' } };
    const gridValueAfterManual = afterManualGrid.value?.parameters?.[0]?.value
      ?? afterManualGrid.value?.parameters?.[0]?.currentValue;

    const checks = {
      discoverable: Boolean(preset),
      metadata:
        preset?.id === 'soundscape-workshop'
        && preset?.name === '音域回响'
        && preset?.author === 'CmZya'
        && preset?.platform === 'Wallpaper Engine'
        && String(preset?.workshopId || '') === '3747222633',
      bundledResources:
        resource.kind === 'sandboxed-web'
        && resource.entryUrl === 'assets/soundscape-workshop/runtime.html'
        && resource.previewUrl === 'assets/soundscape-workshop/preview.gif'
        && entryAsset.ok
        && entryAsset.type.startsWith('text/html')
        && entryAsset.bytes > 0
        && previewAsset.ok
        && previewAsset.type.startsWith('image/')
        && previewAsset.bytes > 0,
      application:
        application.ok
        && application.value?.selectedPreset?.id === preset?.id
        && current.value?.preset?.id === preset?.id,
      isolatedRuntime:
        Boolean(matchingFrame)
        && sandboxTokens.includes('allow-scripts')
        && !sandboxTokens.includes('allow-same-origin')
        && runtimeAfterApply?.mounted === true
        && runtimeAfterApply?.ready === true
        && Number(runtimeAfterApply?.lastHeartbeat?.frameCount) > 0
        && document.getElementById('soundscapeWorkshopStatus')?.hidden === true,
      vrrDriverManaged:
        runtimeAfterApply?.performance?.framePacing === 'vrr-driver-managed'
        && Number(runtimeAfterApply?.performance?.requestedFps) === 0
        && runtimeAfterApply?.performance?.fixedFpsLimit === null
        && !Object.hasOwn(runtimeAfterApply?.performance || {}, 'fpsLimit'),
      adjustableParameterSet:
        expectedSourceProperties.length === 27
        && expectedSourceProperties.every((property) => sourceParameters.has(property))
        && Boolean(audioIntensity)
        && audioIntensity.type === 'number'
        && Number(audioIntensity.range?.min) === 0.3
        && Number(audioIntensity.range?.max) === 2.5
        && hasTheme
        && hasCamera
        && hasRipple
        && hasMeteor,
      gridOptionsAndRisk:
        JSON.stringify(gridOptions) === JSON.stringify([120, 160, 320, 640, 1080, 4096])
        && JSON.stringify(gridHighImpactValues) === JSON.stringify([640, 1080, 4096])
        && gridSize?.requiresExplicitSelection === true,
      appliesValidParameter:
        validApply.ok
        && Number(valueAfterValid) === 1.3
        && Number(runtimeAfterApply?.parameters?.audioIntensity) === 1.3
        && Number(runtimeAfterApply?.parameterRevision) > 0,
      rejectsUnsafeOutOfRangeParameter:
        !invalidApply.ok
        && Number(valueAfterInvalid) === 1.3,
      highLoadCannotRunAutomatically:
        Boolean(gridSize)
        && !automaticGridApply.ok
        && automaticGridApply.error?.code !== 'parameter_missing',
      explicitHighLoadCanRunManually:
        manualGridApply.ok
        && Number(gridValueAfterManual) === 640
        && Number(runtimeAfterApply?.requestedParameters?.gridSize) === 640
        && Number(runtimeAfterApply?.effectiveParameters?.gridSize) === 640
        && Number(runtimeAfterApply?.parameters?.gridSize) === 640
        && Number(runtimeAfterApply?.lastKnownSafeGridSize) === 320
        && runtimeAfterApply?.startupRecovery?.state === 'recovered',
      persistsAcrossReload: false,
    };
    return {
      pass: Object.values(checks).every(Boolean),
      checks,
      preset,
      resource,
      entryAsset,
      previewAsset,
      application,
      current,
      iframe: matchingFrame ? { sandboxTokens, src: matchingFrame.src } : null,
      parameterCount: parameters.length,
      expectedSourceProperties,
      discoveredSourceProperties: Array.from(sourceParameters.keys()),
      parameterKeys: parameters.map((item) => item.key),
      audioIntensity,
      gridSize,
      validApply,
      valueAfterValid,
      invalidApply,
      valueAfterInvalid,
      automaticGridApply,
      manualGridApply,
      gridValueAfterManual,
      runtimeAfterApply,
      persistenceSeed: preset && audioIntensity && gridSize ? {
        presetId: preset.id,
        audioKey: audioIntensity.key,
        gridKey: gridSize.key,
      } : null,
    };
  })()`);

  async function measureWorkshopControlLayout(width, height) {
    await command('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await wait(120);
    return evaluate(`(() => {
      const rect = (element) => {
        const box = element?.getBoundingClientRect();
        return box ? {
          left: box.left,
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          width: box.width,
          height: box.height,
        } : null;
      };
      const localRect = (element, ancestor) => {
        if (!element || !ancestor) return null;
        let left = 0;
        let top = 0;
        let current = element;
        while (current && current !== ancestor) {
          left += current.offsetLeft;
          top += current.offsetTop;
          current = current.offsetParent;
        }
        if (current !== ancestor) {
          left = element.offsetLeft - ancestor.offsetLeft;
          top = element.offsetTop - ancestor.offsetTop;
        }
        return {
          left,
          top,
          right: left + element.offsetWidth,
          bottom: top + element.offsetHeight,
          width: element.offsetWidth,
          height: element.offsetHeight,
        };
      };
      const outside = (child, parent) => Boolean(
        child && parent && (
          child.left < parent.left - 1
          || child.right > parent.right + 1
          || child.top < parent.top - 1
          || child.bottom > parent.bottom + 1
        )
      );
      const overlaps = (left, right) => Boolean(
        left && right
        && Math.min(left.right, right.right) - Math.max(left.left, right.left) > 0.5
        && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 0.5
      );
      const host = document.getElementById('soundscapeWorkshopControls');
      const rows = Array.from(host?.querySelectorAll('.soundscape-workshop-control') || []).map((row) => {
        const copy = row.querySelector(':scope > span');
        const control = row.querySelector('[data-soundscape-property]');
        const output = row.querySelector('output');
        const rowRect = rect(row);
        const localRowRect = { left: 0, top: 0, right: row.clientWidth, bottom: row.clientHeight };
        const copyRect = localRect(copy, row);
        const controlRect = localRect(control, row);
        const outputRect = localRect(output, row);
        return {
          property: control?.dataset.soundscapeProperty || '',
          type: control?.type || control?.tagName?.toLowerCase() || '',
          row: rowRect,
          copy: copyRect,
          control: controlRect,
          output: outputRect,
          clientWidth: row.clientWidth,
          scrollWidth: row.scrollWidth,
          overflow: row.scrollWidth > row.clientWidth + 1,
          outside: [copyRect, controlRect, outputRect].some((child) => outside(child, localRowRect)),
          overlap:
            overlaps(copyRect, controlRect)
            || overlaps(copyRect, outputRect)
            || overlaps(controlRect, outputRect),
        };
      });
      const variableControls = rows.filter((row) => row.type === 'range' || row.type === 'select-one');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        sidebar: rect(document.getElementById('diySidebar')),
        host: rect(host),
        hostClientWidth: host?.clientWidth || 0,
        hostScrollWidth: host?.scrollWidth || 0,
        columns: host ? getComputedStyle(host).gridTemplateColumns : '',
        rowCount: rows.length,
        overflowCount: rows.filter((row) => row.overflow).length,
        outsideCount: rows.filter((row) => row.outside).length,
        overlapCount: rows.filter((row) => row.overlap).length,
        minCopyWidth: rows.length ? Math.min(...rows.map((row) => row.copy?.width || 0)) : 0,
        minVariableControlWidth: variableControls.length
          ? Math.min(...variableControls.map((row) => row.control?.width || 0))
          : 0,
        rows,
      };
    })()`);
  }

  await evaluate("document.getElementById('diyButton')?.click()");
  await wait(120);
  await evaluate("document.getElementById('diyPresetButton')?.click()");
  await wait(450);
  const workshopControlLayouts = {
    desktop: await measureWorkshopControlLayout(1280, 800),
    narrow: await measureWorkshopControlLayout(390, 844),
  };
  await command('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await wait(120);
  const usableWorkshopControlLayout = (layout) => Boolean(
    layout?.rowCount === 27
    && layout.hostClientWidth > 0
    && layout.hostScrollWidth <= layout.hostClientWidth + 1
    && layout.overflowCount === 0
    && layout.outsideCount === 0
    && layout.overlapCount === 0
    && layout.minCopyWidth >= 72
    && layout.minVariableControlWidth >= 100
  );
  report.workshopControlLayouts = workshopControlLayouts;
  report.checks.controlsFitDesktopSidebar = usableWorkshopControlLayout(workshopControlLayouts.desktop);
  report.checks.controlsFitNarrowSidebar = usableWorkshopControlLayout(workshopControlLayouts.narrow);

  await wait(250);
  const frameTree = (await command('Page.getFrameTree')).frameTree;
  const workshopFrame = flattenFrames(frameTree)
    .find((frame) => new URL(frame.url).pathname.endsWith('/assets/soundscape-workshop/runtime.html'));
  const workshopContext = workshopFrame
    ? Array.from(executionContexts.values()).find((context) => (
        context.auxData?.frameId === workshopFrame.id
        && context.auxData?.isDefault === true
      ))
    : Array.from(executionContexts.values()).find((context) => (
        context.auxData?.isDefault === true
        && attachedTargets.get(context.sessionId)?.type === 'iframe'
      )) || null;
  const interactionEvidence = {
    available: false,
    lyricBefore: null,
    lyricAfterRotate: null,
    lyricAfterWheel: null,
    lyricAfterReset: null,
    persistedAfterGesture: null,
    controllerBefore: null,
    controllerAfterDrag: null,
    controllerAfterInteractiveHold: null,
    controllerStored: null,
    childPlayer: null,
    lyricBridgeTrace: null,
    lyricHostHit: null,
    seekRequests: 0,
    nextRequests: 0,
    previousRequests: 0,
  };
  if (workshopContext) {
    const interactionSetup = await evaluate(`(() => {
      setTextPreset('depth', { persist: false });
      state.multiRowLyricsEnabled = false;
      state.textComposerSettings = normalizeTextComposerSettings({
        ...state.textComposerSettings,
        layoutMode: 'single',
        lyricsEnabled: true,
      });
      state.lyricDisplayText = 'Sandbox bridge lyric';
      if (els.playbackLyricText) {
        els.playbackLyricText.textContent = state.lyricDisplayText;
        els.playbackLyricText.hidden = false;
      }
      if (els.playbackLyricScene) els.playbackLyricScene.hidden = false;
      updateTextPresetTransform({ persist: true });
      const lyric = els.playbackLyricText?.getBoundingClientRect();
      const frame = state.soundscapeWorkshop.runtime?.iframe?.getBoundingClientRect();
      return {
        lyric: lyric ? { left: lyric.left, top: lyric.top, width: lyric.width, height: lyric.height } : null,
        frame: frame ? { left: frame.left, top: frame.top, width: frame.width, height: frame.height } : null,
        transform: { ...textPresetTransform() },
        controller: window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime).controllerPosition,
      };
    })()`);
    interactionEvidence.available = Boolean(
      interactionSetup?.lyric?.width > 0
      && interactionSetup?.lyric?.height > 0
      && interactionSetup?.frame?.width > 0
      && interactionSetup?.frame?.height > 0
    );
    interactionEvidence.lyricBefore = interactionSetup?.transform || null;
    interactionEvidence.controllerBefore = interactionSetup?.controller || null;
    if (interactionEvidence.available) {
      const frame = interactionSetup.frame;
      const lyric = interactionSetup.lyric;
      const normalized = (clientX, clientY) => ({
        x: Math.min(1, Math.max(0, (clientX - frame.left) / frame.width)),
        y: Math.min(1, Math.max(0, (clientY - frame.top) / frame.height)),
      });
      const head = normalized(lyric.left + lyric.width * 0.12, lyric.top + lyric.height / 2);
      const movedHead = normalized(lyric.left + lyric.width * 0.12 + 54, lyric.top + lyric.height / 2 - 32);
      const middle = normalized(lyric.left + lyric.width / 2, lyric.top + lyric.height / 2);
      interactionEvidence.lyricHostHit = await evaluate(`(() => {
        const event = {
          clientX: ${JSON.stringify(lyric.left + lyric.width * 0.12)},
          clientY: ${JSON.stringify(lyric.top + lyric.height / 2)},
          pointerId: 31,
        };
        const hit = textPresetHitTest(event, 12, { allowTransformedBounds: true });
        const runtime = state.soundscapeWorkshop.runtime;
        window.__feSoundscapeLyricTrace = [];
        if (runtime?.options?.onGesture) {
          const original = runtime.options.onGesture;
          runtime.options.onGesture = (gesture) => {
            window.__feSoundscapeLyricTrace.push({ ...gesture });
            return original(gesture);
          };
        }
        return hit ? { zone: hit.zone } : null;
      })()`);
      await evaluateInContext(workshopContext.id, `(() => {
        const fire = (type, point, init = {}) => {
          const x = point.x * innerWidth;
          const y = point.y * innerHeight;
          const target = document.elementFromPoint(x, y) || document.querySelector('canvas') || document.body;
          const EventType = type === 'wheel' ? WheelEvent : type === 'dblclick' ? MouseEvent : PointerEvent;
          target.dispatchEvent(new EventType(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerId: init.pointerId ?? 31,
            button: init.button ?? 0,
            buttons: init.buttons ?? (type === 'pointerup' ? 0 : 1),
            isPrimary: true,
            deltaX: init.deltaX || 0,
            deltaY: init.deltaY || 0,
            deltaZ: 0,
          }));
        };
        const head = ${JSON.stringify(head)};
        const moved = ${JSON.stringify(movedHead)};
        fire('pointerdown', head, { pointerId: 31 });
        fire('pointermove', moved, { pointerId: 31 });
        fire('pointerup', moved, { pointerId: 31, buttons: 0 });
      })()`, workshopContext.sessionId);
      await wait(120);
      interactionEvidence.lyricAfterRotate = await evaluate("({ ...textPresetTransform() })");
      interactionEvidence.lyricBridgeTrace = await evaluate("window.__feSoundscapeLyricTrace || []");
      await evaluateInContext(workshopContext.id, `(() => {
        const point = ${JSON.stringify(middle)};
        const x = point.x * innerWidth;
        const y = point.y * innerHeight;
        const target = document.elementFromPoint(x, y) || document.querySelector('canvas') || document.body;
        target.dispatchEvent(new WheelEvent('wheel', {
          bubbles: true, cancelable: true, clientX: x, clientY: y, deltaY: -120,
        }));
      })()`, workshopContext.sessionId);
      await wait(120);
      interactionEvidence.lyricAfterWheel = await evaluate("({ ...textPresetTransform() })");
      interactionEvidence.persistedAfterGesture = await evaluate(`(() => {
        const saved = JSON.parse(localStorage.getItem('fe-monster-text-preset-transforms-v1') || '{}');
        return saved.transforms?.depth || null;
      })()`);
      await evaluateInContext(workshopContext.id, `(() => {
        const x = innerWidth * 0.08;
        const y = innerHeight * 0.82;
        const target = document.elementFromPoint(x, y) || document.querySelector('canvas') || document.body;
        target.dispatchEvent(new MouseEvent('dblclick', {
          bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0,
        }));
      })()`, workshopContext.sessionId);
      await wait(120);
      interactionEvidence.lyricAfterReset = await evaluate("({ ...textPresetTransform() })");

      interactionEvidence.childPlayer = await evaluateInContext(workshopContext.id, `(async () => {
        const candidates = Array.from(document.querySelectorAll('div')).filter((element) => {
          const classes = String(element.className || '').toLowerCase();
          const rect = element.getBoundingClientRect();
          return classes.includes('select-none')
            && (classes.includes('z-50') || classes.includes('absolute'))
            && rect.width >= 180 && rect.width <= 620
            && rect.height >= 40 && rect.height <= 320;
        });
        const root = candidates.sort((left, right) => (
          right.getBoundingClientRect().width * right.getBoundingClientRect().height
          - left.getBoundingClientRect().width * left.getBoundingClientRect().height
        ))[0] || null;
        if (!root) return { found: false };
        const rect = root.getBoundingClientRect();
        const start = { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.28 };
        const moved = {
          x: Math.max(8, Math.min(innerWidth - 8, start.x - 96)),
          y: Math.max(8, Math.min(innerHeight - 8, start.y + 104)),
        };
        const pointer = (type, target, point, pointerId) => target.dispatchEvent(new PointerEvent(type, {
          bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
          pointerId, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
        }));
        pointer('pointerdown', root, start, 41);
        await new Promise((resolve) => setTimeout(resolve, 390));
        pointer('pointermove', root, moved, 41);
        pointer('pointerup', root, moved, 41);
        return {
          found: true,
          rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          start,
          moved,
        };
      })()`, workshopContext.sessionId);
      await wait(160);
      interactionEvidence.controllerAfterDrag = await evaluate(
        "window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime).controllerPosition",
      );
      if (interactionEvidence.childPlayer?.found) {
        await evaluateInContext(workshopContext.id, `(async () => {
          const root = Array.from(document.querySelectorAll('div')).find((element) => {
            const classes = String(element.className || '').toLowerCase();
            const rect = element.getBoundingClientRect();
            return classes.includes('select-none') && classes.includes('z-50')
              && rect.width >= 180 && rect.width <= 620
              && rect.height >= 40 && rect.height <= 320;
          });
          if (!root) return false;
          const button = document.createElement('button');
          button.textContent = 'safe interactive target';
          root.appendChild(button);
          const rect = root.getBoundingClientRect();
          const start = { x: rect.left + 24, y: rect.top + 24 };
          const moved = { x: start.x + 80, y: start.y + 80 };
          const fire = (type, point) => button.dispatchEvent(new PointerEvent(type, {
            bubbles: true, cancelable: true, clientX: point.x, clientY: point.y,
            pointerId: 42, button: 0, buttons: type === 'pointerup' ? 0 : 1, isPrimary: true,
          }));
          fire('pointerdown', start);
          await new Promise((resolve) => setTimeout(resolve, 390));
          fire('pointermove', moved);
          fire('pointerup', moved);
          button.remove();
          return true;
        })()`, workshopContext.sessionId);
        await wait(120);
        interactionEvidence.controllerAfterInteractiveHold = await evaluate(
          "window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime).controllerPosition",
        );
        interactionEvidence.controllerStored = await evaluate(`(() => {
          const saved = JSON.parse(localStorage.getItem('fe-monster-soundscape-workshop-settings-v3') || 'null');
          return saved?.controllerPosition || null;
        })()`);
        await evaluateInContext(workshopContext.id, `(async () => {
          const roots = Array.from(document.querySelectorAll('div')).filter((element) => {
            const classes = String(element.className || '').toLowerCase();
            const rect = element.getBoundingClientRect();
            return classes.includes('select-none') && classes.includes('z-50')
              && rect.width >= 180 && rect.width <= 620
              && rect.height >= 40 && rect.height <= 320;
          });
          const root = roots[0];
          if (!root) return { seek: false, wheel: false };
          const bars = Array.from(root.querySelectorAll('div')).filter((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            return rect.width >= 40 && rect.height > 0 && rect.height <= 18
              && (String(style.borderRadius).includes('999') || String(element.className).includes('rounded-full'));
          }).sort((left, right) => right.getBoundingClientRect().width - left.getBoundingClientRect().width);
          const progress = bars[0] || null;
          if (progress) {
            const rect = progress.getBoundingClientRect();
            progress.dispatchEvent(new PointerEvent('pointerdown', {
              bubbles: true, cancelable: true, clientX: rect.left + rect.width * 0.75,
              clientY: rect.top + rect.height / 2, pointerId: 43, button: 0, buttons: 1, isPrimary: true,
            }));
          }
          const rootRect = root.getBoundingClientRect();
          const wheel = (deltaY) => root.dispatchEvent(new WheelEvent('wheel', {
            bubbles: true, cancelable: true,
            clientX: rootRect.left + rootRect.width / 2,
            clientY: rootRect.top + rootRect.height / 2,
            deltaY,
          }));
          wheel(120);
          wheel(120);
          await new Promise((resolve) => setTimeout(resolve, 900));
          wheel(-120);
          return { seek: !!progress, wheel: true };
        })()`, workshopContext.sessionId);
        await wait(600);
      }
      interactionEvidence.seekRequests = requests.filter((item) => item.startsWith('GET /api/player/seek')).length;
      interactionEvidence.nextRequests = requests.filter((item) => item === 'GET /api/player/next').length;
      interactionEvidence.previousRequests = requests.filter((item) => item === 'GET /api/player/previous').length;
    }
  }
  const workshopVisual = workshopContext
    ? await evaluateInContext(workshopContext.id, `(async () => {
        const root = document.getElementById('root');
        const rootRect = root?.getBoundingClientRect();
        const canvases = Array.from(document.querySelectorAll('canvas')).map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          const style = getComputedStyle(canvas);
          return {
            width: rect.width,
            height: rect.height,
            backingWidth: canvas.width,
            backingHeight: canvas.height,
            display: style.display,
            visibility: style.visibility,
            opacity: Number(style.opacity),
          };
        });
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl') || null;
        let framebuffer = null;
        if (gl && canvas) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));
          const width = gl.drawingBufferWidth;
          const height = gl.drawingBufferHeight;
          const pixels = new Uint8Array(Math.max(0, width * height * 4));
          const beforeError = gl.getError();
          if (width > 0 && height > 0) {
            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
          }
          const afterError = gl.getError();
          let nonBlack = 0;
          let alphaPixels = 0;
          let rgbTotal = 0;
          let rgbMax = 0;
          const quantized = new Set();
          for (let index = 0; index < pixels.length; index += 4) {
            const red = pixels[index];
            const green = pixels[index + 1];
            const blue = pixels[index + 2];
            const alpha = pixels[index + 3];
            const peak = Math.max(red, green, blue);
            if (peak > 4) nonBlack += 1;
            if (alpha > 0) alphaPixels += 1;
            rgbTotal += red + green + blue;
            rgbMax = Math.max(rgbMax, peak);
            if (quantized.size < 512) quantized.add(
              ((red >> 4) << 8) | ((green >> 4) << 4) | (blue >> 4),
            );
          }
          const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
          framebuffer = {
            width,
            height,
            beforeError,
            afterError,
            complete: gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE,
            pixelCount: width * height,
            nonBlack,
            alphaPixels,
            meanRgb: pixels.length ? rgbTotal / (pixels.length / 4) / 3 : 0,
            rgbMax,
            quantizedColors: quantized.size,
            vendor: String(gl.getParameter(gl.VENDOR) || ''),
            renderer: String(gl.getParameter(gl.RENDERER) || ''),
            unmaskedVendor: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '') : '',
            unmaskedRenderer: debugInfo ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '') : '',
          };
        }
        return {
          readyState: document.readyState,
          root: rootRect ? { width: rootRect.width, height: rootRect.height } : null,
          canvasCount: canvases.length,
          canvases,
          framebuffer,
          bridge: window.__feSoundscapeBridgeDiagnostics?.() || null,
        };
      })()`, workshopContext.sessionId)
    : null;
  const workshopAssetPaths = [
    '/assets/soundscape-workshop/runtime.html',
    '/assets/soundscape-workshop/bridge.js',
    '/assets/soundscape-workshop/assets/index-DgmMz9-g.css',
    '/assets/soundscape-workshop/assets/index-CSU_B_T9.js',
  ];
  const workshopAssetResponses = Object.fromEntries(workshopAssetPaths.map((pathname) => {
    const response = Array.from(networkResponses.entries())
      .find(([url]) => new URL(url).pathname === pathname);
    return [pathname, response?.[1] || 0];
  }));
  const attributionPresent = await evaluate(
    "Boolean(document.querySelector('.soundscape-workshop-attribution'))",
  );
  await evaluate(`(() => {
    const shell = document.querySelector('.app-shell');
    if (!shell?.classList.contains('is-diy-open') || !shell.classList.contains('has-diy-card')) {
      document.querySelector('[data-playback-tool="preset"]')?.click();
    }
    return true;
  })()`);
  await wait(250);
  await evaluate(`(() => {
    const page = document.getElementById('diyPresetPage');
    const group = document.getElementById('soundscapeWorkshopFeatureGroup');
    if (page && group) page.scrollTop = Math.max(0, group.offsetTop - page.offsetTop - 6);
    return true;
  })()`);
  await wait(100);
  const controlLayout = await evaluate(`(async () => {
    const host = document.getElementById('soundscapeWorkshopControls');
    const sidebar = document.getElementById('diySidebar');
    const scene = document.getElementById('soundscapeWorkshopScene');
    const rect = (element) => {
      const value = element?.getBoundingClientRect();
      return value ? {
        left: value.left, top: value.top, right: value.right, bottom: value.bottom,
        width: value.width, height: value.height,
      } : null;
    };
    const intersects = (a, b) => Boolean(a && b
      && Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5
      && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5);
    const rowElements = Array.from(host?.querySelectorAll('.soundscape-workshop-control') || []);
    const rows = [];
    for (let index = 0; index < rowElements.length; index += 1) {
      const row = rowElements[index];
      row.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const copy = row.querySelector('span');
      const control = row.querySelector('input, select');
      const output = row.querySelector('output');
      const rowRect = rect(row);
      const copyRect = rect(copy);
      const controlRect = rect(control);
      const outputRect = rect(output);
      const centerX = controlRect ? (controlRect.left + controlRect.right) / 2 : -1;
      const centerY = controlRect ? (controlRect.top + controlRect.bottom) / 2 : -1;
      const hit = centerX >= 0 && centerY >= 0 ? document.elementFromPoint(centerX, centerY) : null;
      rows.push({
        index,
        property: control?.dataset.soundscapeProperty || '',
        row: rowRect,
        copy: copyRect,
        control: controlRect,
        output: outputRect,
        childOverlap: intersects(copyRect, controlRect)
          || intersects(copyRect, outputRect)
          || intersects(controlRect, outputRect),
        clipped: Boolean(rowRect && [copyRect, controlRect, outputRect].some((child) => child && (
          child.left < rowRect.left - 0.5 || child.right > rowRect.right + 0.5
          || child.top < rowRect.top - 0.5 || child.bottom > rowRect.bottom + 0.5
        ))),
        hitTarget: hit ? {
          tag: hit.tagName,
          id: hit.id,
          property: hit.dataset?.soundscapeProperty || '',
        } : null,
        hitCorrect: Boolean(control && hit && (hit === control || control.contains(hit))),
      });
    }
    const rowOverlaps = [];
    for (let index = 0; index < rowElements.length - 1; index += 1) {
      const row = rowElements[index];
      const next = rowElements[index + 1];
      if (next.offsetTop < row.offsetTop + row.offsetHeight - 0.5) rowOverlaps.push([index, index + 1]);
    }
    const sceneRect = rect(scene);
    const centerX = sceneRect ? (sceneRect.left + sceneRect.right) / 2 : 0;
    const centerY = sceneRect ? (sceneRect.top + sceneRect.bottom) / 2 : 0;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      sidebar: rect(sidebar),
      sidebarTransform: sidebar ? getComputedStyle(sidebar).transform : '',
      host: rect(host),
      hostClientWidth: host?.clientWidth || 0,
      hostScrollWidth: host?.scrollWidth || 0,
      hostGridColumns: host ? getComputedStyle(host).gridTemplateColumns : '',
      rows,
      rowOverlaps,
      scene: {
        rect: sceneRect,
        hidden: scene?.hidden === true,
        display: scene ? getComputedStyle(scene).display : '',
        visibility: scene ? getComputedStyle(scene).visibility : '',
        opacity: scene ? getComputedStyle(scene).opacity : '',
        stackAtCenter: document.elementsFromPoint(centerX, centerY).slice(0, 12).map((element) => ({
          tag: element.tagName,
          id: element.id,
          className: typeof element.className === 'string' ? element.className : '',
        })),
      },
    };
  })()`);
  const controlInteraction = await evaluate(`(async () => {
    const control = document.querySelector('[data-soundscape-property="audioIntensity"]');
    const output = document.querySelector('[data-soundscape-output="audioIntensity"]');
    if (!control) return { available: false };
    control.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const before = Number(control.value);
    const next = Math.abs(before - 1.2) < 0.001 ? 1.1 : 1.2;
    control.value = String(next);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const bridge = window.FeMonsterPetActionBridge;
    const query = async () => bridge.execute({
      name: 'control_app',
      arguments: {
        command: 'app.parameters.current.query',
        arguments: { keys: ['preset.soundscape-workshop.audioIntensity'] },
      },
    }, { source: 'soundscape-ui-control-test' });
    const applied = await query();
    const appliedValue = Number(applied?.parameters?.[0]?.value ?? applied?.parameters?.[0]?.currentValue);
    const outputAfterApply = output?.textContent || '';
    control.value = String(before);
    control.dispatchEvent(new Event('input', { bubbles: true }));
    control.dispatchEvent(new Event('change', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const restored = await query();
    const restoredValue = Number(restored?.parameters?.[0]?.value ?? restored?.parameters?.[0]?.currentValue);
    return {
      available: true,
      before,
      next,
      appliedValue,
      restoredValue,
      outputAfterApply,
    };
  })()`);
  const soundscapeHostAuthority = await evaluate(`(() => {
    const scene = document.getElementById('soundscapeWorkshopScene');
    const lyric = document.getElementById('playbackLyricScene');
    const sceneStyle = scene ? getComputedStyle(scene) : null;
    const lyricStyle = lyric ? getComputedStyle(lyric) : null;
    return {
      previousUsablePreset: String(state.soundscapeWorkshop?.previousUsablePreset || ''),
      sceneZIndex: Number(sceneStyle?.zIndex),
      lyricZIndex: Number(lyricStyle?.zIndex),
      lyricPointerEvents: String(lyricStyle?.pointerEvents || ''),
    };
  })()`);
  report.workshopVisual = workshopVisual;
  report.controlLayout = controlLayout;
  report.controlInteraction = controlInteraction;
  report.soundscapeHostAuthority = soundscapeHostAuthority;
  report.devtoolsFrameProbe = {
    workshopFrame: workshopFrame || null,
    attachedTargets: Array.from(attachedTargets.entries()).map(([sessionId, target]) => ({ sessionId, ...target })),
    executionContexts: Array.from(executionContexts.values()).map((context) => ({
      id: context.id,
      sessionId: context.sessionId,
      origin: context.origin,
      name: context.name,
      auxData: context.auxData,
    })),
  };
  report.workshopAssetResponses = workshopAssetResponses;
  report.networkFailures = networkFailures;
  report.checks.visibleCanvas = Boolean(
    workshopVisual?.root?.width > 0
    && workshopVisual?.root?.height > 0
    && workshopVisual?.canvases?.some((canvas) => (
      canvas.width > 0
      && canvas.height > 0
      && canvas.backingWidth > 0
      && canvas.backingHeight > 0
      && canvas.display !== 'none'
      && canvas.visibility !== 'hidden'
      && canvas.opacity > 0
    )),
  );
  report.checks.nonBlackFramebuffer = Boolean(
    workshopVisual?.framebuffer?.complete
    && workshopVisual.framebuffer.beforeError === 0
    && workshopVisual.framebuffer.afterError === 0
    && workshopVisual.framebuffer.nonBlack > workshopVisual.framebuffer.pixelCount * 0.01
    && workshopVisual.framebuffer.rgbMax > 8
  );
  report.checks.webViewGcFallbackBootsExactlyOnce = Boolean(
    workshopVisual?.bridge?.bundleFallbackActive === true
    && workshopVisual?.bridge?.bundleBooted === true
  );
  const transformChanged = (before, after) => Boolean(before && after && (
    Math.abs(Number(after.rotateX) - Number(before.rotateX)) > 0.5
    || Math.abs(Number(after.rotateY) - Number(before.rotateY)) > 0.5
    || Math.abs(Number(after.rotateZ) - Number(before.rotateZ)) > 0.5
  ));
  const samePosition = (left, right) => Boolean(left && right
    && Number(left.x) === Number(right.x)
    && Number(left.y) === Number(right.y));
  report.checks.sandboxLyricGestures = Boolean(
    interactionEvidence.available
    && transformChanged(interactionEvidence.lyricBefore, interactionEvidence.lyricAfterRotate)
    && Number(interactionEvidence.lyricAfterWheel?.scale) > Number(interactionEvidence.lyricAfterRotate?.scale)
    && Math.abs(Number(interactionEvidence.persistedAfterGesture?.scale) - Number(interactionEvidence.lyricAfterWheel?.scale)) < 0.001
  );
  report.checks.sandboxBlankDoubleClickReset = Boolean(
    interactionEvidence.lyricAfterReset
    && Number(interactionEvidence.lyricAfterReset.x) === 0
    && Number(interactionEvidence.lyricAfterReset.y) === 0
    && Number(interactionEvidence.lyricAfterReset.rotateX) === 0
    && Number(interactionEvidence.lyricAfterReset.rotateY) === 0
    && Number(interactionEvidence.lyricAfterReset.rotateZ) === 0
    && Number(interactionEvidence.lyricAfterReset.scale) === 1
  );
  report.checks.sandboxPlayerInteractions = Boolean(
    interactionEvidence.childPlayer?.found
    && !samePosition(interactionEvidence.controllerBefore, interactionEvidence.controllerAfterDrag)
    && samePosition(interactionEvidence.controllerAfterDrag, interactionEvidence.controllerAfterInteractiveHold)
    && samePosition(interactionEvidence.controllerAfterInteractiveHold, interactionEvidence.controllerStored)
    && interactionEvidence.seekRequests >= 1
    && interactionEvidence.nextRequests === 1
    && interactionEvidence.previousRequests >= 1
  );
  report.checks.workshopAssets200 = workshopAssetPaths
    .every((pathname) => workshopAssetResponses[pathname] === 200);
  report.checks.controlsUsable = Boolean(
    controlLayout?.rows?.length === 27
    && controlLayout.hostScrollWidth <= controlLayout.hostClientWidth + 1
    && controlLayout.rowOverlaps.length === 0
    && controlLayout.rows.every((row) => !row.childOverlap && !row.clipped && row.hitCorrect)
  );
  report.checks.controlChangeExecutes = Boolean(
    controlInteraction?.available
    && Math.abs(controlInteraction.appliedValue - controlInteraction.next) < 0.001
    && Math.abs(controlInteraction.restoredValue - controlInteraction.before) < 0.001
    && controlInteraction.outputAfterApply
  );
  report.checks.attributionRemoved = attributionPresent === false;
  report.checks.hostOwnsLyricAndFallbackState = Boolean(
    soundscapeHostAuthority.previousUsablePreset
    && soundscapeHostAuthority.previousUsablePreset !== 'soundscape-workshop'
    && soundscapeHostAuthority.lyricZIndex > soundscapeHostAuthority.sceneZIndex
    && soundscapeHostAuthority.lyricPointerEvents === 'none'
  );
  report.interactionEvidence = interactionEvidence;

  let persistence = {
    checked: false,
    seed: null,
    current: null,
    parameters: null,
    error: null,
  };
  if (report.persistenceSeed) {
    try {
      persistence.seed = await evaluate(`(async () => {
        await applySoundscapeWorkshopProperty('theme', 'ember-fire');
        const lyricTransform = normalizeTextPresetTransform({
          x: 137,
          y: -83,
          rotateX: 12,
          rotateY: -18,
          rotateZ: 7,
          scale: 1.37,
        });
        setTextPreset('depth', { applyTemplate: false, persist: false });
        state.textPresetTransforms.depth = lyricTransform;
        updateTextPresetTransform({ persist: true });
        saveVisualSettingsPreferences({ immediate: true });
        const runtime = window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime);
        return {
          preset: state.diyPreset,
          textPreset: state.textPreset,
          lyricTransform: { ...textPresetTransform('depth') },
          controllerPosition: { ...runtime.controllerPosition },
          ordinary: {
            audioIntensity: Number(runtime.requestedParameters.audioIntensity),
            theme: runtime.requestedParameters.theme,
          },
          grid: {
            requested: Number(runtime.requestedParameters.gridSize),
            effective: Number(runtime.effectiveParameters.gridSize),
          },
        };
      })()`);
      const persistenceSeedSnapshot = persistence.seed;
      await wait(650);
      try {
        await command('Page.reload', { ignoreCache: true });
      } catch (error) {
        if (!/navigated or closed/i.test(String(error?.message || error))) throw error;
      }
      await waitFor("document.readyState === 'complete'", 'the reloaded app document');
      await waitFor(
        "window.FeMonsterPetActionBridge?.execute && window.FeMonsterAppCommands?.catalog?.().some((item) => item.command === 'scene.preset.current.query')",
        'the reloaded public preset interface',
      );
      await wait(500);
      persistence = await evaluate(`(async () => {
        const seed = ${JSON.stringify(report.persistenceSeed)};
        const bridge = window.FeMonsterPetActionBridge;
        const execute = (command, args = {}) => bridge.execute({
          name: 'control_app',
          arguments: { command, arguments: args },
        }, { source: 'preset-contract-reload-test' });
        const initial = await execute('scene.preset.current.query');
        let current = initial;
        const recoveryTimeline = [];
        // The real desktop WebView uses the verified --expose-gc fallback and
        // can legitimately spend an extra retry window rebuilding a persisted
        // high-impact grid. Keep the bound finite, but cover that production
        // boot path rather than only the faster ordinary-browser path.
        const deadline = performance.now() + 8_000;
        do {
          current = await execute('scene.preset.current.query');
          const internal = state.soundscapeWorkshop.runtime;
          recoveryTimeline.push({
            at: Math.round(performance.now()),
            state: current?.runtime?.startupRecovery?.state || '',
            effective: Number(current?.runtime?.effectiveParameters?.gridSize),
            lastHeartbeatAt: Number(current?.runtime?.lastHeartbeatAt),
            heartbeatBaseline: Number(internal?.recoveryHeartbeatBaseline),
            overBudgetFrames: Number(internal?.overBudgetFrames),
            plan: Array.from(internal?.recoveryPlan || []),
          });
          if (
            Number(current?.runtime?.effectiveParameters?.gridSize) === 640
            && current?.runtime?.startupRecovery?.state === 'recovered'
          ) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (performance.now() < deadline);
        const parameters = await execute('app.parameters.current.query', {
          keys: [seed.audioKey, seed.gridKey],
        });
        const byKey = Object.fromEntries((parameters.parameters || []).map((item) => [item.key, item.value ?? item.currentValue]));
        return {
          checked: true,
          initial,
          current,
          parameters,
          byKey,
          recoveryTimeline,
          restored: {
            preset: state.diyPreset,
            textPreset: state.textPreset,
            lyricTransform: { ...textPresetTransform('depth') },
            controllerPosition: current?.runtime?.controllerPosition || null,
            ordinary: {
              audioIntensity: Number(current?.runtime?.requestedParameters?.audioIntensity),
              theme: current?.runtime?.requestedParameters?.theme || '',
            },
            grid: {
              requested: Number(current?.runtime?.requestedParameters?.gridSize),
              effective: Number(current?.runtime?.effectiveParameters?.gridSize),
            },
          },
        };
      })()`);
      persistence.seed = persistenceSeedSnapshot;
      persistence.restored = persistence.restored || null;
      const samePlainObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);
      report.checks.persistsAcrossReload =
        persistence.current?.preset?.id === report.persistenceSeed.presetId
        && persistence.seed?.preset === report.persistenceSeed.presetId
        && persistence.restored?.preset === persistence.seed?.preset
        && persistence.restored?.textPreset === persistence.seed?.textPreset
        && samePlainObject(persistence.restored?.lyricTransform, persistence.seed?.lyricTransform)
        && samePlainObject(persistence.restored?.controllerPosition, persistence.seed?.controllerPosition)
        && samePlainObject(persistence.restored?.ordinary, persistence.seed?.ordinary)
        && Number(persistence.restored?.grid?.requested) === Number(persistence.seed?.grid?.requested)
        && Number(persistence.byKey?.[report.persistenceSeed.audioKey]) === 1.3
        && Number(persistence.byKey?.[report.persistenceSeed.gridKey]) === 640
        && persistence.current?.runtime?.mounted === true
        && persistence.current?.runtime?.ready === true
        && Number(persistence.current?.runtime?.parameters?.audioIntensity) === 1.3
        && Number(persistence.initial?.runtime?.requestedParameters?.gridSize) === 640
        && [160, 320].includes(Number(persistence.initial?.runtime?.effectiveParameters?.gridSize))
        && Number(persistence.current?.runtime?.requestedParameters?.gridSize) === 640
        && Number(persistence.current?.runtime?.effectiveParameters?.gridSize) === 640
        && persistence.current?.runtime?.startupRecovery?.state === 'recovered';
    } catch (error) {
      persistence = {
        checked: true,
        current: null,
        parameters: null,
        error: { message: String(error?.message || error), code: String(error?.code || '') },
      };
    }
  }

  report.persistence = persistence;
  let freshContextPersistence = {
    checked: false,
    restored: null,
    backedUpKeys: Object.keys(preferenceJournal.values).sort(),
    error: null,
  };
  report.checks.persistsAcrossFreshContext = false;
  if (persistence.seed) {
    try {
      await command('Page.navigate', {
        url: `http://127.0.0.1:${restartPort}/?client=embedded&qa=soundscape-fresh-context-restore`,
      });
      await waitFor("document.readyState === 'complete'", 'the fresh-origin app document');
      await waitFor(
        "window.FeMonsterPetActionBridge?.execute && window.FeSoundscapeRuntime?.get",
        'the fresh-origin soundscape interfaces',
      );
      await waitFor(
        "!document.getElementById('bootLogoButton')?.disabled",
        'the fresh-origin boot entry control',
      );
      await evaluate("document.getElementById('bootLogoButton')?.click(); true");
      await waitFor(
        "document.getElementById('bootScreen')?.hidden === true",
        'the fresh-origin main UI after boot entry',
      );
      freshContextPersistence = await evaluate(`(async () => {
        const deadline = performance.now() + 8_000;
        let runtime = null;
        let initialGrid = null;
        do {
          runtime = state.soundscapeWorkshop.runtime
            ? window.FeSoundscapeRuntime.get(state.soundscapeWorkshop.runtime)
            : null;
          if (!initialGrid && runtime) {
            initialGrid = {
              requested: Number(runtime.requestedParameters?.gridSize),
              effective: Number(runtime.effectiveParameters?.gridSize),
              state: runtime.startupRecovery?.state || '',
            };
          }
          if (
            runtime?.ready
            && Number(runtime.requestedParameters?.gridSize)
              === Number(runtime.effectiveParameters?.gridSize)
            && ['idle', 'recovered'].includes(runtime.startupRecovery?.state)
          ) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        } while (performance.now() < deadline);
        return {
          checked: true,
          initialGrid,
          restored: {
            preset: state.diyPreset,
            textPreset: state.textPreset,
            lyricTransform: { ...textPresetTransform('depth') },
            controllerPosition: runtime?.controllerPosition || null,
            ordinary: {
              audioIntensity: Number(runtime?.requestedParameters?.audioIntensity),
              theme: runtime?.requestedParameters?.theme || '',
            },
            grid: {
              requested: Number(runtime?.requestedParameters?.gridSize),
              effective: Number(runtime?.effectiveParameters?.gridSize),
              state: runtime?.startupRecovery?.state || '',
            },
            mounted: runtime?.mounted === true,
            ready: runtime?.ready === true,
          },
        };
      })()`);
      freshContextPersistence.backedUpKeys = Object.keys(preferenceJournal.values).sort();
      const samePlainObject = (left, right) => JSON.stringify(left) === JSON.stringify(right);
      report.checks.persistsAcrossFreshContext = Boolean(
        freshContextPersistence.restored?.mounted
        && freshContextPersistence.restored?.ready
        && freshContextPersistence.restored?.preset === persistence.seed.preset
        && freshContextPersistence.restored?.textPreset === persistence.seed.textPreset
        && samePlainObject(
          freshContextPersistence.restored?.lyricTransform,
          persistence.seed.lyricTransform
        )
        && samePlainObject(
          freshContextPersistence.restored?.controllerPosition,
          persistence.seed.controllerPosition
        )
        && samePlainObject(
          freshContextPersistence.restored?.ordinary,
          persistence.seed.ordinary
        )
        && Number(freshContextPersistence.initialGrid?.requested)
          === Number(persistence.seed.grid?.requested)
        && [160, 320].includes(Number(freshContextPersistence.initialGrid?.effective))
        && Number(freshContextPersistence.restored?.grid?.requested)
          === Number(persistence.seed.grid?.requested)
        && Number(freshContextPersistence.restored?.grid?.effective)
          === Number(persistence.seed.grid?.effective)
        && freshContextPersistence.restored?.grid?.state === 'recovered'
      );
    } catch (error) {
      freshContextPersistence = {
        checked: true,
        restored: null,
        backedUpKeys: Object.keys(preferenceJournal.values).sort(),
        error: { message: String(error?.message || error), code: String(error?.code || '') },
      };
    }
  }
  report.freshContextPersistence = freshContextPersistence;
  report.pageErrors = pageErrors;
  report.consoleMessages = consoleMessages;
  report.recentRequests = requests.slice(-30);
  report.pass = Object.values(report.checks).every(Boolean) && pageErrors.length === 0;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.pass) process.exitCode = 1;
} finally {
  try { socket?.close(); } catch {}
  if (browser.exitCode === null) {
    try { browser.kill(); } catch {}
    await wait(300);
  }
  if (browser.exitCode === null && browser.pid) {
    spawnSync('taskkill.exe', ['/PID', String(browser.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
  }
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  await new Promise((resolve) => {
    restartServer.close(resolve);
    restartServer.closeAllConnections?.();
  });
  await wait(100);
  if (profile.startsWith(`${tempRoot}${path.sep}`) && existsSync(profile)) {
    try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } catch {}
  }
}
