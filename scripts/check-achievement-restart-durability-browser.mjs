import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createTcpServer } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Reported defect: the achievement profile looked reset after every launch.
// The floating web view is rebuilt on a new 127.0.0.1 port for each start, so
// its local storage area is always empty; progress may therefore only survive
// in the app backend's per-account file.  This runs the real page against the
// real backend with the community mirror unreachable (the shipped state of the
// community server) and restarts the whole app to prove the profile survives.
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDirectory, '..');
const jarPath = path.resolve(
  process.env.FE_TEST_JAR || process.argv[2] || path.join(workspaceRoot, 'out', 'fe-monster-java.jar')
);
if (!existsSync(jarPath)) throw new Error('FE monster jar was not found: ' + jarPath);

const require = createRequire(import.meta.url);
let chromium;
for (const candidate of [
  process.env.PLAYWRIGHT_MODULE_PATH,
  'playwright',
  path.join(homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')
].filter(Boolean)) {
  try { ({ chromium } = require(candidate)); break; } catch {}
}
assert.ok(chromium, 'Playwright is required');

const javaCandidates = [
  process.env.FE_TEST_JAVA,
  process.env.FE_JAVA_HOME
    ? path.join(process.env.FE_JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    : '',
  path.join(workspaceRoot, 'runtime', 'java', 'bin', process.platform === 'win32' ? 'java.exe' : 'java'),
  process.platform === 'win32' ? 'java.exe' : 'java'
].filter(Boolean);
const canRun = (candidate) => {
  if (path.isAbsolute(candidate) && !existsSync(candidate)) return false;
  const result = spawnSync(candidate, ['-version'], { stdio: 'ignore', windowsHide: true });
  return !result.error && result.status === 0;
};
const java = javaCandidates.find(canRun);
if (!java) throw new Error('Java 17+ runtime was not found; set FE_TEST_JAVA to java.exe');

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function freePort(excluded = new Set()) {
  for (;;) {
    const server = createTcpServer();
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;
    await new Promise((resolve) => server.close(resolve));
    if (port > 0 && !excluded.has(port)) return port;
  }
}

// Only the music-platform account probe matters: it is what decides which
// account partition owns the achievements.
const loginUserId = '5150551234';
const plugin = createServer((request, response) => {
  const url = new URL(request.url, 'http://fixture');
  const json = (value) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(value));
  };
  if (url.pathname === '/login/status') {
    return json({ data: { code: 200, profile: { userId: Number(loginUserId), nickname: 'restart-audit', avatarUrl: '' } } });
  }
  if (url.pathname === '/health') return json({ ok: true });
  return json({ ok: true, data: {} });
});
await new Promise((resolve) => plugin.listen(0, '127.0.0.1', resolve));
const pluginPort = plugin.address().port;

const dataDirectory = mkdtempSync(path.join(tmpdir(), 'fe-achievement-restart-'));
mkdirSync(path.join(dataDirectory, 'music-api'), { recursive: true });
writeFileSync(path.join(dataDirectory, 'music-api', 'providers.json'), JSON.stringify({
  schema: 'fe-monster.music-apis/v1',
  version: 1,
  providers: [{
    id: 'netease',
    label: '网易云音乐',
    appName: '网易云音乐 App',
    baseUrl: 'http://127.0.0.1:' + pluginPort,
    healthPath: '/health',
    version: '4.32.0',
    enabled: true,
    configured: true,
    autostart: false,
    loginQr: false,
    source: 'imported-json'
  }]
}, null, 2));
mkdirSync(path.join(dataDirectory, 'achievement-states'), { recursive: true });
rmSync(path.join(dataDirectory, 'achievement-states'), { recursive: true, force: true });

