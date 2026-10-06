import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const runtime = path.resolve(process.argv[2] || path.join(root, 'native/windows/build'));
const scratch = path.join(root, 'tmp/native-spatial-output-lease-live');
mkdirSync(path.join(scratch, 'classes'), { recursive: true });
mkdirSync(path.join(scratch, 'data'), { recursive: true });
const env = { ...process.env, FE_MONSTER_ROOT: root, FE_MONSTER_WEB_ROOT: path.join(root, 'web'),
  FE_MONSTER_DATA_DIR: path.join(scratch, 'data'),
  FE_MONSTER_XAUDIO2_DLL: path.join(runtime, 'fe-monster-xaudio2.dll'),
  FE_MONSTER_RUST_UPMIX_DLL: path.join(runtime, 'fe_monster_upmix.dll') };
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true, timeout: 60_000, env });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}
run('javac', ['-encoding', 'UTF-8', '--release', '17', '-d', path.join(scratch, 'classes'),
  path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
  path.join(root, 'src/main/java/com/femonster/core/ProjectPaths.java'),
  path.join(root, 'src/main/java/com/femonster/core/NativeAudioEngine.java'),
  path.join(root, 'scripts/fixtures/NativeAudioGainLeaseLiveProbe.java')]);
const report = JSON.parse(run('java', ['-cp', path.join(scratch, 'classes'), 'com.femonster.core.NativeAudioGainLeaseLiveProbe']));
report.runtime = runtime;
const output = path.join(root, 'output/native-audio-underrun');
mkdirSync(output, { recursive: true });
writeFileSync(path.join(output, 'lease-live.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
assert.equal(report.pass, true);
