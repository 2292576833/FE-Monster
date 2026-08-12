import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'C:\\Program Files\\Java\\jdk-17',
  path.join(root, 'runtime', 'java'),
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);
const executable = (name) => javaHomes
  .map((home) => path.join(home, 'bin', `${name}${suffix}`))
  .find((candidate) => existsSync(candidate));
const java = executable('java');
const javac = executable('javac');
assert.ok(java && javac, 'Java 17+ tools are required');

const classes = path.join(root, 'out', 'classes');
assert.ok(existsSync(path.join(classes, 'com', 'femonster', 'music', 'MusicProviderRegistry.class')),
  'Run scripts/build-java.ps1 before this check');
const scratchBase = path.join(root, '.tmp');
mkdirSync(scratchBase, { recursive: true });
const scratch = mkdtempSync(path.join(scratchBase, 'browser-login-sync-'));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout;
}

try {
  const probe = path.join(root, 'src', 'test', 'java', 'com', 'femonster', 'core', 'BrowserLoginSynchronizationProbe.java');
  const qualificationProbe = path.join(
    root,
    'src', 'test', 'java', 'com', 'femonster', 'core',
    'OfficialBrowserLoginServiceKugouSessionProbe.java'
  );
  const neteaseLibraryProbe = path.join(
    root,
    'src', 'test', 'java', 'com', 'femonster', 'core',
    'NeteaseUserLibraryContractProbe.java'
  );
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-cp', classes, '-d', scratch,
    probe, qualificationProbe, neteaseLibraryProbe
  ]);
  const output = run(java, ['-cp', `${scratch}${path.delimiter}${classes}`, 'com.femonster.core.BrowserLoginSynchronizationProbe']);
  assert.match(output, /Browser login synchronization probe: OK/);
  const qualificationOutput = run(java, [
    '-cp', `${scratch}${path.delimiter}${classes}`,
    'com.femonster.core.OfficialBrowserLoginServiceKugouSessionProbe'
  ]);
  assert.match(qualificationOutput, /OfficialBrowserLoginServiceKugouSessionProbe passed/);
  const neteaseLibraryOutput = run(java, [
    '-cp', `${scratch}${path.delimiter}${classes}`,
    'com.femonster.core.NeteaseUserLibraryContractProbe'
  ]);
  assert.match(neteaseLibraryOutput, /NeteaseUserLibraryContractProbe passed/);
  const latencyMatch = output.match(/Browser login long-poll wake latency:\s*(\d+(?:\.\d+)?)\s*ms/);
  assert.ok(latencyMatch, 'long-poll wake latency measurement was not reported');
  const wakeLatencyMilliseconds = Number(latencyMatch[1]);
  assert.ok(wakeLatencyMilliseconds < 500,
    `long-poll wake latency exceeded 500 ms: ${wakeLatencyMilliseconds} ms`);

  const service = readFileSync(path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'OfficialBrowserLoginService.java'), 'utf8');
  assert.match(service, /scheduleWithFixedDelay\(\s*\(\)\s*->\s*monitorSession\(session\)/,
    'official browser login is still driven only by the UI polling timer');
  assert.match(service, /MONITOR_INTERVAL_MILLIS\s*=\s*150L/,
    'QR cookie detection is no longer near-immediate');
  assert.match(service, /clearProviderProfile\(id\);\s*Files\.createDirectories\(profile\)/,
    'an explicit QR login can still start from stale isolated-browser cookies');
  assert.match(service, /music\.synchronizeBrowserSession\(session\.provider, cookies\)/,
    'browser cookies are not followed by account and playlist synchronization');
  assert.match(service, /if\s*\(!SimpleJson\.asBoolean\(sync\.get\("ready"\), false\)\)/,
    'login still reports success before playlists are ready');
  const statusBody = service.slice(
    service.indexOf('public Map<String, Object> status('),
    service.indexOf('private void startMonitor(')
  );
  assert.doesNotMatch(statusBody, /readProviderCookies\(session\)/,
    'status requests still perform the blocking browser cookie probe');

  const routes = readFileSync(path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'api', 'ApiRoutes.java'), 'utf8');
  assert.match(service, /status\(String provider, String sessionId, long afterRevision, int waitMillis\)/,
    'backend change notifications cannot be awaited without polling');
  assert.match(service, /session\.wait\(boundedWait\)/,
    'login status does not wait for a backend phase change');
  assert.match(routes, /HttpUtil\.longParam\(query, "after", -1L, -1L, Long\.MAX_VALUE\)/,
    'login status route does not accept a state revision');
  assert.match(routes, /HttpUtil\.intParam\(query, "waitMs", 0, 0, 15000\)/,
    'login status route does not expose a bounded event wait');

  const app = readFileSync(path.join(root, 'web', 'app.js'), 'utf8');
  const browserLoginClient = app.slice(
    app.indexOf('function clearOfficialBrowserLoginTimer('),
    app.indexOf('async function configureQishuiOpenApiLogin(')
  );
  assert.match(browserLoginClient, /officialBrowserLoginAbortController\?\.abort\(\)/,
    'cancel and provider switch do not abort the previous long poll');
  assert.match(browserLoginClient, /waitMs:\s*15000/,
    'client does not request backend phase-change notifications');
  assert.match(browserLoginClient, /after:\s*state\.officialBrowserLoginRevision/,
    'client does not advance the login revision cursor');
  assert.match(browserLoginClient, /\[350,\s*500,\s*800\]/,
    'transient login failures do not use the bounded fallback retry');
  assert.doesNotMatch(browserLoginClient, /setInterval\(checkOfficialBrowserLogin,\s*1500\)/,
    'legacy fixed polling remains active instead of the serial event loop');

  console.log(`Official browser immediate-sync contract: OK (${wakeLatencyMilliseconds} ms wake latency)`);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
