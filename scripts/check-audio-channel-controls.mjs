import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const externalScratch = 'E:\\FE_audio_tmp';
const scratch = path.join(externalScratch, `audio-channel-controls-probe-${process.pid}`);
const classes = path.join(scratch, 'classes');
const cargoTarget = path.join(scratch, 'cargo-target');
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
const cargo = [
  path.join(root, '.tools', 'cargo', 'bin', `cargo${suffix}`),
  process.env.CARGO_HOME && path.join(process.env.CARGO_HOME, 'bin', `cargo${suffix}`),
].filter(Boolean).find(existsSync) || `cargo${suffix}`;

rmSync(scratch, { recursive: true, force: true });
mkdirSync(classes, { recursive: true });

function run(command, args, timeout = 180_000) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    windowsHide: true,
    env: {
      ...process.env,
      TEMP: externalScratch,
      TMP: externalScratch,
      CARGO_HOME: path.join(root, '.tools', 'cargo'),
      RUSTUP_HOME: path.join(root, '.tools', 'rustup'),
      CARGO_TARGET_DIR: cargoTarget,
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
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
    path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
    path.join(root, 'src/main/java/com/femonster/core/AudioMixerService.java'),
    path.join(root, 'src/test/java/com/femonster/core/AudioChannelControlsProbe.java'),
    path.join(root, 'src/test/java/com/femonster/core/AudioChannelRouterIntegrationProbe.java'),
  ]);
  const javaProbe = run(java, [
    '-cp', classes,
    'com.femonster.core.AudioChannelControlsProbe',
    path.join(scratch, 'data'),
  ]);
  assert.match(javaProbe, /AudioChannelControlsProbe passed/);
  const integrationProbe = run(java, [
    '-cp', classes,
    'com.femonster.core.AudioChannelRouterIntegrationProbe',
    path.join(scratch, 'integration-data'),
  ]);
  assert.match(integrationProbe, /AudioChannelRouterIntegrationProbe passed/);

  const rustProbe = run(cargo, [
    'test', '--manifest-path',
    path.join(root, 'native/rust-audio-upmix/Cargo.toml'),
    '--test', 'channel_router_contract', '--locked', '--offline',
  ]);
  assert.match(rustProbe, /13 passed/);

  const rust = readFileSync(path.join(root, 'native/rust-audio-upmix/src/channel_router.rs'), 'utf8');
  const header = readFileSync(
    path.join(root, 'native/rust-audio-upmix/include/fe_rust_channel_router.h'),
    'utf8',
  );
  assert.match(rust, /FFmpeg\/OBS order/);
  assert.match(rust, /ALGORITHM_DOLBY_PRO_LOGIC_II[\s\S]{0,250}ALGORITHM_LICENSE_REQUIRED/);
  assert.match(rust, /delay:\s*Vec<f32>/, 'router must own preallocated delay memory');
  const createBody = rust.slice(rust.indexOf('pub fn new(config:'), rust.indexOf('pub fn stage(&self'));
  assert.match(createBody, /delay:\s*vec!\[0\.0;/,
    'delay memory must be allocated during create');
  const processBody = rust.slice(rust.indexOf('pub fn process(&mut self'), rust.indexOf('pub fn reset(&mut self'));
  assert.doesNotMatch(processBody, /Vec::|vec!\[|\.resize\(|\.push\(/,
    'audio process path must not allocate');
  assert.match(header, /5\.1 = FL, FR, FC, LFE, SL, SR/);
  assert.match(header, /7\.1 = FL, FR, FC, LFE, BL, BR, SL, SR/);

  console.log(JSON.stringify({
    pass: true,
    java: javaProbe,
    integration: integrationProbe,
    rust: '13 channel-router contract tests passed',
    abi: 'additive channel-router v1; legacy upmix/mixer/status contracts unchanged',
    routeConnected: { builtins: true, explicitJni: true },
  }, null, 2));
} finally {
  rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
