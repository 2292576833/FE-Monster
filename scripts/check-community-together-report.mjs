import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'fe-community-together-report-'));
const classes = path.join(temporary, 'classes');
const javaHomes = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
  'E:\\java26',
  'D:\\java26',
  'C:\\java26'
].filter(Boolean);

function supportedJdkHome() {
  for (const home of javaHomes) {
    const compiler = path.join(home, 'bin', 'javac.exe');
    if (!existsSync(compiler)) continue;
    const version = spawnSync(compiler, ['-version'], {
      encoding: 'utf8',
      windowsHide: true
    });
    const text = `${version.stdout}\n${version.stderr}`;
    const major = Number(text.match(/javac\s+(?:1\.)?(\d+)/)?.[1] || 0);
    if (version.status === 0 && major >= 17) return home;
  }
  return '';
}

const jdkHome = supportedJdkHome();

function executable(name) {
  if (jdkHome) return path.join(jdkHome, 'bin', `${name}.exe`);
  return `${name}.exe`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `${command} failed (${result.status}):\n${result.stdout}\n${result.stderr}`
  );
  return result;
}

try {
  mkdirSync(classes, { recursive: true });
  const sources = [
    'src/main/java/com/femonster/json/SimpleJson.java',
    'src/community-proprietary/java/com/femonster/core/TogetherListeningReportStore.java',
    'src/test/java/com/femonster/core/TogetherListeningReportStoreProbe.java'
  ].map((relativePath) => path.join(root, relativePath));
  run(executable('javac'), [
    '-encoding',
    'UTF-8',
    '--release',
    '17',
    '-d',
    classes,
    ...sources
  ]);
  const execution = run(executable('java'), [
    '-cp',
    classes,
    'com.femonster.core.TogetherListeningReportStoreProbe'
  ]);
  assert.match(execution.stdout, /TogetherListeningReportStoreProbe passed\./);

  const client = readFileSync(
    path.join(root, 'src/main/java/com/femonster/community/CommunityClient.java'),
    'utf8'
  );
  const routes = readFileSync(
    path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'),
    'utf8'
  );
  const service = readFileSync(
    path.join(root, 'src/community-proprietary/java/com/femonster/core/CommunityService.java'),
    'utf8'
  );
  const store = readFileSync(
    path.join(root, 'src/community-proprietary/java/com/femonster/core/TogetherListeningReportStore.java'),
    'utf8'
  );

  assert.match(client, /listenReport\(/, 'CommunityClient must expose the report contract');
  assert.match(routes, /"\/api\/community\/listen\/report"/, 'the local read-only report endpoint is missing');
  assert.match(
    service,
    /response\.put\("togetherListeningReport",\s*togetherListeningReports\.report\(feId\)\)/,
    'listening responses must expose the report without replacing remote fields'
  );
  assert.match(service, /syncedSessions/, 'the report must consume existing remote session heartbeats');
  assert.match(service, /Math\.min\(60_000L/, 'report deltas must be bounded');
  assert.match(store, /StandardCopyOption\.ATOMIC_MOVE/, 'report persistence must use atomic replacement');
  assert.match(store, /sessionIds\.add\(session\)/, 'session counts must be idempotent');
  assert.match(store, /lastListenedAt/, 'per-friend last-listened time is missing');
  assert.match(store, /longestFriend/, 'the longest together-listening friend is missing');

  assert.match(
    client,
    /updateProfile\([\s\S]*?Map<String,\s*Object>\s+avatarOrnament/,
    'the profile contract must accept an avatar ornament'
  );
  assert.match(
    routes,
    /root\.containsKey\("avatarOrnament"\)[\s\S]*?SimpleJson\.asMap\(root\.get\("avatarOrnament"\)\)/,
    'profile updates must distinguish omitted ornament data from an explicit empty object'
  );
  assert.match(
    service,
    /request\.put\("avatarOrnament",\s*new LinkedHashMap<>\(avatarOrnament\)\)/,
    'profile updates must forward avatar ornament data'
  );
  assert.match(
    service,
    /accountProfiles\.profile\(accountKey\(provider,\s*accountPayload\)\)[\s\S]*?cachedProfile\.containsKey\("avatarOrnament"\)[\s\S]*?request\.put\("avatarOrnament"/,
    'registration must preserve known account-scoped avatar ornament data'
  );

  console.log(JSON.stringify({
    pass: true,
    checks: {
      aggregation: true,
      persistence: true,
      idempotentSessions: true,
      reportEndpoint: true,
      remoteResponseCompatibility: true,
      avatarOrnamentForwarding: true
    }
  }, null, 2));
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
