import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const externalScratch = 'E:\\FE_audio_tmp';
const scratch = path.join(externalScratch, 'native-channel-router-transaction-red');
const classes = path.join(scratch, 'classes');
const data = path.join(scratch, 'data');
const suffix = process.platform === 'win32' ? '.exe' : '';
const runtime = path.join(root, 'native', 'windows', 'build-next');
const nativeDll = process.env.FE_MONSTER_XAUDIO2_DLL
  || path.join(runtime, 'fe-monster-xaudio2.dll');
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
mkdirSync(data, { recursive: true });

function run(command, args, env = {}) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
    env: {
      ...process.env,
      TEMP: externalScratch,
      TMP: externalScratch,
      ...env,
    },
  });
}

try {
  const compile = run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-d', classes,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
    path.join(root, 'src/test/java/com/femonster/core/NativeAudioChannelRouterTransactionProbe.java'),
  ]);
  assert.equal(compile.status, 0, [compile.stdout, compile.stderr].filter(Boolean).join('\n'));

  const live = run(java, [
    '-cp', classes,
    'com.femonster.core.NativeAudioChannelRouterTransactionProbe',
    data,
  ], {
    FE_MONSTER_ROOT: root,
    FE_MONSTER_XAUDIO2_DLL: nativeDll,
    PATH: `${path.dirname(nativeDll)};${process.env.PATH || ''}`,
  });
  const liveOutput = [live.stdout, live.stderr].filter(Boolean).join('\n');
  assert.equal(live.status, 0, `live transaction failed:\n${liveOutput}`);

  const boundaryBusy = run(java, [
    '-cp', classes,
    'com.femonster.core.NativeAudioChannelRouterTransactionProbe',
    path.join(scratch, 'data-boundary-busy'),
  ], {
    FE_MONSTER_ROOT: root,
    FE_MONSTER_XAUDIO2_DLL: nativeDll,
    FE_MONSTER_AUDIO_PROBE_MIXER_BOUNDARY_COMMIT_BUSY_ONCE: '1',
    PATH: `${path.dirname(nativeDll)};${process.env.PATH || ''}`,
  });
  const boundaryBusyOutput = [boundaryBusy.stdout, boundaryBusy.stderr]
    .filter(Boolean)
    .join('\n');
  assert.equal(boundaryBusy.status, 0,
    `BUSY retry transaction failed:\n${boundaryBusyOutput}`);

  const startupReplayFailure = run(java, [
    '-cp', classes,
    'com.femonster.core.NativeAudioChannelRouterTransactionProbe',
    path.join(scratch, 'data-startup-replay-failure'),
    'startup-replay-failure',
  ], {
    FE_MONSTER_ROOT: root,
    FE_MONSTER_XAUDIO2_DLL: nativeDll,
    PATH: `${path.dirname(nativeDll)};${process.env.PATH || ''}`,
  });
  const startupReplayFailureOutput = [
    startupReplayFailure.stdout,
    startupReplayFailure.stderr,
  ].filter(Boolean).join('\n');
  assert.equal(startupReplayFailure.status, 0,
    `atomic startup replay failure was not contained:\n${startupReplayFailureOutput}`);

  // Fixed production contract: one JNI entry point owns the existing native
  // pipeline mutex for all three stages. Router failure returns before the
  // mixer call, so no PCM block can observe a target layout with default
  // router parameters or a partially committed mixer snapshot.
  const nativeSource = readFileSync(
    path.join(root, 'native/windows/fe_monster_xaudio2.cpp'),
    'utf8',
  );
  const serviceSource = readFileSync(
    path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
    'utf8',
  );
  const engineSource = readFileSync(
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    'utf8',
  );
  assert.match(serviceSource,
    /Map<String, Object>\s+submitCombined\s*\(/,
    'NativeBridge must expose the combined Mixer/router transaction');
  assert.doesNotMatch(serviceSource,
    /default\s+Map<String, Object>\s+submitCombined\s*\(/,
    'NativeBridge adapters must explicitly implement the atomic transaction');
  const startupStart = engineSource.indexOf('public synchronized Map<String, Object> startSpatialStream(');
  const startupEnd = engineSource.indexOf('public synchronized int submitSpatialPcm(', startupStart);
  assert.ok(startupStart >= 0 && startupEnd > startupStart,
    'startSpatialStream implementation is missing');
  const startupBody = engineSource.slice(startupStart, startupEnd);
  assert.match(startupBody,
    /reapplyCachedStartupState\(\)/,
    'startup must restore cached Mixer/router state before publishing a session');
  assert.doesNotMatch(startupBody,
    /reapplyCachedMixer\(0\)[\s\S]*reapplyCachedChannelRouter\(0\)/,
    'startup must not replay Mixer and router as two exposed transactions');
  assert.match(startupBody,
    /cachedStateResult\s*!=\s*0[\s\S]{0,240}stopSpatialStreamInternal\(\)[\s\S]{0,240}return\s+spatialError/,
    'failed startup replay must destroy the native graph and reject the session');
  const combinedStart = nativeSource.search(
    /Java_com_femonster_core_NativeAudioEngine_nativeSet(?:SpatialRouterMixer|MixerAndChannelRouter)Parameters\s*\(/,
  );
  assert.notEqual(combinedStart, -1,
    'RED_COMBINED_JNI_MISSING: add one spatial -> router -> mixer JNI transaction');
  const combinedEnd = nativeSource.indexOf('\n}', combinedStart);
  assert.notEqual(combinedEnd, -1, 'combined JNI function body is incomplete');
  const body = nativeSource.slice(combinedStart, combinedEnd);
  const lock = body.indexOf('std::scoped_lock lock(g_spatial_pipeline_mutex)');
  const spatial = body.indexOf('fe_audio_pipeline_set_spatial_controls');
  const router = body.indexOf('fe_audio_pipeline_set_channel_router_params');
  const mixer = body.indexOf('fe_audio_pipeline_set_mixer_params');
  assert.ok(lock >= 0 && lock < spatial && spatial < router && router < mixer,
    'combined JNI must hold one native mutex and execute spatial -> router -> mixer');
  assert.match(body.slice(router, mixer),
    /router_result[\s\S]*?if\s*\([^)]*router_result[^)]*!=\s*0[^)]*\)\s*return/,
    'router failure must return before mixer parameters are submitted');

  for (const pcmEntry of [
    'nativeSubmitSpatialPcm',
    'nativeSubmitSpatialPcmDirect',
  ]) {
    const pcmStart = nativeSource.indexOf(
      `Java_com_femonster_core_NativeAudioEngine_${pcmEntry}`,
    );
    assert.notEqual(pcmStart, -1, `${pcmEntry} JNI entry point is missing`);
    const nextEntry = nativeSource.indexOf('extern "C" JNIEXPORT', pcmStart + 1);
    const pcmBody = nativeSource.slice(
      pcmStart,
      nextEntry === -1 ? nativeSource.length : nextEntry,
    );
    assert.match(pcmBody,
      /std::scoped_lock lock\(g_spatial_pipeline_mutex\)/,
      `${pcmEntry} must share the combined transaction mutex`);
  }

  console.log(JSON.stringify({
    pass: true,
    live: 'no interstitial default router',
    boundaryBusy: 'latest combined Mixer/router transaction retried without cancellation',
    startupReplayFailure: 'no session or native graph published after atomic replay failure',
    transaction: 'spatial -> router -> mixer under g_spatial_pipeline_mutex',
    pcmSerialization: 'both PCM JNI entries share the transaction mutex',
    adapterContract: 'every NativeBridge must implement submitCombined',
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
