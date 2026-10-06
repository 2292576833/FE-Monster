import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const temp = mkdtempSync(join(tmpdir(), 'fe-audio-service-'));
try {
  const files = ['src/main/java/com/femonster/json/SimpleJson.java', 'src/main/java/com/femonster/core/ProjectPaths.java', 'src/main/java/com/femonster/model/Song.java', 'src/main/java/com/femonster/music/PlaybackSource.java', 'src/main/java/com/femonster/music/MusicProviderClient.java', 'src/main/java/com/femonster/music/MusicProviderRegistry.java', 'src/main/java/com/femonster/http/HttpUtil.java', 'src/main/java/com/femonster/api/LocalPetAssistantGuard.java', 'src/main/java/com/femonster/api/AudioSourceHttpModule.java', 'src/main/java/com/femonster/music/sources/AudioSourceService.java', 'src/main/java/com/femonster/music/sources/LxProcessRunner.java', 'src/test/java/com/femonster/music/sources/AudioSourceServiceProbe.java', 'src/test/java/com/femonster/music/sources/LxProcessRunnerProbe.java', 'src/test/java/com/femonster/music/sources/AudioSourceHttpProbe.java'];
  files.push('src/main/java/com/femonster/music/sources/AudioSourceMediaRelay.java', 'src/test/java/com/femonster/music/sources/AudioSourceMediaRelayProbe.java', 'src/test/java/com/femonster/music/sources/AudioSourceQuickJsProbe.java');
  const build = spawnSync('javac', ['-encoding', 'UTF-8', '--release', '17', '-cp', join(root, 'out/fe-monster-java.jar'), '-d', temp, ...files], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(build.status, 0, `service compile failed:\n${build.stdout}\n${build.stderr}`);
  const run = spawnSync('java', ['-cp', [temp, join(root, 'out/fe-monster-java.jar')].join(delimiter), 'com.femonster.music.sources.AudioSourceServiceProbe', join(temp, 'data')], { cwd: root, encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 0, `service probe failed:\n${run.stdout}\n${run.stderr}`);
  process.stdout.write(run.stdout);
  const classpath = [temp, join(root, 'out/fe-monster-java.jar')].join(delimiter);
  for (const [probe, args] of [
    ['LxProcessRunnerProbe', [process.execPath, join(root, 'src/test/java/com/femonster/music/sources/process-fixture.mjs'), temp]],
    ['AudioSourceHttpProbe', [join(temp, 'http-data')]],
    ['AudioSourceMediaRelayProbe', [process.execPath, join(root, 'src/test/java/com/femonster/music/sources/media-fixture.mjs')]],
    ['AudioSourceQuickJsProbe', [join(temp, 'quickjs-data')]],
  ]) {
    const result = spawnSync('java', ['-cp', classpath, `com.femonster.music.sources.${probe}`, ...args], { cwd: root, encoding: 'utf8', timeout: 30_000, env: { ...process.env, NODE_OPTIONS: '--require=ABSOLUTELY_NONEXISTENT_PRELOAD.cjs', NODE_PATH: 'SECRET_NODE_PATH', FE_FAKE_SECRET: 'SECRET', HTTPS_PROXY: 'https://SECRET.invalid' } });
    assert.equal(result.status, 0, `${probe} failed:\n${result.stdout}\n${result.stderr}`);
    process.stdout.write(result.stdout);
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
