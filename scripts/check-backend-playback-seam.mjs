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
const tempRoot = mkdtempSync(path.join(tmpdir(), 'fe-monster-backend-playback-seam-'));
const classes = path.join(tempRoot, 'classes');
const injectStall = process.argv.includes('--inject-stall');
const sources = [
  'src/main/java/com/femonster/json/SimpleJson.java',
  'src/main/java/com/femonster/http/HttpUtil.java',
  'src/main/java/com/femonster/model/Song.java',
  'src/main/java/com/femonster/music/MusicProviderClient.java',
  'src/main/java/com/femonster/music/PlaybackSource.java',
  'src/main/java/com/femonster/music/MusicProviderRegistry.java',
  'src/main/java/com/femonster/core/PlayerService.java',
  'src/main/java/com/femonster/api/AudioStreamProxy.java',
  'scripts/java/com/femonster/api/PlaybackBackendContinuityProbe.java'
].map((entry) => path.join(root, entry));
const javaHomes = [
  path.join(root, 'runtime', 'java'),
  'E:\\java26',
  'D:\\java26',
  'C:\\java26',
  process.env.FE_JAVA26_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME
].filter(Boolean);

function executable(name) {
  for (const home of javaHomes) {
    const candidate = path.join(home, 'bin', `${name}.exe`);
    if (existsSync(candidate)) return candidate;
  }
  return `${name}.exe`;
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true
  });
  if (result.error) throw result.error;
  return result;
}

function functionBody(source, signature, nextSignature) {
  const start = source.indexOf(signature);
  if (start < 0) return '';
  const end = source.indexOf(nextSignature, start + signature.length);
  return source.slice(start, end < 0 ? source.length : end);
}

try {
  mkdirSync(classes, { recursive: true });
  const compile = run(executable('javac'), [
    '-encoding',
    'UTF-8',
    '--release',
    '17',
    '-d',
    classes,
    ...sources
  ]);
  if (compile.status !== 0) {
    process.stdout.write(compile.stdout || '');
    process.stderr.write(compile.stderr || '');
    process.exitCode = compile.status || 1;
  } else {
    const result = run(executable('java'), [
      '-cp',
      classes,
      'com.femonster.api.PlaybackBackendContinuityProbe',
      ...(injectStall ? ['--inject-stall'] : [])
    ]);
    if (result.stderr) process.stderr.write(result.stderr);

    const rawReport = result.stdout
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .at(-1) || '{}';
    const report = JSON.parse(rawReport);
    const apiRoutesSource = readFileSync(
      path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'),
      'utf8'
    );
    const playerSource = readFileSync(
      path.join(root, 'src/main/java/com/femonster/core/PlayerService.java'),
      'utf8'
    );
    const appSource = readFileSync(path.join(root, 'web/app.js'), 'utf8');
    const stateMethod = functionBody(
      playerSource,
      'public synchronized Map<String, Object> state()',
      'public synchronized Map<String, Object> setVolume('
    );
    const refreshPlayerState = functionBody(
      appSource,
      'async function refreshPlayerState()',
      'function applyAudioBridgePayload('
    );
    const recoveryFunction = functionBody(
      appSource,
      'async function recoverStalledAudioPlayback(',
      'async function monitorAudioPlaybackContinuity('
    );

    report.staticChecks = {
      stateRouteIsReadOnly:
        /case\s+["']\/api\/player\/state["']\s*->\s*HttpUtil\.sendJson\(exchange,\s*context\.player\.state\(\)\)/s
          .test(apiRoutesSource),
      loadRouteIsSeparate:
        /case\s+["']\/api\/player\/load["']\s*->\s*HttpUtil\.sendJson\(exchange,\s*context\.player\.load\(/s
          .test(apiRoutesSource),
      stateMethodDoesNotResolveOrReload:
        stateMethod.includes('refreshClock()')
          && !stateMethod.includes('music.songUrl(')
          && !stateMethod.includes('load('),
      browserStatePollDoesNotReload:
        refreshPlayerState.includes("apiJson('/api/player/state')")
          && !refreshPlayerState.includes('/api/player/load')
          && !refreshPlayerState.includes('loadSong('),
      urlRenewalBelongsToFrontendRecovery:
        recoveryFunction.includes('loadSong(')
          && recoveryFunction.includes('recovery: true')
    };
    const staticPass = Object.values(report.staticChecks).every(Boolean);
    report.pass = Boolean(report.pass) && staticPass;
    process.stdout.write(`${JSON.stringify(report)}\n`);

    const expectedStatus = report.pass ? 0 : 1;
    if ((result.status || 0) !== expectedStatus) {
      process.stderr.write(
        `Probe exit mismatch: report pass=${report.pass}, Java exit=${result.status}\n`
      );
      process.exitCode = 1;
    } else {
      process.exitCode = expectedStatus;
    }
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
