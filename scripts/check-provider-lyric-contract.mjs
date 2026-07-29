import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const output = path.join(root, '.tmp', 'provider-lyric-contract-classes');
const routes = readFileSync(path.join(root, 'src/main/java/com/femonster/api/ApiRoutes.java'), 'utf8');
const app = readFileSync(path.join(root, 'web/app.js'), 'utf8');
const requiredRoutes = [
  '"/api/lyric"',
  '"/api/netease/lyric"',
  '"/api/qq/lyric"',
  '"/api/kugou/lyric"',
];

for (const route of requiredRoutes) {
  if (!routes.includes(route)) throw new Error(`Missing FE lyric route: ${route}`);
}
if (!routes.includes('context.music.lyricPayload(') || !routes.includes('providerFrom(path, query)')) {
  throw new Error('FE lyric routes do not dispatch through MusicProviderRegistry');
}
if (!/function lyricSignatureForSong[\s\S]{0,260}playbackQualityProvider\(song\)/.test(app)) {
  throw new Error('Frontend lyric signature does not include the song provider');
}
if (!/apiJson\(`\/api\/lyric\?\$\{query\(\{\s*provider,\s*id,\s*title:[\s\S]{0,180}artist:[\s\S]{0,180}duration:/m.test(app)) {
  throw new Error('Frontend lyrics do not send provider, title, artist, and duration metadata');
}
for (const metadataParam of ['title', 'artist', 'duration']) {
  if (!routes.includes(`HttpUtil.param(query, "${metadataParam}"`)
      && !routes.includes(`HttpUtil.intParam(query, "${metadataParam}"`)) {
    throw new Error(`FE lyric route does not forward ${metadataParam} metadata`);
  }
}

const javaHome = process.env.FE_JAVA26_HOME || '';
const executable = (name) => {
  const fromHome = javaHome ? path.join(javaHome, 'bin', `${name}.exe`) : '';
  if (fromHome && existsSync(fromHome)) return fromHome;
  const bundled = path.join(root, 'runtime', 'java', 'bin', `${name}.exe`);
  if (existsSync(bundled)) return bundled;
  return `${name}.exe`;
};
const run = (command, args) => {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', windowsHide: true });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stdout || ''}${result.stderr || ''}`);
  }
  return result.stdout.trim();
};

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
try {
  run(executable('javac'), [
    '-encoding', 'UTF-8',
    '--release', '17',
    '--add-modules', 'jdk.httpserver',
    '-d', output,
    path.join(root, 'src/main/java/com/femonster/json/SimpleJson.java'),
    path.join(root, 'src/main/java/com/femonster/model/Song.java'),
    path.join(root, 'src/main/java/com/femonster/model/Playlist.java'),
    path.join(root, 'src/main/java/com/femonster/music/MusicProviderClient.java'),
    path.join(root, 'src/main/java/com/femonster/music/PlaybackSource.java'),
    path.join(root, 'src/main/java/com/femonster/music/MusicProviderRegistry.java'),
    path.join(root, 'src/main/java/com/femonster/music/CommentPayloads.java'),
    path.join(root, 'src/main/java/com/femonster/music/ProviderProtocol.java'),
    path.join(root, 'src/main/java/com/femonster/music/GenericMusicClient.java'),
    path.join(root, 'src/main/java/com/femonster/netease/NeteaseClient.java'),
    path.join(root, 'scripts/java/ProviderLyricContractProbe.java'),
  ]);
  console.log(run(executable('java'), [
    '--add-modules', 'jdk.httpserver',
    '-cp', output,
    'ProviderLyricContractProbe',
  ]));
} finally {
  rmSync(output, { recursive: true, force: true });
}
