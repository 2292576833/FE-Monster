import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const nativeSource = fs.readFileSync(
  path.join(root, 'native', 'windows', 'fe_monster_xaudio2.cpp'),
  'utf8'
);
const javaSource = fs.readFileSync(
  path.join(root, 'src', 'main', 'java', 'com', 'femonster', 'core', 'NativeAudioEngine.java'),
  'utf8'
);

assert.match(nativeSource, /AUDCLNT_STREAMFLAGS_LOOPBACK\s*\|\s*AUDCLNT_STREAMFLAGS_EVENTCALLBACK/);
assert.match(nativeSource, /WaitForMultipleObjects\s*\(/);
assert.match(nativeSource, /kCaptureIdleTimeoutMs\s*=\s*900/);
assert.match(nativeSource, /g_capture_last_request_tick\.store\(GetTickCount64\(\)/);
assert.match(nativeSource, /if \(ready\) g_capture_shutdown\.store\(false/);
assert.doesNotMatch(nativeSource, /Sleep\(10\)/);
assert.doesNotMatch(nativeSource, /std::thread\(capture_thread_main\)\.detach\(\)/);
assert.match(nativeSource, /nativeShutdown[\s\S]*?stop_capture\(\)/);
assert.match(javaSource, /NativeSample sample = sample\(false\)/);
assert.match(javaSource, /NativeSample sample = sample\(true\)/);
assert.match(javaSource, /nativeSampleState\(boolean requestCapture\)/);
assert.match(javaSource, /nativeShutdown\(\)/);

const javaHome = [
  'C:\\Program Files\\Java\\jdk-17',
  process.env.JAVA_HOME
].find((candidate) => candidate && fs.existsSync(path.join(candidate, 'bin', 'javac.exe'))) || '';
const javac = path.join(javaHome, 'bin', 'javac.exe');
const java = path.join(javaHome, 'bin', 'java.exe');
const jars = fs.existsSync(path.join(root, 'out'))
  ? fs.readdirSync(path.join(root, 'out'))
    .filter((name) => /^fe-monster-java-.*\.jar$/i.test(name))
    .map((name) => path.join(root, 'out', name))
    .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs)
  : [];
const dllCandidates = [
  path.join(root, 'native', 'windows', '.cmake-build-xaudio2-vs18', 'runtime', 'fe-monster-xaudio2.dll'),
  path.join(root, 'native', 'windows', '.cmake-build-xaudio2-vs17', 'runtime', 'fe-monster-xaudio2.dll'),
  path.join(root, 'native', 'windows', 'build', 'fe-monster-xaudio2.dll')
];
const dll = dllCandidates.find((candidate) => fs.existsSync(candidate));

let runtime = { skipped: true, reason: 'JDK, Java build, or native DLL is unavailable' };
if (fs.existsSync(javac) && fs.existsSync(java) && jars.length && dll) {
  const classes = fs.mkdtempSync(path.join(os.tmpdir(), 'fe-monster-capture-contract-'));
  try {
    const compile = spawnSync(javac, [
      '-encoding', 'UTF-8',
      '-cp', jars[0],
      '-d', classes,
      path.join(root, 'scripts', 'java', 'NativeCaptureLifecycleProbe.java')
    ], { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30_000 });
    assert.equal(compile.status, 0, compile.stderr || compile.stdout || 'capture probe compilation failed');
    const execution = spawnSync(java, [
      '-cp', `${classes};${jars[0]}`,
      'com.femonster.core.NativeCaptureLifecycleProbe'
    ], {
      cwd: root,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 30_000,
      env: { ...process.env, FE_MONSTER_XAUDIO2_DLL: dll }
    });
    assert.equal(execution.status, 0, execution.stderr || execution.stdout || 'capture lifecycle probe failed');
    runtime = JSON.parse(execution.stdout.trim());
    assert.equal(runtime.pass, true);
  } finally {
    fs.rmSync(classes, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({
  pass: true,
  capture: 'event-driven-demand-start-idle-stop',
  idleTimeoutMs: 900,
  runtime
}, null, 2));
