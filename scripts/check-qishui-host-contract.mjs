import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const output = path.join(root, '.tmp', 'qishui-host-contract-classes');
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
    path.join(root, 'src/main/java/com/femonster/music/CommentPayloads.java'),
    path.join(root, 'src/main/java/com/femonster/music/MusicProviderRegistry.java'),
    path.join(root, 'src/main/java/com/femonster/music/ProviderProtocol.java'),
    path.join(root, 'src/main/java/com/femonster/music/GenericMusicClient.java'),
    path.join(root, 'src/main/java/com/femonster/music/ProviderProtocolClient.java'),
    path.join(root, 'scripts/java/QishuiHostContractProbe.java')
  ]);
  console.log(run(executable('java'), [
    '--add-modules', 'jdk.httpserver',
    '-cp', output,
    'QishuiHostContractProbe'
  ]));
} finally {
  rmSync(output, { recursive: true, force: true });
}