async function startBackend(port) {
  const child = spawn(java, ['-jar', jarPath, '--no-client'], {
    cwd: workspaceRoot,
    env: {
      ...process.env,
      FE_MONSTER_ROOT: workspaceRoot,
      FE_MONSTER_WEB_ROOT: path.join(workspaceRoot, 'web'),
      FE_MONSTER_DATA_DIR: dataDirectory,
      FE_MONSTER_BIND: '127.0.0.1',
      FE_MONSTER_PORT: String(port),
      FE_MUSIC_API_AUTOSTART: '0'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  const instance = { process: child, port, output: '' };
  const append = (chunk) => { instance.output = (instance.output + chunk).slice(-12000); };
  child.stdout.on('data', append);
  child.stderr.on('data', append);
  try {
    for (let attempt = 0; attempt < 120; attempt += 1) {
      if (child.exitCode !== null) throw new Error('backend exited with code ' + child.exitCode);
      try {
        const response = await fetch('http://127.0.0.1:' + port + '/api/app/version', {
          cache: 'no-store', signal: AbortSignal.timeout(700)
        });
        if (response.ok) return instance;
      } catch {
        // Not listening yet.
      }
      await delay(100);
    }
    throw new Error('backend did not become healthy in time');
  } catch (error) {
    await stopBackend(instance);
    throw new Error('Failed to start backend: ' + error.message + '\n' + instance.output.trim());
  }
}

async function stopBackend(instance) {
  if (!instance || instance.process.exitCode !== null) return;
  const exited = once(instance.process, 'exit').catch(() => []);
  try {
    await fetch('http://127.0.0.1:' + instance.port + '/api/app/quit', {
      cache: 'no-store', signal: AbortSignal.timeout(1500)
    });
  } catch {
    // Fall through to process cleanup.
  }
  let observed = await Promise.race([exited.then(() => true), delay(6000).then(() => false)]);
  if (!observed && instance.process.exitCode === null) {
    if (process.platform === 'win32') {
      spawnSync('taskkill.exe', ['/PID', String(instance.process.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      instance.process.kill('SIGKILL');
    }
    observed = await Promise.race([exited.then(() => true), delay(3000).then(() => false)]);
  }
  if (instance.process.exitCode === null) throw new Error('backend on port ' + instance.port + ' did not stop');
}

async function openApp(browser, port) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const origin = 'http://127.0.0.1:' + port;
  await page.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    return route.abort();
  });
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#bootLogoButton', { timeout: 30000 });
  await page.locator('#bootLogoButton').click();
  await page.waitForFunction(
    () => document.getElementById('bootScreen')?.hidden && typeof window.feAchievements?.unlock === 'function',
    null,
    { timeout: 45000 }
  );
  await page.evaluate(() => window.feAchievements.ready);
  return { page, errors };
}

async function achievementsPayload(port) {
  const response = await fetch('http://127.0.0.1:' + port + '/api/app/achievements?provider=netease', {
    cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  assert.ok(response.ok, 'achievement snapshot expected HTTP 2xx, got ' + response.status);
  return response.json();
}

let backend = null;
let browser = null;
const usedPorts = new Set();
const nextPort = async () => {
  const port = await freePort(usedPorts);
  usedPorts.add(port);
  return port;
};

console.log('Achievement restart durability: plugin on 127.0.0.1:' + pluginPort);
try {
  browser = await chromium.launch({
    headless: true,
    ...(!existsSync(chromium.executablePath())
      ? { executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe' }
      : {}),
    args: ['--mute-audio', '--use-angle=d3d11', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader']
  });

  const firstPort = await nextPort();
  backend = await startBackend(firstPort);
  const first = await openApp(browser, firstPort);
  await first.page.evaluate(() => {
    window.feAchievements.unlock('first-play', { silent: true });
    window.feAchievements.setProgress('gap-runner', 4);
  });
  await first.page.waitForFunction(() => window.feAchievements.isUnlocked('first-play'), null, { timeout: 10000 });

  // The community mirror has no configured server here, exactly like the
  // shipped profile whose mirror is unreachable: the account is confirmed but
  // its cloud backup cannot complete.
  let payload = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    payload = await achievementsPayload(firstPort);
    if (payload.unlocked?.['first-play'] && payload.progress?.['gap-runner'] === 4) break;
    await delay(500);
  }
  assert.equal(payload._sync?.scope, 'netease:' + loginUserId, 'the account partition did not own the progress');
  assert.equal(payload._sync?.remoteRequired, true, 'a confirmed account must require its cloud backup');
  assert.equal(payload._sync?.serverSynced, false, 'the unreachable mirror must be reported as unsynced');
  assert.ok(payload.unlocked?.['first-play'], 'the unlock never reached the durable account store');
  assert.equal(payload.progress?.['gap-runner'], 4, 'the progress counter never reached the durable account store');

  const stateDirectory = path.join(dataDirectory, 'achievement-states');
  const scopedFiles = existsSync(stateDirectory) ? readdirSync(stateDirectory).filter((name) => name.endsWith('.json')) : [];
  assert.ok(scopedFiles.length >= 1, 'no per-account achievement file was written for ' + payload._sync.scope);
  const scoped = JSON.parse(readFileSync(path.join(stateDirectory, scopedFiles[0]), 'utf8'));
  assert.ok(scoped.unlocked?.['first-play'], 'the durable per-account file lost the unlock');
  assert.equal(scoped.progress?.['gap-runner'], 4, 'the durable per-account file lost the progress counter');

  await first.page.close();
  await stopBackend(backend);
  backend = null;

  // A new launch gets a new localhost port, so the browser storage area that
  // held the previous session is unreachable: only the data directory remains.
  const secondPort = await nextPort();
  backend = await startBackend(secondPort);
  const second = await openApp(browser, secondPort);
  const restored = await second.page.evaluate(() => ({
    firstPlay: window.feAchievements.isUnlocked('first-play'),
    progress: window.feAchievements.getProgress('gap-runner')
  }));
  assert.equal(restored.firstPlay, true, 'a new launch reset the unlocked achievement');
  assert.equal(restored.progress, 4, 'a new launch reset the achievement progress');
  await second.page.close();
  await stopBackend(backend);
  backend = null;

  console.log('Achievement restart durability PASS');
} finally {
  await stopBackend(backend);
  await browser?.close();
  await new Promise((resolve) => plugin.close(resolve));
  rmSync(dataDirectory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
}
