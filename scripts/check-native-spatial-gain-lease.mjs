import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'fe-native-gain-lease-'));
const baseline = process.argv.includes('--baseline');
const relativeEngine = 'src/main/java/com/femonster/core/NativeAudioEngine.java';
const homes = [process.env.FE_JAVA26_HOME, path.join(root, 'runtime/java'),
  'E:/java26', 'D:/java26', 'C:/java26', process.env.FE_JAVA_HOME, process.env.JAVA_HOME].filter(Boolean);
const executable = name => homes.map(home => path.join(home, 'bin', `${name}.exe`)).find(existsSync) || name;
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  const original = baseline
    ? run('git', ['show', `HEAD:${relativeEngine}`])
    : readFileSync(path.join(root, relativeEngine), 'utf8');
  assert.ok(/public synchronized Map<String, Object> setSpatialOutputGain\(/.test(original),
    'native output must expose acknowledged, generation-fenced gain control');
  assert.ok(/public synchronized int renewSpatialOutputGainLease\(/.test(original),
    'PCM lease renewal must have its own current-sequence fence');

  const dependencies = ['src/main/java/com/femonster/core/ProjectPaths.java',
    'src/main/java/com/femonster/json/SimpleJson.java'].map(file => path.join(root, file));
  const productionClasses = path.join(temporary, 'production');
  mkdirSync(productionClasses, { recursive: true });
  // Compile the unmodified production class first, including its JNI signatures.
  run(executable('javac'), ['-encoding', 'UTF-8', '--release', '17', '-d', productionClasses,
    ...dependencies, path.join(root, relativeEngine)]);

  let fixture = original;
  function replaceNative(name, body) {
    const pattern = new RegExp(`private static native ([\\w\\[\\]]+) ${name}\\(([^;]*?)\\);`);
    assert.match(fixture, pattern, `${name} must remain a native boundary`);
    fixture = fixture.replace(pattern, (_, type, argumentsText) =>
      `private static ${type} ${name}(${argumentsText}) { ${body} }`);
  }
  // Only JNI declarations are substituted. Validation, state, fencing, reset,
  // stop, and status code all execute directly from the production Java source.
  replaceNative('nativeSetSpatialOutputGain',
    'return NativeSpatialOutputGainLeaseProbe.nativeGain(generation, sequence, gain, expiresAt);');
  replaceNative('nativeRenewSpatialOutputGainLease',
    'return NativeSpatialOutputGainLeaseProbe.nativeRenew(generation, sequence, expiresAt);');
  replaceNative('nativeResetSpatialTimelineGeneration',
    'return NativeSpatialOutputGainLeaseProbe.nativeReset(generation, nextGeneration);');
  replaceNative('nativeSpatialStatus', 'return NativeSpatialOutputGainLeaseProbe.nativeStatus();');
  replaceNative('nativeStopSpatial', 'NativeSpatialOutputGainLeaseProbe.nativeStop();');
  const fixtureSource = path.join(temporary, 'src/com/femonster/core/NativeAudioEngine.java');
  const classes = path.join(temporary, 'fixture');
  mkdirSync(path.dirname(fixtureSource), { recursive: true });
  mkdirSync(classes, { recursive: true });
  writeFileSync(fixtureSource, fixture);
  run(executable('javac'), ['-encoding', 'UTF-8', '--release', '17', '-d', classes,
    ...dependencies, fixtureSource,
    path.join(root, 'scripts/java/com/femonster/core/NativeSpatialOutputGainLeaseProbe.java')]);
  process.stdout.write(run(executable('java'), ['-cp', classes,
    'com.femonster.core.NativeSpatialOutputGainLeaseProbe']));
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
