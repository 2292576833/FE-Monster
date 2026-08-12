import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const output = path.join(root, '.tmp', 'qq-host-contract-classes');
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

const assertStaticContract = () => {
  const genericClient = readFileSync(path.join(root, 'src/main/java/com/femonster/music/GenericMusicClient.java'), 'utf8');
  assert.match(genericClient, /extractQqPrivatePlaylists\(detailRoot\)/,
    'formal QQ protocol must fall back to authenticated private user detail');
  assert.match(genericClient, /qqBadgeVipSignal\(profile\)/,
    'QQ account parsing must recognize structured VIP badge descriptions');

  const buildScript = readFileSync(path.join(root, 'music-api-plugins/qq/build.ps1'), 'utf8');
  assert.match(buildScript, /patch-runtime\.cjs/,
    'QQ package build must apply the private-library runtime patch');
  const manifest = JSON.parse(readFileSync(path.join(root, 'music-api-plugins/qq/music-api-package.json'), 'utf8'));
  assert.equal(manifest.version, '2.4.1', 'patched QQ wrapper version must be 2.4.1');
};

const assertRuntimePatch = () => {
  const fixtureRoot = path.join(root, '.tmp', 'qq-runtime-patch-fixture');
  const dist = path.join(fixtureRoot, 'node_modules', '@sansenjian', 'qq-music-api', 'dist');
  const fixture = `
var debugLog$1 = () => {};
var getNamedCandidateEntries = (payload) => [
  ["data.mydiss.list", payload?.data?.mydiss?.list],
  ["data.mymusic", payload?.data?.mymusic],
  ["data.createdList", payload?.data?.createdList]
];
var extractPlaylists = (payload) => {
  const matchedEntry = getNamedCandidateEntries(payload).find(([, candidate]) => Array.isArray(candidate));
  if (matchedEntry) return matchedEntry[1];
  throw new Error("missing");
};
var getErrorMessage = (payload) => {
  return payload?.message || "error";
};
module.exports = { extractPlaylists };
`;
  rmSync(fixtureRoot, { recursive: true, force: true });
  mkdirSync(dist, { recursive: true });
  writeFileSync(path.join(dist, 'services.cjs'), fixture, 'utf8');
  writeFileSync(path.join(dist, 'services.js'), fixture, 'utf8');
  try {
    run(process.execPath, [path.join(root, 'music-api-plugins/qq/patch-runtime.cjs'), fixtureRoot]);
    const probe = `
      const api = require(${JSON.stringify(path.join(dist, 'services.cjs'))});
      const value = api.extractPlaylists({data:{mydiss:{list:[]},mymusic:[{dissid:'liked'}],createdList:[{dissid:'created'},{dissid:'liked'}]}});
      if (value.length !== 2 || value[0].dissid !== 'liked' || value[1].dissid !== 'created') process.exit(1);
    `;
    run(process.execPath, ['-e', probe]);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
};

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
try {
  assertStaticContract();
  assertRuntimePatch();
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
    path.join(root, 'scripts/java/QqHostContractProbe.java')
  ]);
  console.log(run(executable('java'), [
    '--add-modules', 'jdk.httpserver',
    '-cp', output,
    'QqHostContractProbe'
  ]));
} finally {
  rmSync(output, { recursive: true, force: true });
}
