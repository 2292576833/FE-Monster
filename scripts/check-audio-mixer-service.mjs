import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const scratch = path.join(root, 'tmp', 'audio-mixer-service-probe');
const classes = path.join(scratch, 'classes');
const data = path.join(scratch, 'data');
const suffix = process.platform === 'win32' ? '.exe' : '';
const javaHomes = [
  process.env.FE_JAVA26_HOME,
  'E:\\java26',
  'D:\\java26',
  'C:\\Program Files\\Java\\jdk-17',
  path.join(root, 'runtime', 'java'),
  process.env.FE_TEST_JAVA_HOME,
  process.env.FE_JAVA_HOME,
  process.env.JAVA_HOME,
].filter(Boolean);
const java = javaHomes.map((home) => path.join(home, 'bin', `java${suffix}`)).find(existsSync) || 'java';
const javac = javaHomes.map((home) => path.join(home, 'bin', `javac${suffix}`)).find(existsSync) || 'javac';
const cargoCandidates = [
  path.join(root, '.tools', 'cargo', 'bin', `cargo${suffix}`),
  process.env.CARGO_HOME && path.join(process.env.CARGO_HOME, 'bin', `cargo${suffix}`),
].filter(Boolean);
const cargo = cargoCandidates.find(existsSync) || `cargo${suffix}`;
const installedNativeDll = path.join(root, 'native', 'windows', 'build', 'fe-monster-xaudio2.dll');
const nextNativeDll = path.join(root, 'native', 'windows', 'build-next', 'fe-monster-xaudio2.dll');
const nativeDll = existsSync(nextNativeDll)
  && (!existsSync(installedNativeDll)
    || statSync(nextNativeDll).mtimeMs > statSync(installedNativeDll).mtimeMs)
  ? nextNativeDll
  : installedNativeDll;

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });
mkdirSync(data, { recursive: true });

function run(command, args, timeout = 60_000) {
  const environment = {
    ...process.env,
    TEMP: path.join(root, 'tmp'),
    TMP: path.join(root, 'tmp'),
    CARGO_HOME: path.join(root, '.tools', 'cargo'),
    RUSTUP_HOME: path.join(root, '.tools', 'rustup'),
    CARGO_TARGET_DIR: path.join(root, 'native', 'rust-audio-upmix', 'target'),
  };
  if (existsSync(nativeDll)) {
    environment.FE_MONSTER_ROOT = root;
    environment.FE_MONSTER_XAUDIO2_DLL = nativeDll;
  }
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: environment,
  });
  assert.equal(result.error?.code, undefined, `probe process error: ${result.error?.message || ''}`);
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

function normalizedPresets(payload) {
  const spatialOnly = new Set([
    'upmixEnabled', 'upmixAlgorithm', 'upmixOutputLayout',
    'upmixCenterWidthHz', 'upmixLfeCrossoverHz', 'upmixCenterGain',
    'upmixSurroundGain', 'upmixLfeGain', 'upmixDecorrelation',
    'obrEnabled', 'obrFilterProfile', 'obrWet', 'obrDry',
    'obrOutputGainDb', 'obrSpatialWidth',
  ]);
  return {
    presetVersion: payload.presetVersion,
    presets: payload.presets.map(({ id, parameters }) => ({
      id,
      parameters: Object.fromEntries(
        Object.entries(parameters).filter(([key]) => !spatialOnly.has(key)),
      ),
    })),
  };
}

