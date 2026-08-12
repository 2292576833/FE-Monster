import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDirectory, '..');
const jar = path.resolve(process.env.FE_TEST_JAR || path.join(root, 'out', 'fe-monster-java.jar'));
const dataDirectory = mkdtempSync(path.join(tmpdir(), 'fe-monster-client-preferences-'));
const index = readFileSync(path.join(root, 'web', 'index.html'), 'utf8');
const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
const ACTIVE_PROVIDER_PREFERENCE_KEY = 'fe-monster-active-provider-v1';
const expected = Object.freeze({
  [ACTIVE_PROVIDER_PREFERENCE_KEY]: 'kugou',
  'fe-monster-visual-settings-v1': JSON.stringify({
    version: 1,
    lyricBrightness: 1.48,
    lyricSpeed: 1.22,
    cubeIntensity: 1.36,
    diyPage: 'preset',
    diyPreset: 'topography',
    scenePreset: 'topography',
    textPreset: 'flow',
    freeCubeMode: 'heart',
    freeCubeBackgroundEnabled: false,
    chladniMode: 'plane',
    stormLightingMode: 'evening',
    stormWeatherMode: 'on'
  }),
  'fe-monster-wallpaper-prefs': JSON.stringify({
    version: 6,
    activeWallpaperIds: {
      imported: 'imported:C:/wallpapers/night.mp4',
      live: 'wallpaper-engine:fixture'
    },
    source: 'live',
    opacity: 0.78,
    brightness: 1.16,
    blur: 4,
    scale: 0.92,
    fitMode: 'fill'
  }),
  'fe-monster-scene-wallpaper-prefs': JSON.stringify({
    version: 4,
    presets: {
      topography: {
        enabled: true,
        followWallpaperEngine: true,
        wallpaperId: 'wallpaper-engine:fixture',
        wallpaperUrl: '/api/wallpapers/file?path=fixture.mp4',
        wallpaperName: 'Fixture Live Wallpaper',
        mediaKind: 'video',
        opacity: 0.82
      }
    }
  })
});
const qqExpected = Object.freeze({
  ...expected,
  [ACTIVE_PROVIDER_PREFERENCE_KEY]: 'qq'
});
const qqSavedAt = 1785400000123;
const savedAt = qqSavedAt + 1;
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA_HOME
    ? path.join(process.env.FE_JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : '',
  process.env.JAVA_HOME
    ? path.join(process.env.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : '',
  path.join(root, 'runtime', 'java', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  process.platform === 'win32' ? 'java.exe' : 'java'
].filter(Boolean);

function canRun(candidate) {
  if (path.isAbsolute(candidate) && !existsSync(candidate)) return false;
  const result = spawnSync(candidate, ['-version'], {
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error || result.status !== 0) return false;
  const versionText = `${result.stdout || ''}\n${result.stderr || ''}`;
  const match = /version\s+"(?:1\.)?(\d+)/i.exec(versionText);
  return match !== null && Number(match[1]) >= 17;
}

const java = javaCandidates.find(canRun);
if (!java) throw new Error('Java 17+ runtime was not found');
if (!existsSync(jar)) throw new Error(`FE Monster jar was not found: ${jar}`);

async function freePort(excluded = new Set()) {
  for (;;) {
    const server = createServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    await new Promise((resolve) => server.close(resolve));
    if (port > 0 && !excluded.has(port)) return port;
  }
}

async function stopBackend(instance) {
  if (!instance || instance.process.exitCode !== null) return;
  const exited = once(instance.process, 'exit').catch(() => []);
  try {
    await fetch(`http://127.0.0.1:${instance.port}/api/app/quit`, {
      signal: AbortSignal.timeout(1200)
    });
  } catch {
    // Process-level cleanup below handles an already-closed listener.
  }
  const stopped = await Promise.race([
    exited.then(() => true),
    delay(5000).then(() => false)
  ]);
  if (!stopped && instance.process.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(instance.process.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      instance.process.kill('SIGKILL');
    }
  }
}

async function startBackend(port) {
  const child = spawn(java, ['-jar', jar, '--no-client'], {
    cwd: root,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: root,
      FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
      FE_MONSTER_DATA_DIR: dataDirectory,
      FE_MONSTER_BIND: '127.0.0.1',
      FE_MONSTER_PORT: String(port),
      FE_MUSIC_API_AUTOSTART: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const instance = { process: child, port, output: '' };
  const append = (chunk) => {
    instance.output = `${instance.output}${String(chunk)}`.slice(-12000);
  };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null) {
      throw new Error(`backend exited with code ${child.exitCode}\n${instance.output}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/app/version`, {
        signal: AbortSignal.timeout(600)
      });
      if (response.ok) return instance;
    } catch {
      // Listener is still starting.
    }
    await delay(100);
  }
  await stopBackend(instance);
  throw new Error(`backend did not become healthy\n${instance.output}`);
}

async function request(port, route, options = {}) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(3000),
    ...options
  });
  const text = await response.text();
  assert.ok(response.ok, `${route} returned ${response.status}: ${text}`);
  return { response, text };
}

function executeBootstrap(script, initial = {}) {
  const values = new Map(Object.entries(initial));
  const localStorage = {
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    }
  };
  vm.runInNewContext(script, { localStorage, atob, TextDecoder, Uint8Array });
  return values;
}

