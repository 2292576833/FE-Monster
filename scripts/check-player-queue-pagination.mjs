import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(path.join(tmpdir(), 'fe-player-queue-probe-'));
const classes = path.join(temporary, 'classes');
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
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status || 1);
}

try {
  mkdirSync(classes, { recursive: true });
  const sources = [
    'src/main/java/com/femonster/json/SimpleJson.java',
    'src/main/java/com/femonster/model/Song.java',
    'src/main/java/com/femonster/music/MusicProviderClient.java',
    'src/main/java/com/femonster/music/PlaybackSource.java',
    'src/main/java/com/femonster/music/MusicProviderRegistry.java',
    'src/main/java/com/femonster/core/PlayerService.java',
    'scripts/java/com/femonster/core/PlayerQueuePaginationProbe.java'
  ].map((entry) => path.join(root, entry));
  run(executable('javac'), ['-encoding', 'UTF-8', '--release', '17', '-d', classes, ...sources]);
  run(executable('java'), ['-cp', classes, 'com.femonster.core.PlayerQueuePaginationProbe']);
  const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
  assert.match(
    routes,
    /case\s+"\/api\/player\/queue"\s*->\s*HttpUtil\.sendJson\(exchange,\s*context\.player\.queuePage\(/s,
    'GET /api/player/queue must expose the bounded page instead of the full player state'
  );
} finally {
  rmSync(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