try {
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-d', classes,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
    path.join(root, 'src/main/java/com/femonster/api/LocalPetAssistantGuard.java'),
    path.join(root, 'src/test/java/com/femonster/core/AudioMixerServiceProbe.java'),
  ]);
  const output = run(java, ['-cp', classes, 'com.femonster.core.AudioMixerServiceProbe', data]);
  assert.match(output, /AudioMixerServiceProbe passed/);
  let nativeReapply = 'skipped';
  let nativeBoundaryBusy = 'skipped';
  let nativeDelayedPcm = 'skipped';
  if (process.platform === 'win32' && existsSync(nativeDll)) {
    nativeReapply = run(java, [
      '--enable-native-access=ALL-UNNAMED',
      '-cp', classes,
      'com.femonster.core.AudioMixerServiceProbe',
      path.join(data, 'native-reapply'),
      '--native-reapply',
    ]);
    assert.match(nativeReapply, /native reapply passed/);
    process.env.FE_MONSTER_AUDIO_PROBE_MIXER_BOUNDARY_COMMIT_BUSY_ONCE = '1';
    try {
      nativeBoundaryBusy = run(java, [
        '--enable-native-access=ALL-UNNAMED',
        '-cp', classes,
        'com.femonster.core.AudioMixerServiceProbe',
        path.join(data, 'native-boundary-busy'),
        '--native-reapply',
      ]);
    } finally {
      delete process.env.FE_MONSTER_AUDIO_PROBE_MIXER_BOUNDARY_COMMIT_BUSY_ONCE;
    }
    assert.match(nativeBoundaryBusy, /native reapply passed/);
    process.env.FE_MONSTER_AUDIO_PROBE_DELAY_PCM_AFTER_RETRY_BUDGET = '1';
    try {
      nativeDelayedPcm = run(java, [
        '--enable-native-access=ALL-UNNAMED',
        '-cp', classes,
        'com.femonster.core.AudioMixerServiceProbe',
        path.join(data, 'native-delayed-pcm'),
        '--native-reapply',
      ]);
    } finally {
      delete process.env.FE_MONSTER_AUDIO_PROBE_DELAY_PCM_AFTER_RETRY_BUDGET;
    }
    assert.match(nativeDelayedPcm, /native reapply passed/);
  }

  const javaDump = JSON.parse(run(java, [
    '-cp', classes,
    'com.femonster.core.AudioMixerServiceProbe',
    path.join(data, 'dump'),
    '--dump-presets',
  ]));
  const rustDump = JSON.parse(run(cargo, [
    'run', '--quiet', '--manifest-path',
    path.join(root, 'native/rust-audio-upmix/Cargo.toml'),
    '--example', 'mixer_preset_dump', '--locked', '--offline',
  ], 180_000));
  assert.deepEqual(
    normalizedPresets(javaDump),
    normalizedPresets(rustDump),
    'Java Mixer-stage preset fields drifted from Rust mixer_preset_params',
  );

  const appContext = readFileSync(path.join(root, 'src/main/java/com/femonster/core/AppContext.java'), 'utf8');
  const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
  const nativeEngine = readFileSync(path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'), 'utf8');
  const service = readFileSync(path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'), 'utf8');

  assert.match(appContext, /public final AudioMixerService audioMixer;/);
  assert.ok(
    appContext.indexOf('this.audioMixer = new AudioMixerService') > appContext.indexOf('this.audioEngine = new NativeAudioEngine'),
    'AudioMixerService must be constructed after NativeAudioEngine',
  );

  const namespaceGuard = routes.indexOf('path.startsWith("/api/audio/mixer")');
  const genericOptions = routes.indexOf('HttpUtil.handleOptions(exchange)');
  assert.ok(namespaceGuard >= 0 && namespaceGuard < genericOptions,
    'Mixer namespace guard must run before generic OPTIONS/404/405 handling');
  assert.match(routes, /LocalPetAssistantGuard\.require\(exchange\)/);
  assert.match(routes, /case "\/api\/audio\/mixer"/);
  assert.match(routes, /case "\/api\/audio\/mixer\/presets"/);
  assert.match(routes, /case "\/api\/audio\/mixer\/channels"/);
  assert.match(routes, /"\/api\/audio\/mixer\/channels\/test"\.equals\(path\)/);
  assert.match(routes, /context\.audioMixer\.patchChannels/);
  assert.match(routes, /context\.audioMixer\.playChannelTestSignal/);
  assert.match(routes, /\/api\/audio\/mixer\/presets\/[\s\S]{0,160}\/apply/);
  assert.match(routes, /"PATCH"\.equals\(method\)/);
  assert.match(routes, /audio_mixer_revision_conflict/);
  assert.match(routes, /audio_mixer_persistence_failed/);
  assert.match(routes, /audio mixer state is unavailable/);
  assert.match(routes, /HttpUtil\.sendJson\(exchange,\s*409/);
  assert.match(routes, /MAX_AUDIO_MIXER_JSON_BYTES/);
  assert.match(routes, /readNBytes\(MAX_AUDIO_MIXER_JSON_BYTES \+ 1\)/);
  assert.match(routes, /SimpleJson\.parseObjectStrict/);
  assert.match(routes, /validateAudioMixerMutationRoot/);
  assert.match(routes, /Set\.of\("expectedRevision", "parameters"\)/);
  assert.match(routes, /Set\.of\("expectedRevision"\)/);

  assert.match(service, /STATE_VERSION\s*=\s*1/);
  assert.match(service, /PRESET_VERSION\s*=\s*1/);
  assert.match(service, /StandardCopyOption\.ATOMIC_MOVE/);
  assert.match(service, /FileChannel[\s\S]{0,500}force\(true\)/);
  assert.match(service, /\.corrupt-/);
  assert.match(service, /corruptEvidencePreserved/);
  assert.doesNotMatch(service, /Files\.readAllBytes\(stateFile\)/,
    'corrupt-state recovery must never materialize an unbounded state file');
  assert.match(service, /readNBytes\(MAX_STATE_BYTES \+ 1\)/,
    'state reads must be capped independently of a prior size check');
  assert.match(service, /preserveCorruptEvidence[\s\S]{0,1400}Files\.move\([\s\S]{0,300}StandardCopyOption\.ATOMIC_MOVE/,
    'exact corrupt evidence must use an atomic same-directory move');
  assert.match(service, /if\s*\(\s*"corrupt"\.equals\(configState\)\s*&&\s*!corruptEvidencePreserved\s*\)[\s\S]{0,180}throw new IOException/,
    'a mutation must not overwrite corrupt state when exact evidence was not preserved');
  assert.match(service, /restrictOwnerOnly/);
  assert.match(service, /RevisionConflictException/);
  assert.match(service, /persist\(next\)[\s\S]{0,500}nativeBridge\.submit/,
    'desired state must be atomically persisted before native submission');

  assert.match(nativeEngine, /NATIVE_SPATIAL_STATUS_SIZE\s*=\s*32/);
  assert.match(nativeEngine, /NATIVE_MIXER_VALUE_COUNT\s*=\s*44/);
  assert.match(nativeEngine, /cachedMixerValues/);
  assert.match(nativeEngine, /cachedMixerCommitted/,
    'pending status must track whether the cached snapshot actually committed');
  assert.match(nativeEngine, /isMixerDesiredPending/,
    'desired-pending status must not be inferred only from revision comparison');
  assert.match(nativeEngine, /spatialRevisionCommitted/,
    'native revision zero must carry an explicit spatial commit state');
  assert.match(nativeEngine, /nativeConfigureSpatial[\s\S]{0,1400}reapplyCachedStartupState\(\)/,
    'new spatial pipeline must atomically receive the cached desired snapshot before PCM is accepted');
  assert.match(nativeEngine, /Math\.round\([^\n]*0\.020/,
    'active edits need an approximately 20 ms frame ramp');
  assert.match(nativeEngine, /public synchronized Map<String, Object> mixerPayload\(\)/);
  assert.match(nativeEngine, /private static native int nativeSetMixerParameters/);
  assert.match(nativeEngine, /private static native double\[\] nativeMixerStatus/);
  assert.match(nativeEngine, /NATIVE_CHANNEL_ROUTER_STATUS_SIZE\s*=\s*34/);
  assert.match(nativeEngine, /private static native int nativeSetChannelRouterParameters/);
  assert.match(nativeEngine, /private static native double\[\] nativeChannelRouterStatus/);

  console.log(JSON.stringify({
    pass: true,
    serviceProbe: output,
    nativeReapply,
    nativeBoundaryBusy,
    nativeDelayedPcm,
    presets: javaDump.presets.length,
    rustParity: 'Mixer-stage field-by-field mixer_preset_params v1',
    routes: [
      'GET /api/audio/mixer',
      'PATCH /api/audio/mixer',
      'GET /api/audio/mixer/presets',
      'POST /api/audio/mixer/presets/{id}/apply',
      'GET /api/audio/mixer/channels',
      'PATCH /api/audio/mixer/channels',
      'POST /api/audio/mixer/channels/test',
    ],
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
