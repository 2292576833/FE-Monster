import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import { resolve, join, delimiter } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const app = readFileSync(join(root, 'web/app.js'), 'utf8');
const transportFunctions = app.slice(app.indexOf('function mediaIsSameOrigin('), app.indexOf("const WALLPAPER_PREFS_KEY ="));
const ticketPath = `/api/audio-sources/media?ticket=${'a'.repeat(43)}`;
for (const host of ['localhost', '127.0.0.1', '[::1]']) {
  const location = new URL(`http://${host}:58930/`);
  const browserUrl = runInNewContext(`${transportFunctions}; browserAudioUrl`, {
    URL, window: { location }, state: { providers: {} }, safeText: (value, fallback) => String(value || fallback)
  });
  assert.equal(new URL(browserUrl(`http://127.0.0.1:58930${ticketPath}`), location).href, `${location.origin}${ticketPath}`, `local source ticket must remain same-origin at ${host}`);
  assert.match(browserUrl(`http://127.0.0.1:58931${ticketPath}`), /^\/api\/audio\/stream\?/, 'other local ports must not be trusted');
  assert.match(browserUrl(`https://media.example.org${ticketPath}`), /^\/api\/audio\/stream\?/, 'foreign origins must not be converted to local tickets');
}
process.stdout.write('Browser source ticket routing passed for localhost, IPv4 and IPv6 aliases\n');
const classes = mkdtempSync(join(tmpdir(), 'fe-source-registry-'));
try {
  const files = [
    'src/main/java/com/femonster/json/SimpleJson.java',
    'src/main/java/com/femonster/model/Song.java',
    'src/main/java/com/femonster/music/PlaybackSource.java',
    'src/main/java/com/femonster/music/MusicProviderClient.java',
    'src/main/java/com/femonster/music/MusicProviderRegistry.java',
    'src/test/java/com/femonster/music/PlaybackResolverRegistryProbe.java'
  ];
  const build = spawnSync('javac', ['-J-Duser.language=en', '-J-Dfile.encoding=UTF-8', '-encoding', 'UTF-8', '--release', '17', '-cp', join(root, 'out/fe-monster-java.jar'), '-d', classes, ...files], { cwd: root, encoding: 'utf8', timeout: 60_000 });
  assert.equal(build.status, 0, `registry compile failed:\n${build.stdout}\n${build.stderr}`);
  const run = spawnSync('java', ['-cp', [classes, join(root, 'out/fe-monster-java.jar')].join(delimiter), 'com.femonster.music.PlaybackResolverRegistryProbe'], { cwd: root, encoding: 'utf8', timeout: 20_000 });
  assert.equal(run.status, 0, `registry probe failed:\n${run.stdout}\n${run.stderr}`);
  process.stdout.write(run.stdout);
} finally {
  rmSync(classes, { recursive: true, force: true });
}
