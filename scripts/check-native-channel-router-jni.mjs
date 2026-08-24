import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const externalScratch = 'E:\\FE_audio_tmp';
const scratch = path.join(externalScratch, 'native-channel-router-jni-probe');
const classes = path.join(scratch, 'classes');
const emptyRoot = path.join(scratch, 'no-native-runtime');
const suffix = process.platform === 'win32' ? '.exe' : '';
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
mkdirSync(emptyRoot, { recursive: true });

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: externalScratch,
      TMP: externalScratch,
      ...extraEnv,
    },
  });
  assert.equal(result.error?.code, undefined, result.error?.message || 'probe process error');
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  }
  return result.stdout.trim();
}

try {
  run(javac, [
    '-encoding', 'UTF-8', '--release', '17', '-d', classes,
    path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    path.join(root, 'src/test/java/com/femonster/core/NativeAudioChannelRouterProbe.java'),
    path.join(root, 'src/test/java/com/femonster/core/NativeAudioChannelRouterLiveProbe.java'),
  ]);
  const output = run(java, [
    '-cp', classes,
    'com.femonster.core.NativeAudioChannelRouterProbe',
  ], {
    FE_MONSTER_ROOT: emptyRoot,
    FE_MONSTER_WEB_ROOT: path.join(emptyRoot, 'web'),
    FE_MONSTER_DATA_DIR: path.join(emptyRoot, 'data'),
  });
  assert.match(output, /NativeAudioChannelRouterProbe passed/);

  const liveDll = path.join(
    root,
    'native/windows/.cmake-build-xaudio2-vs18/runtime/fe-monster-xaudio2.dll',
  );
  assert.ok(existsSync(liveDll), `missing current native test DLL: ${liveDll}`);
  const liveOutput = run(java, [
    '-cp', classes,
    'com.femonster.core.NativeAudioChannelRouterLiveProbe',
  ], {
    FE_MONSTER_ROOT: root,
    FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
    FE_MONSTER_DATA_DIR: path.join(scratch, 'live-data'),
    FE_MONSTER_XAUDIO2_DLL: liveDll,
  });
  assert.match(liveOutput, /NativeAudioChannelRouterLiveProbe passed/);

  const javaSource = readFileSync(
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    'utf8',
  );
  const nativeSource = readFileSync(
    path.join(root, 'native/windows/fe_monster_xaudio2.cpp'),
    'utf8',
  );
  assert.match(javaSource, /NATIVE_CHANNEL_ROUTER_VALUE_COUNT\s*=\s*41/);
  assert.match(javaSource, /NATIVE_CHANNEL_ROUTER_STATUS_SIZE\s*=\s*34/);
  assert.match(javaSource, /NATIVE_MIXER_STATUS_SIZE\s*=\s*29/);
  assert.match(javaSource, /NATIVE_SPATIAL_STATUS_SIZE\s*=\s*32/);
  assert.match(javaSource, /nativeSetChannelRouterParameters\s*\(/);
  assert.match(javaSource, /nativeChannelRouterStatus\s*\(/);
  assert.match(javaSource, /nativeGenerateChannelTestSignal\s*\(/);
  assert.match(nativeSource, /kChannelRouterValueCount\s*=\s*41/);
  assert.match(nativeSource, /kChannelRouterStatusValueCount\s*=\s*34/);
  assert.match(nativeSource, /nativeSetChannelRouterParameters/);
  assert.match(nativeSource, /nativeChannelRouterStatus/);
  assert.match(nativeSource, /nativeGenerateChannelTestSignal/);
  assert.match(nativeSource, /native_revision\s*=\s*static_cast<uint64_t>\(revision\)\s*\+\s*2u/);

  console.log(JSON.stringify({
    pass: true,
    java: output,
    liveJava: liveOutput,
    params: 41,
    status: 34,
    testSignal: 'one-hot virtual bed queued through Mixer and OBR',
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