function extractFunctionDeclaration(source, name) {
  const signature = `function ${name}`;
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `${name} must exist in the client runtime`);
  const bodyStart = source.indexOf('{', source.indexOf(')', start) + 1);
  assert.notEqual(bodyStart, -1, `${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  assert.fail(`${name} must have a balanced function body`);
}

function createActiveProviderRuntime(initial = {}) {
  const values = new Map(Object.entries(initial));
  let preferenceSyncCount = 0;
  const localStorage = {
    get length() {
      return values.size;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      values.set(String(key), String(value));
    }
  };
  const sandbox = {
    ACTIVE_PROVIDER_PREFERENCE_KEY,
    MUSIC_PROVIDERS: {
      netease: { id: 'netease' },
      qq: { id: 'qq' },
      kugou: { id: 'kugou' },
      qishui: { id: 'qishui' }
    },
    window: { localStorage },
    scheduleClientPreferencesSync() {
      preferenceSyncCount += 1;
    }
  };
  vm.createContext(sandbox);
  for (const name of [
    'normalizeActiveProviderPreference',
    'loadActiveProviderPreference',
    'saveActiveProviderPreference'
  ]) {
    vm.runInContext(extractFunctionDeclaration(app, name), sandbox);
  }
  return {
    values,
    load: () => sandbox.loadActiveProviderPreference(),
    save: (provider) => sandbox.saveActiveProviderPreference(provider),
    syncCount: () => preferenceSyncCount
  };
}

const firstPort = await freePort();
const secondPort = await freePort(new Set([firstPort]));
let backend = null;

try {
  backend = await startBackend(firstPort);
  const qqSwitch = createActiveProviderRuntime();
  qqSwitch.save('qq');
  assert.equal(qqSwitch.values.get(ACTIVE_PROVIDER_PREFERENCE_KEY), 'qq');
  assert.equal(qqSwitch.syncCount(), 1, 'switching to QQ must schedule client preference sync');
  const post = await request(firstPort, '/api/app/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, updatedAt: qqSavedAt, values: qqExpected })
  });
  const posted = JSON.parse(post.text);
  assert.equal(posted.updatedAt, qqSavedAt);
  assert.deepEqual(posted.values, qqExpected);

  const crossOrigin = await fetch(`http://127.0.0.1:${firstPort}/api/app/preferences`, {
    headers: {
      Origin: 'https://attacker.invalid',
      'Sec-Fetch-Site': 'cross-site'
    },
    signal: AbortSignal.timeout(3000)
  });
  assert.equal(crossOrigin.status, 400, 'cross-origin preference reads must be rejected');

  const bootstrap = await request(firstPort, '/api/app/preferences/bootstrap.js');
  assert.match(String(bootstrap.response.headers.get('content-type')), /^text\/javascript/);
  const restored = executeBootstrap(bootstrap.text);
  for (const [key, value] of Object.entries(qqExpected)) {
    assert.equal(restored.get(key), value, `bootstrap did not restore ${key}`);
  }
  assert.equal(restored.get('fe-monster-client-preferences-revision'), String(qqSavedAt));
  const qqRestart = createActiveProviderRuntime(Object.fromEntries(restored));
  assert.equal(qqRestart.load(), 'qq', 'bootstrap must restore QQ as the active provider');

  qqRestart.save('kugou');
  assert.equal(qqRestart.values.get(ACTIVE_PROVIDER_PREFERENCE_KEY), 'kugou');
  assert.equal(qqRestart.syncCount(), 1, 'switching to Kugou must schedule client preference sync');
  const kugouPost = await request(firstPort, '/api/app/preferences', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: 1, updatedAt: savedAt, values: expected })
  });
  const kugouPosted = JSON.parse(kugouPost.text);
  assert.equal(kugouPosted.updatedAt, savedAt);
  assert.deepEqual(kugouPosted.values, expected);
  const kugouBootstrap = await request(firstPort, '/api/app/preferences/bootstrap.js');
  const kugouRestored = executeBootstrap(kugouBootstrap.text);
  const kugouRestart = createActiveProviderRuntime(Object.fromEntries(kugouRestored));
  assert.equal(kugouRestart.load(), 'kugou', 'bootstrap must restore Kugou as the active provider');

  const localNewer = executeBootstrap(kugouBootstrap.text, {
    'fe-monster-client-preferences-revision': String(savedAt + 1000),
    'fe-monster-visual-settings-v1': 'newer-local-state'
  });
  assert.equal(
    localNewer.get('fe-monster-visual-settings-v1'),
    'newer-local-state',
    'bootstrap overwrote a newer local state'
  );

  await stopBackend(backend);
  backend = null;
  backend = await startBackend(secondPort);
  const afterRestart = JSON.parse((await request(secondPort, '/api/app/preferences')).text);
  assert.equal(afterRestart.updatedAt, savedAt);
  assert.deepEqual(afterRestart.values, expected);

  const bootstrapIndex = index.indexOf('/api/app/preferences/bootstrap.js');
  const appIndex = index.indexOf('app.js?');
  assert.ok(bootstrapIndex >= 0 && bootstrapIndex < appIndex, 'preference bootstrap must run before app.js');
  assert.match(app, /const VISUAL_SETTINGS_PREFS_KEY = ['"]fe-monster-visual-settings-v1['"]/);
  assert.match(app, /function loadVisualSettingsPreferences\(/);
  assert.match(app, /function saveVisualSettingsPreferences\(/);
  assert.match(app, /activeProvider:\s*INITIAL_ACTIVE_PROVIDER_PREFERENCE/);
  assert.match(
    app.slice(app.indexOf('function setActiveProvider('), app.indexOf('\nfunction renderLoginStatus(')),
    /if \(changed\) saveActiveProviderPreference\(nextProvider\);/,
    'switching providers must persist the new active provider'
  );
  assert.match(app, /function scheduleClientPreferencesSync\(/);
  assert.match(app, /navigator\.sendBeacon\(['"]\/api\/app\/preferences['"]/);

  console.log(JSON.stringify({
    pass: true,
    ports: [firstPort, secondPort],
    restoredKeys: Object.keys(expected),
    savedAt
  }, null, 2));
} finally {
  await stopBackend(backend);
  rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
